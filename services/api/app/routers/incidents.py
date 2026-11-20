"""Incidents router — Incident Manager CRUD, leadership metrics, and the
legacy CSV upload analysis/export endpoints.

GET    /incidents                list incidents with filters + pagination
POST   /incidents                create a new incident
GET    /incidents/metrics        leadership aggregation (staff only)
POST   /incidents/analyze        upload a CSV, validate + persist + summarise
GET    /incidents/result/export  download the last analysis as CSV
GET    /incidents/{id}           get a single incident
PATCH  /incidents/{id}           edit an incident's fields
PATCH  /incidents/{id}/status    transition an incident's lifecycle status
"""

from __future__ import annotations

import io
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.core import cache
from app.core.deps import get_current_user, require_any_user, require_staff
from app.models.schemas import (
    DataEnvelope,
    IncidentCreate,
    IncidentMetricsResponse,
    IncidentResponse,
    IncidentStatusUpdate,
    IncidentUpdate,
    PaginatedResponse,
    TaskSubmissionResponse,
)
from app.services import task_tracking
from app.services.incidents import (
    create_incident,
    get_incident_by_id,
    get_incident_metrics,
    list_incidents,
    read_csv_from_bytes,
    results_to_csv_bytes,
    update_incident,
    update_incident_status,
)
from app.tasks.incidents import process_incidents_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])

# In-memory cache for the last analysis (per session / global for simplicity)
_last_analysis: Optional[dict] = None

# See docs/cache-evaluation.md: /incidents/metrics is a heavy in-memory
# aggregation over a dashboard that tolerates some staleness, so it's
# cached with a short TTL and invalidated on any incident write.
_METRICS_CACHE_KEY = "incidents:metrics"
_METRICS_CACHE_TTL_SECONDS = 45


# ── GET /incidents ─────────────────────────────────────────
@router.get("", response_model=PaginatedResponse[IncidentResponse])
async def list_incidents_route(
    status: str | None = None,
    category: str | None = None,
    branch: str | None = None,
    origin: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """List incidents with optional filters and pagination."""
    data, total = list_incidents(
        status=status,
        category=category,
        branch=branch,
        origin=origin,
        search=search,
        page=page,
        limit=limit,
    )
    return {"data": data, "total": total, "page": page, "limit": limit}


# ── POST /incidents ────────────────────────────────────────
@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident_route(
    payload: IncidentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Log a new incident (branch staff, HQ, or a customer-reported issue)."""
    incident = create_incident(payload)
    cache.invalidate_prefix(_METRICS_CACHE_KEY)
    return incident


# ── GET /incidents/metrics ─────────────────────────────────
@router.get("/metrics", response_model=DataEnvelope[IncidentMetricsResponse])
async def get_incident_metrics_route(current_user: dict = Depends(require_staff)):
    """Aggregated incident metrics for leadership (cached, see docs/cache-evaluation.md)."""
    metrics = cache.get(_METRICS_CACHE_KEY)
    if metrics is None:
        metrics = get_incident_metrics()
        cache.set(_METRICS_CACHE_KEY, metrics, _METRICS_CACHE_TTL_SECONDS)
    return {"data": metrics}


# ── POST /incidents/analyze ────────────────────────────────
@router.post("/analyze", response_model=TaskSubmissionResponse, status_code=202)
async def analyze_incidents(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_any_user),
):
    """
    Accept a CSV file via multipart/form-data, validate + parse it
    synchronously (same checks as before), then enqueue the actual
    analysis + persistence as a Celery background task and return 202
    immediately with the task's id — poll GET /tasks/{task_id} for the
    outcome.

    Moved off the request process because `analyze()` (parse + validate +
    insert every valid row) is open-ended work proportional to file size;
    see app/tasks/incidents.py's module docstring for why this endpoint
    was chosen over the alternative candidate.

    Request validation/authorization all still happen here, before
    anything is enqueued — only already-parsed, JSON-serializable `rows`
    cross into the task, never the UploadFile/Request itself.

    NOTE: this endpoint no longer populates the in-memory `_last_analysis`
    global GET /incidents/result/export reads (that export endpoint
    predates this change and was never part of this task's scope to
    redesign) — the analysis now runs in a separate worker process, which
    cannot share a Python global with this one. See the PR description
    for this known, documented limitation.
    """
    # ── Validate content-type hint ──────────────────────────
    if file.content_type and "csv" not in file.content_type and "octet-stream" not in file.content_type:
        # Some clients send text/plain for CSV — allow it.
        # Only reject clearly wrong types like image/*.
        if file.content_type.startswith("image/") or file.content_type.startswith("video/"):
            raise HTTPException(
                status_code=422,
                detail="Invalid file type. Expected a CSV file.",
            )

    # ── Read content ────────────────────────────────────────
    content = await file.read()

    if not content or len(content.strip()) == 0:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty. Please provide a valid CSV file.",
        )

    # ── Parse CSV ───────────────────────────────────────────
    try:
        rows = read_csv_from_bytes(content)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"CSV format error: {exc}",
        )
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail="File encoding error. Please upload a UTF-8 encoded CSV file.",
        )
    except Exception:
        # Anything else from csv.DictReader (malformed quoting, etc.) — log
        # the real cause server-side, never echo it back to the client.
        logger.exception("Unexpected error while parsing uploaded incidents CSV")
        raise HTTPException(
            status_code=422,
            detail="Could not read the CSV file. Please check the format and try again.",
        )

    # ── Enqueue (never run the heavy analysis in this process) ───────
    # task_id is generated here (not left to Celery) and the submission
    # row is written BEFORE the broker publish is even attempted: the
    # task must never be able to start executing before
    # task_submissions has a row for it (the worker's idempotency guard
    # and GET /tasks/{id}'s ownership check both depend on that row
    # existing) — see app/services/task_tracking.py's module docstring.
    task_id = str(uuid.uuid4())
    task_tracking.record_submission(
        task_id=task_id,
        task_name=process_incidents_csv.name,
        submitted_by=current_user["id"],
    )

    try:
        process_incidents_csv.apply_async(args=[rows, current_user["id"]], task_id=task_id)
    except Exception:
        # The broker never accepted the task — it will never run, so the
        # submission row would only be a permanent, misleading "not found"
        # trap for GET /tasks/{id}. Clean it up and report a real error
        # instead of 202.
        logger.exception("Failed to publish incidents-CSV task %s to the broker", task_id)
        task_tracking.delete_submission(task_id)
        raise HTTPException(
            status_code=503,
            detail="Could not queue this file for processing right now. Please try again.",
        )

    return {"task_id": task_id}


# ── GET /incidents/result/export ───────────────────────────
@router.get("/result/export")
async def export_results(current_user: dict = Depends(require_any_user)):
    """
    Return the last analysis results as a downloadable CSV file (authenticated).
    If no analysis has been performed yet, return 404.
    """
    if _last_analysis is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis results available. POST a CSV to /api/incidents/analyze first.",
        )

    csv_bytes = results_to_csv_bytes(_last_analysis)
    buffer = io.BytesIO(csv_bytes)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="incident_analysis_results.csv"',
        },
    )


# ── GET /incidents/{id} ─────────────────────────────────────
@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single incident by ID."""
    incident = get_incident_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


# ── PATCH /incidents/{id} ───────────────────────────────────
@router.patch("/{incident_id}", response_model=IncidentResponse)
async def patch_incident(
    incident_id: str,
    payload: IncidentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Edit an incident's fields (title/description/category/branch/...)."""
    incident = update_incident(incident_id, payload)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    cache.invalidate_prefix(_METRICS_CACHE_KEY)
    return incident


# ── PATCH /incidents/{id}/status ────────────────────────────
@router.patch("/{incident_id}/status", response_model=IncidentResponse)
async def patch_incident_status(
    incident_id: str,
    payload: IncidentStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Transition an incident through its lifecycle (open -> in_progress -> resolved, or -> discarded)."""
    try:
        incident = update_incident_status(incident_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    cache.invalidate_prefix(_METRICS_CACHE_KEY)
    return incident
