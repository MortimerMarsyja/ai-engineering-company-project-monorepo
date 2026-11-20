"""Tasks router — generic Celery background-task status polling.

GET /tasks/{task_id}   poll a background task's state/result
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.celery_app import celery_app
from app.core.deps import get_current_user
from app.models.schemas import TaskStatusResponse
from app.models.user import STAFF_ROLES
from app.services import task_tracking

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Celery's own state names -> this API's lowercase contract. Anything not
# listed here (e.g. REVOKED) falls back to `.lower()` in the handler
# below, rather than being silently reported as one of these four.
_STATE_MAP = {
    "PENDING": "pending",
    "STARTED": "started",
    "SUCCESS": "success",
    "FAILURE": "failure",
    "RETRY": "retry",
}


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str, current_user: dict = Depends(get_current_user)):
    """Poll a background task's current state/result.

    Ownership: a task_id this API never issued (or that belongs to a
    different, non-staff user) is treated identically — 404/403 per the
    checks below — never silently answered from Celery's own backend,
    which has no concept of ownership at all.

    PENDING ambiguity: Celery's PENDING state is returned for THREE
    different real situations it cannot tell apart on its own — an id
    that was never submitted, one that's genuinely still queued, and one
    whose result already expired from the result backend
    (`result_expires`, see app/celery_app.py) after finishing. This
    endpoint resolves the first case itself (see the 404 below, backed by
    `task_submissions` — a task_id with no submission row is always
    reported as not-found, never as a Celery "pending" guess). For a
    task_id this API DID submit, a `"pending"` response still means
    either "still queued" or "result expired" — this endpoint does not
    claim to disambiguate those two; callers that need to know which
    should poll again well before `result_expires` (1 day) has elapsed.
    """
    submission = task_tracking.get_submission(task_id)
    if submission is None:
        # Never submitted via this API — follow this app's existing
        # unknown-id convention (404), same as GET /incidents/{id},
        # GET /users/{id}, etc. Deliberately checked BEFORE ever asking
        # Celery anything: AsyncResult(task_id) would happily report
        # PENDING for literally any string, which would incorrectly
        # imply the id might be real.
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    is_owner = submission["submitted_by"] is not None and submission["submitted_by"] == current_user["id"]
    is_staff = current_user.get("role") in STAFF_ROLES
    if not is_owner and not is_staff:
        raise HTTPException(
            status_code=403,
            detail="You do not have access rights to view this task.",
        )

    async_result = celery_app.AsyncResult(task_id)
    state = async_result.state
    status = _STATE_MAP.get(state, state.lower())

    result = None
    if state == "SUCCESS":
        # Tasks in this codebase only ever return plain, JSON-serializable
        # dicts (see app/tasks/incidents.py's own contract) — safe to
        # return directly.
        result = async_result.result
    elif state == "FAILURE":
        # Never the raw exception object or a traceback (async_result.result
        # for a FAILURE state IS the actual exception instance — not
        # JSON-serializable, and its str() could in principle echo
        # connection details from a DB driver error). The persisted
        # dead-letter row's error_message is this API's own, already
        # safe, already-truncated text; fall back to a generic message in
        # the narrow window between a terminal failure and the
        # task_failure signal handler finishing its write.
        dead_letter = task_tracking.get_dead_letter(task_id)
        result = {"error": dead_letter["error_message"] if dead_letter else "Task failed."}

    return {"task_id": task_id, "status": status, "result": result}
