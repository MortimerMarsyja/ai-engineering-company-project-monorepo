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
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user, require_any_user, require_staff
from app.models.schemas import (
    IncidentCreate,
    IncidentResponse,
    IncidentStatusUpdate,
    IncidentUpdate,
)
from app.services.incidents import (
    analyze,
    create_incident,
    get_incident_by_id,
    get_incident_metrics,
    list_incidents,
    read_csv_from_bytes,
    results_to_csv_bytes,
    results_to_summary_json,
    update_incident,
    update_incident_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])

# In-memory cache for the last analysis (per session / global for simplicity)
_last_analysis: Optional[dict] = None


# ── GET /incidents ─────────────────────────────────────────
@router.get("")
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
    return create_incident(payload)


# ── GET /incidents/metrics ─────────────────────────────────
@router.get("/metrics")
async def get_incident_metrics_route(current_user: dict = Depends(require_staff)):
    """Aggregated incident metrics for leadership."""
    return {"data": get_incident_metrics()}


# ── POST /incidents/analyze ────────────────────────────────
@router.post("/analyze")
async def analyze_incidents(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_any_user),
):
    """
    Accept a CSV file via multipart/form-data, run the same validation
    analysis as ``analyze.py``, persist valid rows into the incidents
    table, and return a JSON summary (authenticated).
    """
    global _last_analysis

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

    # ── Analyse + persist ───────────────────────────────────
    try:
        results = analyze(rows)
    except Exception:
        logger.exception("Unexpected error while analyzing incidents CSV")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong analyzing this file. Please try again.",
        )

    # Cache results for the export endpoint
    _last_analysis = results

    summary = results_to_summary_json(results)
    return {"status": "ok", "data": summary}


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
    return incident
