# /// script
# requires-python = ">=3.11"
# dependencies = ["tinydb>=4.8.0", "pydantic>=2.0"]
# ///
"""Seed the TinyDB database with incidents from the legacy CSV report.

Reads the Brasaland incident-report CSV (incidents-context.md), validates
every row with the same shared validator the /incidents/analyze endpoint
uses (``app.services.incidents.validate_csv_row``), and inserts the valid
ones into the ``incidents`` TinyDB table with ``origin="customer"``.

Idempotent: re-running does not duplicate records. The CSV's `incident_id`
(e.g. BRS-000001) is reused as the incident's `id`, so a row already present
is skipped; if every row is already present the run is a no-op.

Usage (via uv):
    uv run seed-incidents [path/to/incidents.csv]
"""

from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

from tinydb import TinyDB, where

from app.services.incidents import INVALID_CSV_RECORDS_MESSAGE, validate_csv_row

DB_PATH = Path(__file__).parent / "db.json"
DEFAULT_CSV_PATH = Path(__file__).parent.parent.parent / "incidents.csv"


def _read_rows(csv_path: Path) -> list[dict]:
    """Read and parse the incidents CSV.

    Raises OSError (missing/unreadable file) or csv.Error (malformed CSV) —
    callers must catch these, print an informative message to stderr, and
    exit non-zero rather than let a raw traceback reach the operator.
    """
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        reader.fieldnames = [name.strip() for name in reader.fieldnames or []]
        return list(reader)


def seed(csv_path: Path = DEFAULT_CSV_PATH) -> None:
    try:
        rows = _read_rows(csv_path)
    except (OSError, csv.Error, UnicodeDecodeError) as exc:
        print(f"❌ Could not read CSV file '{csv_path}': {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        with TinyDB(DB_PATH) as db:
            table = db.table("incidents")

            existing_ids: set[str] = {doc["id"] for doc in table.all()}

            # Pre-validate so the idempotency check only counts rows that
            # would actually be inserted — permanently-invalid rows never
            # land in the table, so they must not block the "already
            # seeded" short-circuit.
            validated = [
                ((row.get("incident_id") or "").strip(), *validate_csv_row(row)) for row in rows
            ]
            valid_ids = {incident_id for incident_id, incident, errors in validated if not errors}

            if valid_ids and valid_ids.issubset(existing_ids):
                print(f"✅ Database already seeded with incidents ({len(valid_ids)} records found) — nothing to do.")
                return

            inserted = 0
            skipped_duplicate = 0
            invalid_count = 0
            invalid_reasons: dict[str, int] = {}

            for incident_id, incident, errors in validated:
                if errors:
                    invalid_count += 1
                    for rule in errors:
                        invalid_reasons[rule] = invalid_reasons.get(rule, 0) + 1
                    print(f"  ❌ Invalid ({', '.join(errors)}): {incident_id or '<missing incident_id>'}")
                    continue

                if incident_id in existing_ids:
                    skipped_duplicate += 1
                    print(f"  ⏭  Skipped (duplicate): {incident_id}")
                    continue

                now = incident.incident_date.isoformat() + "T00:00:00+00:00" if incident.incident_date else datetime.now(timezone.utc).isoformat()

                table.insert(
                    {
                        "id": incident_id,
                        **incident.model_dump(mode="json"),
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                existing_ids.add(incident_id)
                inserted += 1
                print(f"  ✅ Inserted: {incident_id} ({incident.category}, {incident.status.value})")

            total_in_db = len(table)

            print()
            print("─" * 50)
            print("  📊 Summary")
            print(f"     Inserted           : {inserted}")
            print(f"     Skipped (duplicate): {skipped_duplicate}")
            print(f"     Invalid            : {invalid_count}")
            print(f"     Total in DB        : {total_in_db}")
            print("─" * 50)

            if invalid_count:
                print(f"\n⚠️  {INVALID_CSV_RECORDS_MESSAGE} ({invalid_count} rows):")
                for rule, count in sorted(invalid_reasons.items(), key=lambda x: x[1], reverse=True):
                    print(f"     {rule}: {count}")
    except OSError as exc:
        # Disk full, permission denied, etc. — never expose the raw OS
        # error's internal path details beyond what the operator already
        # knows (the configured DB_PATH), and always fail loudly.
        print(f"❌ Could not write to the database: {exc}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """Entry point for `uv run seed-incidents [csv_path]`."""
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV_PATH

    print("🌱 Seeding Brasaland incidents into TinyDB …")
    print(f"   Database : {DB_PATH}")
    print(f"   Source   : {csv_path}")
    print()

    if not csv_path.exists():
        print(f"❌ CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    seed(csv_path)
    print("\nDone! ✨")


if __name__ == "__main__":
    main()
