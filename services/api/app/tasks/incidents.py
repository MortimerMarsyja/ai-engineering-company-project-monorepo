"""Celery task: the heavy operation moved off the request process.

Chosen operation: POST /incidents/analyze — the CSV-upload-driven
incident analysis + bulk persistence endpoint
(app/routers/incidents.py / app/services/incidents.py::analyze). Of every
endpoint in this API, it was the clearest fit:

- It's genuinely heavy: parsing an uploaded CSV and inserting one row per
  valid incident is open-ended work proportional to file size, run
  synchronously inside the request today — a large upload ties up a
  request/worker thread for the whole duration.
- Its validation is already cleanly separable from its execution: content-
  type/empty-file/CSV-parseability checks happen before `analyze()` is
  ever called (see the router), so "validate, then enqueue" falls out of
  the existing code structure rather than requiring a rewrite.
- Its heavy step already takes a plain, JSON-serializable input
  (`rows: list[dict]`, the parsed CSV) and returns a plain,
  JSON-serializable output (the summary dict) — no request object, no ORM
  session, nothing to adapt for Celery's serialization contract.

(The alternative candidate, POST /reporting/pipeline-runs, already runs
its heavy work — a full Prefect-orchestrated ETL flow, with its own
retry/idempotency machinery in data/pipelines/weekly-location-performance/
— via FastAPI BackgroundTasks. Moving it under Celery would mean nesting
one orchestration system's retries/locking inside another's for no real
benefit, and documented in the handler as the reason it was not the
chosen candidate.)
"""

from __future__ import annotations

import logging
import time

from celery.exceptions import Retry
from sqlalchemy.exc import DBAPIError, OperationalError

from app.celery_app import celery_app
from app.services import task_tracking
from app.services import users as users_service
from app.services.incidents import analyze

logger = logging.getLogger("app.tasks.incidents")

MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 2  # -> 2s, 4s, 8s between attempts 1->2, 2->3, 3->4

# Exceptions worth retrying: transient infrastructure failures where the
# exact same call is expected to succeed on a later attempt (a dropped
# connection, a transient pool timeout). Never includes validation/
# authorization failures — see PermanentTaskError below, which is raised
# directly and never passes through the retry path.
_TRANSIENT_EXCEPTIONS = (OperationalError, DBAPIError, ConnectionError)


class PermanentTaskError(Exception):
    """A non-retryable failure — e.g. the submitting user is no longer
    active. Celery records this as an immediate FAILURE on the first
    attempt (attempt_number=1); it is never retried."""


@celery_app.task(
    bind=True,
    name="app.tasks.incidents.process_incidents_csv",
    max_retries=MAX_RETRIES,
)
def process_incidents_csv(self, rows: list[dict], submitted_by: int | None) -> dict:
    """Runs app.services.incidents.analyze() in the worker — rows is
    already-parsed CSV content (plain list[dict], JSON-serializable),
    never the raw upload or a request object; submitted_by is the
    submitting user's id (plain int), never a Request/session.

    Idempotency: before persisting, checks
    task_tracking.is_already_persisted(task_id) — true only if a PRIOR
    attempt of this exact task_id already got far enough to insert rows.
    If so, this attempt recomputes the summary WITHOUT persisting again
    (analyze(..., persist=False)), so a transient failure that triggers a
    Celery retry can never insert the same CSV's rows twice. This is the
    "smallest necessary safeguard" for this operation: `analyze()`
    already has a `persist` parameter, so no change to its signature was
    needed — only a one-row marker table (task_submissions.persisted_at)
    recording whether THIS task_id has crossed that point before.
    """
    task_id = self.request.id
    attempt_number = self.request.retries + 1
    started_at = time.monotonic()

    def _log(level: int, status: str, **fields: object) -> None:
        duration_s = time.monotonic() - started_at
        parts = [f"task_id={task_id}", f"attempt={attempt_number}", f"status={status}", f"duration_s={duration_s:.3f}"]
        for key, value in fields.items():
            parts.append(f"{key}={value}")
        logger.log(level, " ".join(parts))

    # ── Permanent, non-retryable check ───────────────────────────────
    if submitted_by is not None:
        submitter = users_service.get_user_by_id(submitted_by)
        if submitter is None or not submitter.get("is_active", True):
            error = PermanentTaskError(
                f"Submitting user {submitted_by} is no longer active; refusing to process this CSV."
            )
            _log(logging.ERROR, "failure", reason="submitter_inactive")
            raise error

    # ── Heavy work, with transient-failure retry ─────────────────────
    try:
        already_persisted = task_tracking.is_already_persisted(task_id)
        result = analyze(rows, persist=not already_persisted)
    except _TRANSIENT_EXCEPTIONS as exc:
        if self.request.retries >= MAX_RETRIES:
            # Final attempt already exhausted — let this propagate as
            # the real FAILURE (self.retry() below would just re-raise
            # it anyway; this branch only exists to make that fact
            # explicit rather than relying on Celery's internal check).
            _log(logging.ERROR, "failure", error=repr(exc))
            raise
        countdown = BASE_BACKOFF_SECONDS * (2**self.request.retries)
        _log(logging.WARNING, "retry", error=repr(exc), countdown_s=countdown)
        raise self.retry(exc=exc, countdown=countdown, max_retries=MAX_RETRIES)
    except Retry:
        raise  # Celery's own control-flow exception — never log/wrap this as a failure.
    except Exception as exc:
        # Anything else (a bug, an unexpected error type) is treated as
        # non-retryable: retrying the exact same input against the exact
        # same code path would fail identically every time.
        _log(logging.ERROR, "failure", error=repr(exc))
        raise

    if not already_persisted:
        task_tracking.mark_persisted(task_id)

    _log(
        logging.INFO,
        "success",
        total_rows=result["total_rows"],
        persisted_count=result["persisted_count"],
        already_persisted=already_persisted,
    )
    return result
