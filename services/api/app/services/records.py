"""Candidate Records service layer over TinyDB.

Manages hiring pipeline candidates and their notes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from tinydb import TinyDB, where

from app.models.schemas import (
    CandidateNoteCreate,
    CandidateStage,
    CandidateStatus,
    RecordCreate,
    RecordPatch,
    RecordUpdate,
)

# Shared TinyDB file
_DB_PATH = Path(__file__).resolve().parent.parent.parent / "db.json"

RECORDS_TABLE = "records"
NOTES_TABLE = "candidate_notes"


def _get_db() -> TinyDB:
    return TinyDB(_DB_PATH)


def _build_record_response(doc, notes_count: int = 0) -> dict:
    """Assemble the public record payload."""
    return {
        "id": doc["id"],
        "full_name": doc["full_name"],
        "email": doc["email"],
        "phone": doc["phone"],
        "position": doc["position"],
        "linkedin_url": doc.get("linkedin_url"),
        "cv_url": doc.get("cv_url"),
        "status": doc.get("status", CandidateStatus.RECEIVED.value),
        "stage": doc.get("stage", CandidateStage.PENDING.value),
        "experience_years": doc["experience_years"],
        "notes_count": notes_count,
        "applied_at": doc["applied_at"],
        "updated_at": doc["updated_at"],
    }


def create_record(payload: RecordCreate) -> dict:
    """Create a candidate record."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)

    now = datetime.now(timezone.utc).isoformat()
    record_id = str(uuid.uuid4())

    records.insert(
        {
            "id": record_id,
            "full_name": payload.full_name,
            "email": payload.email,
            "phone": payload.phone,
            "position": payload.position,
            "linkedin_url": payload.linkedin_url,
            "cv_url": payload.cv_url,
            "status": CandidateStatus.RECEIVED.value,
            "stage": CandidateStage.PENDING.value,
            "experience_years": payload.experience_years,
            "applied_at": now,
            "updated_at": now,
        }
    )

    doc = records.get(where("id") == record_id)
    db.close()
    return _build_record_response(doc)


def list_records(
    page: int = 1, limit: int = 20, search: str | None = None
) -> tuple[list[dict], int]:
    """Return paginated records with optional search."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)
    notes = db.table(NOTES_TABLE)

    all_docs = records.all()

    # Filter by search term if provided
    if search:
        search_lower = search.lower()
        all_docs = [
            doc
            for doc in all_docs
            if search_lower in doc.get("full_name", "").lower()
            or search_lower in doc.get("email", "").lower()
            or search_lower in doc.get("position", "").lower()
        ]

    total = len(all_docs)

    # Sort by updated_at (newest first)
    all_docs.sort(key=lambda x: x.get("updated_at", ""), reverse=True)

    # Paginate
    start = (page - 1) * limit
    end = start + limit
    page_docs = all_docs[start:end]

    # Count notes for each record
    result = []
    for doc in page_docs:
        notes_count = len(notes.search(where("record_id") == doc["id"]))
        result.append(_build_record_response(doc, notes_count))

    db.close()
    return result, total


def get_record_by_id(record_id: str) -> dict | None:
    """Return a single record by id, or None."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)
    notes_table = db.table(NOTES_TABLE)

    doc = records.get(where("id") == record_id)
    if doc is None:
        db.close()
        return None

    notes_count = len(notes_table.search(where("record_id") == record_id))
    db.close()
    return _build_record_response(doc, notes_count)


def update_record(record_id: str, payload: RecordUpdate) -> dict | None:
    """Update all fields of a record. Returns None if not found."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)

    doc = records.get(where("id") == record_id)
    if doc is None:
        db.close()
        return None

    now = datetime.now(timezone.utc).isoformat()

    records.update(
        {
            "full_name": payload.full_name,
            "email": payload.email,
            "phone": payload.phone,
            "position": payload.position,
            "linkedin_url": payload.linkedin_url,
            "cv_url": payload.cv_url,
            "experience_years": payload.experience_years,
            "updated_at": now,
        },
        where("id") == record_id,
    )

    doc = records.get(where("id") == record_id)
    notes_count = len(db.table(NOTES_TABLE).search(where("record_id") == record_id))
    db.close()
    return _build_record_response(doc, notes_count)


def patch_record(record_id: str, payload: RecordPatch) -> dict | None:
    """Partially update a record (status/stage). Returns None if not found."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)

    doc = records.get(where("id") == record_id)
    if doc is None:
        db.close()
        return None

    now = datetime.now(timezone.utc).isoformat()
    data = payload.model_dump(exclude_unset=True)

    # Convert enums to values
    if "status" in data and data["status"] is not None:
        data["status"] = data["status"].value
    if "stage" in data and data["stage"] is not None:
        data["stage"] = data["stage"].value

    data["updated_at"] = now

    records.update(data, where("id") == record_id)

    doc = records.get(where("id") == record_id)
    notes_count = len(db.table(NOTES_TABLE).search(where("record_id") == record_id))
    db.close()
    return _build_record_response(doc, notes_count)


def delete_record(record_id: str) -> bool:
    """Delete a record and its notes. Returns False if not found."""
    db = _get_db()
    records = db.table(RECORDS_TABLE)
    notes = db.table(NOTES_TABLE)

    if records.get(where("id") == record_id) is None:
        db.close()
        return False

    records.remove(where("id") == record_id)
    # Cascade: remove all notes
    notes.remove(where("record_id") == record_id)
    db.close()
    return True


# ── Notes ──────────────────────────────────────────────────


def get_notes_by_record_id(record_id: str) -> list[dict]:
    """Return all notes for a record."""
    db = _get_db()
    notes = db.table(NOTES_TABLE)

    docs = notes.search(where("record_id") == record_id)
    # Sort by created_at (newest first)
    docs.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    result = [
        {
            "id": doc["id"],
            "record_id": doc["record_id"],
            "content": doc["content"],
            "created_at": doc["created_at"],
        }
        for doc in docs
    ]
    db.close()
    return result


def create_note(record_id: str, payload: CandidateNoteCreate) -> dict:
    """Create a note for a record."""
    db = _get_db()
    notes = db.table(NOTES_TABLE)

    now = datetime.now(timezone.utc).isoformat()
    note_id = str(uuid.uuid4())

    notes.insert(
        {
            "id": note_id,
            "record_id": record_id,
            "content": payload.content,
            "created_at": now,
        }
    )

    doc = notes.get(where("id") == note_id)
    db.close()
    return {
        "id": doc["id"],
        "record_id": doc["record_id"],
        "content": doc["content"],
        "created_at": doc["created_at"],
    }


def delete_note(note_id: str) -> bool:
    """Delete a note. Returns False if not found."""
    db = _get_db()
    notes = db.table(NOTES_TABLE)

    if notes.get(where("id") == note_id) is None:
        db.close()
        return False

    notes.remove(where("id") == note_id)
    db.close()
    return True
