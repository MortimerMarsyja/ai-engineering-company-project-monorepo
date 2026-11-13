"""telemetry_kpi_daily — PLACEHOLDER entry point for Milestone 6's daily
telemetry KPI pipeline.

No "Milestone 6" briefing/spec exists anywhere in this repo as of this
module's creation (confirmed by an exhaustive search of docs/ and
CONTEXT*.md) — there is no real daily KPI business logic to implement
yet. This module exists solely to give scripts/nightly_export.py a real,
runnable subprocess with the exact interface the task asked for
(`python -m data.pipelines.telemetry_kpi_daily.run --no-prefect`), so the
rest of that script's contract (registering the run in job_runs, locking,
idempotency, exit codes) can be implemented and tested against something
real instead of a mock. Replace this module's body with the actual
Milestone 6 pipeline when that spec exists — nightly_export.py's
subprocess invocation (see its PIPELINE_COMMAND) does not need to change
when you do, as long as the new pipeline keeps accepting --target-date
and exits 0/non-zero the same way.

What this placeholder actually does: reads --target-date, queries
telemetry_events for that UTC calendar day (reusing
app.models.telemetry_storage.fetch_telemetry_events_dataframe — the same
function the weekly-location-performance pipeline's extraction and the
GET /telemetry/report endpoint already use, so this never duplicates that
query), and logs the row count. It deliberately reads the DATABASE, never
the CSV export — the CSV is nightly_export.py's own backup/audit copy,
never a pipeline input (see that script's module docstring).

Run:
    python -m data.pipelines.telemetry_kpi_daily.run --target-date 2026-07-13 --no-prefect
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("telemetry_kpi_daily")

# `app.*` (services/api) is a sibling of `data/`, not importable by
# default — same cross-directory sys.path bootstrap
# app/services/reporting.py and data/pipelines/pipeline.py already use
# for this exact situation.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SERVICES_API_DIR = _REPO_ROOT / "services" / "api"
if str(_SERVICES_API_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVICES_API_DIR))


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target-date",
        required=True,
        help="UTC calendar day to process, YYYY-MM-DD.",
    )
    parser.add_argument(
        "--no-prefect",
        action="store_true",
        help=(
            "Accepted for interface compatibility with the reference command "
            "this task specified. This placeholder never uses Prefect "
            "either way; a real Milestone 6 pipeline that does add Prefect "
            "orchestration should honor this flag the same way "
            "data/pipelines/weekly-location-performance does for its own "
            "--no-prefect-equivalent entry points, if it adds one."
        ),
    )
    return parser.parse_args(argv)


def _utc_day_bounds(target_date: date) -> tuple[datetime, datetime]:
    start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    try:
        target_date = date.fromisoformat(args.target_date)
    except ValueError:
        logger.error("Invalid --target-date %r — expected YYYY-MM-DD.", args.target_date)
        return 1

    from sqlmodel import Session

    from app.core.database import engine
    from app.models.telemetry_storage import fetch_telemetry_events_dataframe

    start, end = _utc_day_bounds(target_date)
    with Session(engine) as db:
        events = fetch_telemetry_events_dataframe(db, start, end)

    logger.info(
        "telemetry_kpi_daily placeholder: target_date=%s rows=%d (read from telemetry_events, not the CSV export)",
        target_date.isoformat(),
        len(events),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
