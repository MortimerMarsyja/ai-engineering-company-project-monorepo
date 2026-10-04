"""Records router — hiring pipeline candidate management endpoints.

GET    /records               list candidates with pagination and search
POST   /records               create a new candidate record
GET    /records/{id}          get a single candidate record
PUT    /records/{id}          update all fields of a record
PATCH  /records/{id}          update status/stage only
DELETE /records/{id}          delete a candidate record
GET    /records/{id}/notes    get all notes for a record
POST   /records/{id}/notes    add a note to a record
DELETE /records/{id}/notes/{note_id}  delete a note
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.models.schemas import (
    CandidateNoteCreate,
    CandidateResponse,
    RecordCreate,
    RecordPatch,
    RecordUpdate,
)
from app.services import records as records_service

router = APIRouter(prefix="/records", tags=["records"])


# ── GET /records ──────────────────────────────────────────
@router.get("")
async def list_records(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """List all candidate records with pagination and search."""
    data, total = records_service.list_records(page, limit, search)
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
    }


# ── POST /records ─────────────────────────────────────────
@router.post("", response_model=CandidateResponse, status_code=201)
async def create_record(
    payload: RecordCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new candidate record."""
    record = records_service.create_record(payload)
    return record


# ── GET /records/{id} ─────────────────────────────────────
@router.get("/{record_id}", response_model=CandidateResponse)
async def get_record(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single candidate record by ID."""
    record = records_service.get_record_by_id(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
    return record


# ── PUT /records/{id} ─────────────────────────────────────
@router.put("/{record_id}", response_model=CandidateResponse)
async def update_record(
    record_id: str,
    payload: RecordUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update all fields of a candidate record."""
    record = records_service.update_record(record_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
    return record


# ── PATCH /records/{id} ───────────────────────────────────
@router.patch("/{record_id}", response_model=CandidateResponse)
async def patch_record(
    record_id: str,
    payload: RecordPatch,
    current_user: dict = Depends(get_current_user),
):
    """Partially update a record (status/stage only)."""
    record = records_service.patch_record(record_id, payload)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
    return record


# ── DELETE /records/{id} ──────────────────────────────────
@router.delete("/{record_id}", status_code=204)
async def delete_record(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a candidate record and all its notes."""
    if not records_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")


# ── GET /records/{id}/notes ───────────────────────────────
@router.get("/{record_id}/notes")
async def get_notes(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all notes for a candidate record."""
    # Verify record exists
    record = records_service.get_record_by_id(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")

    notes = records_service.get_notes_by_record_id(record_id)
    return {"data": notes, "meta": {"total": len(notes)}}


# ── POST /records/{id}/notes ──────────────────────────────
@router.post("/{record_id}/notes", status_code=201)
async def create_note(
    record_id: str,
    payload: CandidateNoteCreate,
    current_user: dict = Depends(get_current_user),
):
    """Add a note to a candidate record."""
    # Verify record exists
    record = records_service.get_record_by_id(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record {record_id} not found")

    note = records_service.create_note(record_id, payload)
    return note


# ── DELETE /records/{id}/notes/{note_id} ──────────────────
@router.delete("/{record_id}/notes/{note_id}", status_code=204)
async def delete_note(
    record_id: str,
    note_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a note from a candidate record."""
    if not records_service.delete_note(note_id):
        raise HTTPException(status_code=404, detail=f"Note {note_id} not found")
