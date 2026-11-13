"""nightly_export — nightly telemetry CSV backup + Milestone 6 pipeline
trigger, with execution logging, daily idempotency, and a global
single-flight lock, all backed by `job_runs`
(supabase/migrations/20261113090000_create_job_runs.sql).

Run from the project root with the services/api virtualenv's Python (the
`app.*` package — DB settings, `job_runs`/`telemetry_events` access — is
only importable there; a bare `python` not pointed at that venv fails on
`import app...` regardless of this script):

    python scripts/nightly_export.py
    TARGET_DATE=2026-07-13 python scripts/nightly_export.py   # manual/backfill run
    services/api/.venv/bin/python scripts/nightly_export.py   # explicit interpreter, no venv activation needed

What it does, in order
-----------------------
1. Resolves `target_date` from the `TARGET_DATE` env var (YYYY-MM-DD) or,
   if unset, yesterday in UTC. Validates the format *before* touching
   `job_runs` at all — an invalid TARGET_DATE never creates a row.
2. Atomically acquires the right to run (app.services.job_runner.
   try_acquire_run) — this is simultaneously the global lock (any
   'processing' row for this job, any date, blocks every run) and the
   daily-idempotency check (a 'completed' row for this exact date blocks
   only that date). Both kinds of "skip" log an INFO line and exit 0
   without doing any work and without creating a job_runs row.
3. If `data/raw/telemetry_<target_date>.csv` doesn't already exist,
   queries `telemetry_events` for that UTC calendar day
   ([00:00:00, next day's 00:00:00)) and publishes the CSV atomically (a
   temp file in the same directory, linked into place — never a
   partially-written file left at the final path, and never an overwrite
   of an existing destination). If the file already exists, it's left
   untouched and this step is skipped entirely.
4. Runs the Milestone 6 pipeline (see PIPELINE_COMMAND below) as a
   subprocess, with the same Python interpreter running this script and
   `target_date` passed explicitly — never relying on the pipeline's own
   default period.
5. Marks the run 'completed' only if both steps 3 and 4 succeeded. Any
   exception anywhere in steps 3-4 is caught, the run is marked 'failed'
   with the error message, and the script exits non-zero.

The CSV is a backup/audit copy only — the pipeline subprocess reads
`telemetry_events` directly, never this file (see PIPELINE_COMMAND's own
docstring in data/pipelines/telemetry_kpi_daily/run.py).

Locking and idempotency are entirely job_runs-backed; see
app.services.job_runner's module docstring for the exact mechanism
(a Postgres advisory lock makes the check-then-insert atomic, held only
for that short transaction — never for the duration of the actual
export/pipeline work) and for how to manually recover a `job_runs` row
left stuck in 'processing' by an abrupt kill of this process.

If job_runs itself is unreachable (the database is down) at the moment
this script tries to acquire the run, there is nothing to mark 'failed' —
no row was ever created, so there is nothing to recover either; this
script logs the error and exits non-zero, and the next scheduled
invocation simply tries again from scratch.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# `app.*` (services/api) is a sibling of `scripts/`, not importable by
# default — same cross-directory sys.path bootstrap used by
# data/pipelines/pipeline.py and data/pipelines/telemetry_kpi_daily/run.py.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_SERVICES_API_DIR = _REPO_ROOT / "services" / "api"
if str(_SERVICES_API_DIR) not in sys.path:
    sys.path.insert(0, str(_SERVICES_API_DIR))

from app.services import job_runner  # noqa: E402

JOB_NAME = "nightly_export"
CSV_DIR = _REPO_ROOT / "data" / "raw"

# The reference command this task specified
# (`python -m data.pipelines.telemetry_kpi_daily.run --no-prefect`).
# Update this if the real Milestone 6 entry point is ever renamed/moved —
# nothing else in this script needs to change, since target_date is
# always passed explicitly as an argument, never assumed.
PIPELINE_MODULE = "data.pipelines.telemetry_kpi_daily.run"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("nightly_export")


def _log(level: int, status: str, message: str, target_date_: date | None = None, run_id: str | None = None) -> None:
    """Every log line this script emits goes through here, so every line
    carries job_name + the current/resulting status, and target_date/
    job_run_id whenever they're known — required for correlating a log
    line back to its job_runs row.
    """
    parts = [f"job_name={JOB_NAME}", f"status={status}"]
    if target_date_ is not None:
        parts.append(f"target_date={target_date_.isoformat()}")
    if run_id is not None:
        parts.append(f"job_run_id={run_id}")
    parts.append(message)
    logger.log(level, " ".join(parts))


def resolve_target_date() -> date:
    """TARGET_DATE env var (YYYY-MM-DD) if set, else yesterday in UTC.
    Raises ValueError on a malformed TARGET_DATE — callers must validate
    before doing anything else (see module docstring, step 1).
    """
    raw = os.environ.get("TARGET_DATE")
    if raw:
        return date.fromisoformat(raw)  # raises ValueError on bad format
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    return yesterday


def _utc_day_bounds(target_date: date) -> tuple[datetime, datetime]:
    start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def export_csv_if_missing(target_date: date, run_id: str) -> Path:
    """Publishes data/raw/telemetry_<target_date>.csv if it doesn't exist
    yet; otherwise leaves the existing file untouched. Returns the final
    path either way.

    Atomic, no-overwrite publish: writes to a temp file in the same
    directory, then `os.link()`s it into the final path (fails with
    FileExistsError if the destination already exists — a stronger
    guarantee than `os.replace()`, which would silently overwrite) before
    removing the temp file. A failure anywhere before the link succeeds
    (query error, write error, disk full) leaves only the temp file behind,
    never a partial file at the final path.
    """
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    final_path = CSV_DIR / f"telemetry_{target_date.isoformat()}.csv"

    if final_path.exists():
        _log(logging.INFO, "processing", "CSV already exists — keeping it, no export performed.", target_date, run_id)
        return final_path

    import pandas as pd
    from sqlmodel import Session

    from app.core.database import engine
    from app.models.telemetry_storage import fetch_telemetry_events_dataframe

    start, end = _utc_day_bounds(target_date)
    with Session(engine) as db:
        events = fetch_telemetry_events_dataframe(db, start, end)

    # `tags` is a dict column — JSON-encode it so the CSV never shows a
    # raw Python dict repr (same technique already used by
    # transform.py's _dataframe_fingerprint for the same column).
    if "tags" in events.columns:
        import json

        events = events.assign(tags=events["tags"].map(lambda t: json.dumps(t, sort_keys=True, default=str)))

    tmp_path = CSV_DIR / f".telemetry_{target_date.isoformat()}.csv.tmp-{os.getpid()}"
    try:
        events.to_csv(tmp_path, index=False)
        try:
            os.link(tmp_path, final_path)
        except FileExistsError:
            # Only possible if something else created the destination
            # between the exists() check above and now — the global
            # processing lock makes this practically unreachable for two
            # nightly_export runs, but it's handled as "already exists"
            # regardless of cause, never as an error.
            _log(logging.INFO, "processing", "CSV appeared concurrently — keeping the existing file.", target_date, run_id)
    finally:
        tmp_path.unlink(missing_ok=True)

    _log(logging.INFO, "processing", f"Export completed: {len(events)} row(s) -> {final_path}", target_date, run_id)
    return final_path


def run_pipeline(target_date: date, run_id: str) -> None:
    """Runs the Milestone 6 pipeline as a subprocess, same interpreter as
    this script, target_date passed explicitly. Raises
    subprocess.CalledProcessError on a non-zero exit — callers rely on
    this to mark the job_runs row 'failed'.
    """
    command = [
        sys.executable,
        "-m",
        PIPELINE_MODULE,
        "--target-date",
        target_date.isoformat(),
        "--no-prefect",
    ]
    _log(logging.INFO, "processing", f"Starting pipeline: {' '.join(command)}", target_date, run_id)
    subprocess.run(command, cwd=_REPO_ROOT, check=True)
    _log(logging.INFO, "processing", "Pipeline finished successfully.", target_date, run_id)


def main() -> int:
    try:
        target_date = resolve_target_date()
    except ValueError:
        _log(logging.ERROR, "failed", f"Invalid TARGET_DATE={os.environ.get('TARGET_DATE')!r} — expected YYYY-MM-DD.")
        return 1

    try:
        result = job_runner.try_acquire_run(JOB_NAME, target_date)
    except Exception:
        # job_runs itself is unreachable — no row was created (the
        # acquire transaction never committed), so there is nothing to
        # mark 'failed' and nothing stuck to recover. See module
        # docstring's last paragraph.
        _log(logging.ERROR, "failed", "Could not reach job_runs to acquire the run lock.", target_date)
        logger.error(traceback.format_exc())
        return 1

    if not result.acquired:
        if result.reason == "processing_lock":
            _log(
                logging.INFO,
                "skipped",
                "Another nightly_export run is already in progress (processing lock held) — skipping.",
                target_date,
            )
        else:
            _log(
                logging.INFO,
                "skipped",
                "Already completed for this target_date — skipping export and pipeline.",
                target_date,
            )
        return 0

    run_id = result.run_id
    _log(logging.INFO, "processing", "Acquired run lock — starting.", target_date, run_id)

    try:
        export_csv_if_missing(target_date, run_id)
        run_pipeline(target_date, run_id)
    except Exception as exc:
        error_message = f"{type(exc).__name__}: {exc}"
        _log(logging.ERROR, "failed", error_message, target_date, run_id)
        logger.error(traceback.format_exc())
        try:
            job_runner.mark_failed(run_id, error_message)
        except Exception:
            # Never hide the original failure behind a second one —
            # both get logged, distinctly, and the run is left
            # 'processing' (see module docstring's recovery section for
            # how to fix that by hand).
            _log(
                logging.ERROR,
                "processing",
                "Additionally failed to record the failure in job_runs — this run is stuck in 'processing' "
                "and needs manual recovery (see app/services/job_runner.py's module docstring).",
                target_date,
                run_id,
            )
            logger.error(traceback.format_exc())
        return 1

    job_runner.mark_completed(run_id)
    _log(logging.INFO, "completed", "Export and pipeline both completed successfully.", target_date, run_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
