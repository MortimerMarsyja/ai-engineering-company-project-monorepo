"""Incident Manager service — CRUD + metrics over TinyDB, plus the CSV
analysis/import pipeline (a port of analyze.py) that feeds the same table.
"""

from __future__ import annotations

import csv
import io
import logging
import uuid
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

from tinydb import TinyDB, where

from app.models.schemas import (
    INCIDENT_STATUS_TRANSITIONS,
    IncidentCreate,
    IncidentOrigin,
    IncidentStatus,
    IncidentStatusUpdate,
    IncidentUpdate,
)

logger = logging.getLogger(__name__)

# Shared TinyDB file
_DB_PATH = Path(__file__).resolve().parent.parent.parent / "db.json"

INCIDENTS_TABLE = "incidents"

# ── Constants (mirrored from analyze.py / incidents-context.md) ──

VALID_LOCATIONS = {f"COL-{i:02d}" for i in range(1, 11)} | {
    f"FLA-{i:02d}" for i in range(1, 5)
}
VALID_CATEGORIES = {
    "CUSTOMER_COMPLAINT",
    "EQUIPMENT",
    "SUPPLY",
    "FOOD_QUALITY",
    "STAFF",
}
VALID_STATUSES = {"OPEN", "CLOSED", "DISCARDED"}

# Legacy CSV status -> new lifecycle status.
CSV_STATUS_TO_LIFECYCLE = {
    "OPEN": IncidentStatus.OPEN,
    "CLOSED": IncidentStatus.RESOLVED,
    "DISCARDED": IncidentStatus.DISCARDED,
}

SCORE_LABELS = {
    1: "Very dissatisfied",
    2: "Dissatisfied",
    3: "Neutral",
    4: "Satisfied",
    5: "Very satisfied",
}

RULE_LABELS = {
    "missing_location_id": "Missing location_id",
    "invalid_category": "Invalid or missing category",
    "empty_description": "Empty description",
    "missing_reporter_id": "Missing reporter_id",
    "closed_no_score": "Closed case, no score",
    "score_out_of_range": "Score out of range (1-5)",
    "persist_failed": "Could not be saved",
}

EXPECTED_COLUMNS = {
    "incident_id",
    "date",
    "location_id",
    "category",
    "description",
    "status",
    "reporter_id",
}

INVALID_CSV_RECORDS_MESSAGE = "invalid CSV records are not inserted"


def _get_db() -> TinyDB:
    return TinyDB(_DB_PATH)


# ── Shared CSV validation (used by /incidents/analyze AND seed_incidents.py) ──


def _validate_record(row: dict) -> list[str]:
    """Validate a single CSV row against incidents-context.md's rules.

    Returns the list of rule names that failed (empty list = valid).
    """
    errors: list[str] = []

    location = (row.get("location_id") or "").strip()
    if location not in VALID_LOCATIONS:
        errors.append("missing_location_id")

    category = (row.get("category") or "").strip()
    if category not in VALID_CATEGORIES:
        errors.append("invalid_category")

    description = (row.get("description") or "").strip()
    if len(description) < 5:
        errors.append("empty_description")

    reporter = (row.get("reporter_id") or "").strip()
    if not reporter:
        errors.append("missing_reporter_id")

    status = (row.get("status") or "").strip().upper()
    score_raw = (row.get("satisfaction_score") or "").strip()

    if status == "CLOSED" and not score_raw:
        errors.append("closed_no_score")
    elif score_raw:
        try:
            score = int(score_raw)
            if score < 1 or score > 5:
                errors.append("score_out_of_range")
        except ValueError:
            errors.append("score_out_of_range")

    return errors


def validate_csv_row(row: dict) -> tuple[IncidentCreate | None, list[str]]:
    """Validate + transform one legacy CSV row into the unified Incident model.

    Returns ``(incident, [])`` on success or ``(None, failed_rule_names)``
    when any of incidents-context.md's invalid-record rules fire. This is
    the single source of truth both ``analyze()`` (CSV upload) and
    ``seed_incidents.py`` call, so invalid rows are judged identically and
    never silently inserted — see ``INVALID_CSV_RECORDS_MESSAGE``.
    """
    errors = _validate_record(row)
    if errors:
        return None, errors

    description = row["description"].strip()
    title = description if len(description) <= 60 else description[:60].rstrip() + "…"

    status = CSV_STATUS_TO_LIFECYCLE[row["status"].strip().upper()]

    score_raw = (row.get("satisfaction_score") or "").strip()
    satisfaction_score = int(score_raw) if score_raw else None

    customer_id = (row.get("customer_id") or "").strip() or None

    incident = IncidentCreate(
        title=title,
        description=description,
        category=row["category"].strip(),
        status=status,
        origin=IncidentOrigin.CUSTOMER,
        branch=row["location_id"].strip(),
        customer_id=customer_id,
        satisfaction_score=satisfaction_score,
        reporter_id=row["reporter_id"].strip(),
        incident_date=date.fromisoformat(row["date"].strip()),
    )
    return incident, []


def read_csv_from_bytes(content: bytes) -> list[dict]:
    """Parse CSV bytes into a list of dicts. Raises ValueError on empty or bad format."""
    text = content.decode("utf-8-sig")  # handles BOM
    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise ValueError("The CSV file has no header row.")

    # Normalise header names (strip whitespace)
    reader.fieldnames = [f.strip() for f in reader.fieldnames]

    rows = list(reader)

    if not rows:
        raise ValueError("The CSV file contains no data rows.")

    return rows


def analyze(rows: list[dict], *, persist: bool = True) -> dict:
    """Validate + summarise all rows, persisting valid ones into the incidents table."""
    valid_rows: list[dict] = []
    invalid_rows: list[dict] = []

    invalid_reasons: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    score_counts: Counter[int] = Counter()
    persisted_count = 0

    for row in rows:
        incident, errors = validate_csv_row(row)
        if errors:
            invalid_rows.append(row)
            for e in errors:
                invalid_reasons[e] += 1
            continue

        if persist:
            try:
                create_incident(incident)
            except Exception:
                # Scoped to just the DB write: one bad row (disk full, a
                # concurrent write conflict, etc.) must not abort the rest
                # of the batch or get counted as if it had been saved.
                logger.exception(
                    "Failed to persist incident row during CSV analyze (incident_id=%s)",
                    row.get("incident_id"),
                )
                invalid_rows.append(row)
                invalid_reasons["persist_failed"] += 1
                continue
            persisted_count += 1

        valid_rows.append(row)
        category_counts[row["category"].strip()] += 1
        status_counts[row["status"].strip().upper()] += 1

    # Satisfaction scores (only from valid closed cases with scores)
    total_closed = status_counts.get("CLOSED", 0)
    for row in valid_rows:
        if row["status"].strip().upper() == "CLOSED":
            score_raw = (row.get("satisfaction_score") or "").strip()
            if score_raw:
                score_counts[int(score_raw)] += 1

    total_scored = sum(score_counts.values())
    avg_score = (
        sum(s * c for s, c in score_counts.items()) / total_scored
        if total_scored
        else 0
    )

    return {
        "total_rows": len(rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "invalid_reasons": dict(invalid_reasons),
        "category_counts": dict(category_counts),
        "status_counts": dict(status_counts),
        "total_closed": total_closed,
        "total_scored": total_scored,
        "score_counts": {str(k): v for k, v in score_counts.items()},
        "avg_score": round(avg_score, 2),
        "persisted_count": persisted_count,
    }


def results_to_summary_json(results: dict) -> dict:
    """Build a clean JSON-friendly summary from raw analysis results."""
    summary = {
        "total_records": results["total_rows"],
        "valid_records": results["valid_count"],
        "invalid_records": results["invalid_count"],
        "persisted_records": results.get("persisted_count", 0),
        "invalid_breakdown": [
            {"rule": rule, "label": RULE_LABELS.get(rule, rule), "count": count}
            for rule, count in sorted(
                results["invalid_reasons"].items(), key=lambda x: x[1], reverse=True
            )
        ],
        "category_breakdown": [
            {
                "category": cat,
                "count": count,
                "percentage": round(
                    count / results["valid_count"] * 100, 1
                )
                if results["valid_count"]
                else 0,
            }
            for cat, count in sorted(
                results["category_counts"].items(), key=lambda x: x[1], reverse=True
            )
        ],
        "status_breakdown": [
            {
                "status": st,
                "count": count,
                "percentage": round(
                    count / results["valid_count"] * 100, 1
                )
                if results["valid_count"]
                else 0,
            }
            for st in ["OPEN", "CLOSED", "DISCARDED"]
            if (count := results["status_counts"].get(st, 0)) > 0
        ],
        "satisfaction_index": {
            "total_closed": results["total_closed"],
            "scored_cases": results["total_scored"],
            "average_score": results["avg_score"],
            "score_distribution": [
                {
                    "score": s,
                    "label": SCORE_LABELS[s],
                    "count": results["score_counts"].get(str(s), 0),
                }
                for s in range(1, 6)
            ],
        },
    }
    if results["invalid_count"]:
        summary["note"] = INVALID_CSV_RECORDS_MESSAGE
    return summary


def results_to_csv_bytes(results: dict) -> bytes:
    """Serialize analysis results to a CSV string encoded as UTF-8 bytes."""
    buf = io.StringIO()
    writer = csv.writer(buf)

    # Header
    writer.writerow(["Metric", "Value"])

    # Totals
    writer.writerow(["Total Records", results["total_rows"]])
    writer.writerow(["Valid Records", results["valid_count"]])
    writer.writerow(["Invalid Records", results["invalid_count"]])
    writer.writerow([])

    # Invalid breakdown
    writer.writerow(["Invalid Reason", "Count"])
    for rule, count in sorted(
        results["invalid_reasons"].items(), key=lambda x: x[1], reverse=True
    ):
        writer.writerow([rule, count])
    writer.writerow([])

    # Category breakdown
    writer.writerow(["Category", "Count"])
    for cat in [
        "CUSTOMER_COMPLAINT",
        "EQUIPMENT",
        "SUPPLY",
        "FOOD_QUALITY",
        "STAFF",
    ]:
        writer.writerow([cat, results["category_counts"].get(cat, 0)])
    writer.writerow([])

    # Status breakdown
    writer.writerow(["Status", "Count"])
    for st in ["OPEN", "CLOSED", "DISCARDED"]:
        writer.writerow([st, results["status_counts"].get(st, 0)])
    writer.writerow([])

    # Satisfaction scores
    writer.writerow(["Satisfaction Score", "Count"])
    for s in range(1, 6):
        writer.writerow(
            [f"{s} - {SCORE_LABELS[s]}", results["score_counts"].get(str(s), 0)]
        )
    writer.writerow(["Average Score", f"{results['avg_score']:.2f}"])

    return buf.getvalue().encode("utf-8")


# ── CRUD ───────────────────────────────────────────────────────


def create_incident(payload: IncidentCreate) -> dict:
    """Create an incident. Returns the persisted document."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(mode="json"),
        "created_at": now,
        "updated_at": now,
    }

    with _get_db() as db:
        db.table(INCIDENTS_TABLE).insert(doc)
    return doc


def list_incidents(
    *,
    status: str | None = None,
    category: str | None = None,
    branch: str | None = None,
    origin: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[dict], int]:
    """Return paginated incidents, newest first, with optional filters."""
    with _get_db() as db:
        docs = db.table(INCIDENTS_TABLE).all()

    if status:
        docs = [d for d in docs if d.get("status") == status]
    if category:
        docs = [d for d in docs if d.get("category") == category]
    if branch:
        docs = [d for d in docs if d.get("branch") == branch]
    if origin:
        docs = [d for d in docs if d.get("origin") == origin]
    if search:
        needle = search.lower()
        docs = [
            d
            for d in docs
            if needle in d.get("title", "").lower()
            or needle in d.get("description", "").lower()
        ]

    total = len(docs)
    docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)

    start = (page - 1) * limit
    end = start + limit
    page_docs = docs[start:end]

    return page_docs, total


def get_incident_by_id(incident_id: str) -> dict | None:
    with _get_db() as db:
        return db.table(INCIDENTS_TABLE).get(where("id") == incident_id)


def update_incident(incident_id: str, payload: IncidentUpdate) -> dict | None:
    """Partially update an incident's editable fields. Returns None if not found."""
    with _get_db() as db:
        table = db.table(INCIDENTS_TABLE)

        if table.get(where("id") == incident_id) is None:
            return None

        data = payload.model_dump(exclude_unset=True, mode="json")
        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        table.update(data, where("id") == incident_id)
        return table.get(where("id") == incident_id)


def update_incident_status(incident_id: str, payload: IncidentStatusUpdate) -> dict | None:
    """Transition an incident's lifecycle status. Returns None if not found.

    Raises ValueError for an illegal transition or a resolve attempt with no
    satisfaction score on file.
    """
    with _get_db() as db:
        table = db.table(INCIDENTS_TABLE)

        doc = table.get(where("id") == incident_id)
        if doc is None:
            return None

        current = IncidentStatus(doc["status"])
        target = payload.status

        if target != current and target not in INCIDENT_STATUS_TRANSITIONS.get(current, set()):
            raise ValueError(f"Cannot transition incident from {current.value} to {target.value}")

        score = payload.satisfaction_score if payload.satisfaction_score is not None else doc.get("satisfaction_score")
        if target is IncidentStatus.RESOLVED and score is None:
            raise ValueError("Resolved incidents require a satisfaction score")

        update_fields: dict = {
            "status": target.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if payload.satisfaction_score is not None:
            update_fields["satisfaction_score"] = payload.satisfaction_score

        table.update(update_fields, where("id") == incident_id)
        return table.get(where("id") == incident_id)


def get_incident_metrics() -> dict:
    """Aggregate incidents for the leadership dashboard."""
    with _get_db() as db:
        docs = db.table(INCIDENTS_TABLE).all()

    status_counts = Counter(d.get("status") for d in docs)
    category_counts = Counter(d.get("category") for d in docs)
    branch_counts = Counter(d.get("branch") for d in docs)
    origin_counts = Counter(d.get("origin") for d in docs)

    resolved_docs = [d for d in docs if d.get("status") == IncidentStatus.RESOLVED.value]
    scores = [
        d["satisfaction_score"]
        for d in resolved_docs
        if d.get("satisfaction_score") is not None
    ]
    avg_satisfaction_score = round(sum(scores) / len(scores), 2) if scores else None

    resolution_seconds: list[float] = []
    for d in resolved_docs:
        try:
            created = datetime.fromisoformat(d["created_at"])
            updated = datetime.fromisoformat(d["updated_at"])
            resolution_seconds.append((updated - created).total_seconds())
        except (KeyError, ValueError):
            continue
    avg_resolution_seconds = (
        round(sum(resolution_seconds) / len(resolution_seconds), 2)
        if resolution_seconds
        else None
    )

    return {
        "total": len(docs),
        "status_counts": dict(status_counts),
        "category_counts": dict(category_counts),
        "branch_counts": dict(branch_counts),
        "origin_counts": dict(origin_counts),
        "avg_satisfaction_score": avg_satisfaction_score,
        "avg_resolution_seconds": avg_resolution_seconds,
    }
