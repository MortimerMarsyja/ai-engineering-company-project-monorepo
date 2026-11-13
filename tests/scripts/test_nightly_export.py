"""Tests for scripts/nightly_export.py.

Runs against the REAL database (job_runs + telemetry_events) for the same
reason services/api/tests/test_job_runner.py does — the locking this
script relies on is Postgres-specific and only means something when
exercised for real. Every test uses a unique, synthetic job_name
(monkeypatched onto nightly_export.JOB_NAME) and a throwaway tmp_path CSV
directory, so nothing here can collide with real "nightly_export" rows or
files.

The pipeline subprocess (data/pipelines/telemetry_kpi_daily/run.py) is
mocked in every test here — mocking lets each test deterministically
control pipeline success/failure and assert exactly what command/args
nightly_export invoked it with, without actually shelling out. The real
subprocess wiring (same interpreter, correct module path, --target-date/
--no-prefect args, real exit-code propagation) was verified manually
end-to-end against the real database (see the PR description) rather
than in this automated suite, to avoid every test run shelling out to a
second Python process.
"""

from __future__ import annotations

import subprocess as subprocess_module
import threading
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete

import conftest  # noqa: F401  (sys.path setup for `import nightly_export`)
import nightly_export
from app.core.database import engine
from app.models.job_run_storage import job_runs_table
from app.models.telemetry_storage import telemetry_events_table
from app.services import job_runner

TEST_DATE = date(2099, 8, 10)
OTHER_DATE = date(2099, 8, 11)


@pytest.fixture
def job_name(monkeypatch):
    name = f"test_nightly_export_{uuid4().hex}"
    monkeypatch.setattr(nightly_export, "JOB_NAME", name)
    yield name
    with engine.begin() as conn:
        conn.execute(delete(job_runs_table).where(job_runs_table.c.job_name == name))


@pytest.fixture
def csv_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(nightly_export, "CSV_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def fake_pipeline_success(monkeypatch):
    """Records every subprocess.run call nightly_export makes and
    pretends it always succeeds (returncode 0)."""
    calls: list[list[str]] = []

    def fake_run(command, cwd=None, check=None):
        calls.append(command)
        return subprocess_module.CompletedProcess(command, returncode=0)

    monkeypatch.setattr(nightly_export.subprocess, "run", fake_run)
    return calls


@pytest.fixture
def fake_pipeline_failure(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(command, cwd=None, check=None):
        calls.append(command)
        raise subprocess_module.CalledProcessError(returncode=1, cmd=command)

    monkeypatch.setattr(nightly_export.subprocess, "run", fake_run)
    return calls


@pytest.fixture
def fake_telemetry_fetch(monkeypatch):
    """Replaces app.models.telemetry_storage.fetch_telemetry_events_dataframe
    with a fake that records the (start, end) window it was called with
    and returns a caller-controlled DataFrame.

    telemetry_events is append-only in the real database (a DB-level
    trigger unconditionally rejects UPDATE/DELETE/TRUNCATE — confirmed by
    hitting `psycopg2.errors.InsufficientPrivilege` when a first version
    of these tests tried to insert-then-clean-up synthetic rows there), so
    there is no safe way to exercise the window logic with real rows that
    can be removed afterward. export_csv_if_missing imports
    fetch_telemetry_events_dataframe *inside* its function body (a lazy
    import), which is exactly what makes patching the module-level name
    here effective — the lazy import resolves the patched callable at
    call time. The function's own filtering/chunking correctness is
    already covered by
    services/api/tests/test_telemetry_storage_retrieval.py; what these
    tests verify is that *nightly_export* computes and passes the correct
    UTC day boundaries, and correctly writes whatever rows come back into
    the CSV.
    """
    import pandas as pd

    calls: list[tuple[datetime, datetime]] = []
    rows_to_return: list[dict] = []

    def _fake(db, start, end):
        calls.append((start, end))
        if not rows_to_return:
            return pd.DataFrame(columns=[c.name for c in telemetry_events_table.columns])
        return pd.DataFrame(rows_to_return)

    monkeypatch.setattr("app.models.telemetry_storage.fetch_telemetry_events_dataframe", _fake)

    class Handle:
        def set_rows(self, rows: list[dict]) -> None:
            rows_to_return[:] = rows

    handle = Handle()
    handle.calls = calls  # type: ignore[attr-defined]
    return handle


# ── Date resolution/validation ────────────────────────────────────────────


def test_default_target_date_is_yesterday_utc(monkeypatch):
    monkeypatch.delenv("TARGET_DATE", raising=False)
    expected = datetime.now(timezone.utc).date() - timedelta(days=1)
    assert nightly_export.resolve_target_date() == expected


def test_valid_target_date_env_var_is_used(monkeypatch):
    monkeypatch.setenv("TARGET_DATE", "2026-07-13")
    assert nightly_export.resolve_target_date() == date(2026, 7, 13)


def test_invalid_target_date_env_var_raises_before_any_job_runs_interaction(monkeypatch, job_name):
    monkeypatch.setenv("TARGET_DATE", "not-a-date")
    with pytest.raises(ValueError):
        nightly_export.resolve_target_date()
    # Nothing must have been written for an invalid date — main() itself
    # (exercised below) never even reaches job_runner for this case.


def test_main_exits_nonzero_and_creates_no_row_for_invalid_target_date(monkeypatch, job_name):
    monkeypatch.setenv("TARGET_DATE", "garbage")
    exit_code = nightly_export.main()
    assert exit_code != 0

    with engine.connect() as conn:
        rows = conn.execute(
            job_runs_table.select().where(job_runs_table.c.job_name == job_name)
        ).all()
    assert rows == []


# ── CSV export window ──────────────────────────────────────────────────────


def test_export_is_limited_to_the_requested_utc_day(job_name, csv_dir, fake_telemetry_fetch, monkeypatch, fake_pipeline_success):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    inside_id = str(uuid4())
    fake_telemetry_fetch.set_rows(
        [
            {
                "event_id": inside_id,
                "timestamp": datetime(TEST_DATE.year, TEST_DATE.month, TEST_DATE.day, 12, tzinfo=timezone.utc),
                "session_id": "s1",
                "user_id": None,
                "event_type": "page_viewed",
                "schema_version": "1.0.0",
                "request_id": None,
                "tags": {},
            }
        ]
    )

    exit_code = nightly_export.main()
    assert exit_code == 0

    # nightly_export must have asked for exactly [day start, next day
    # start) in UTC — the window math, independent of what the DB layer
    # itself does with it.
    assert len(fake_telemetry_fetch.calls) == 1
    start, end = fake_telemetry_fetch.calls[0]
    expected_start = datetime(TEST_DATE.year, TEST_DATE.month, TEST_DATE.day, tzinfo=timezone.utc)
    assert start == expected_start
    assert end == expected_start + timedelta(days=1)

    csv_path = csv_dir / f"telemetry_{TEST_DATE.isoformat()}.csv"
    assert inside_id in csv_path.read_text()


# ── Existing CSV handling ──────────────────────────────────────────────────


def test_existing_csv_is_kept_and_pipeline_still_runs_without_a_completed_entry(
    job_name, csv_dir, monkeypatch, fake_pipeline_success
):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())
    csv_path = csv_dir / f"telemetry_{TEST_DATE.isoformat()}.csv"
    csv_path.write_text("event_id,timestamp\nkeep-me,2099-08-10T00:00:00Z\n")
    original_content = csv_path.read_text()

    exit_code = nightly_export.main()

    assert exit_code == 0
    assert csv_path.read_text() == original_content, "an existing CSV must never be overwritten"
    assert len(fake_pipeline_success) == 1, "the pipeline must still run even though the CSV already existed"


# ── Idempotency / locking ──────────────────────────────────────────────────


def test_completed_run_for_the_date_skips_export_and_pipeline(job_name, csv_dir, monkeypatch, fake_pipeline_success):
    job_runner.create_run(job_name, TEST_DATE, status="completed")
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code == 0
    assert fake_pipeline_success == []
    assert not (csv_dir / f"telemetry_{TEST_DATE.isoformat()}.csv").exists()


def test_completed_run_for_a_different_date_allows_the_requested_date_to_run(
    job_name, csv_dir, monkeypatch, fake_pipeline_success
):
    job_runner.create_run(job_name, OTHER_DATE, status="completed")
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code == 0
    assert len(fake_pipeline_success) == 1
    assert job_runner.has_completed_for_date(job_name, TEST_DATE) is True


def test_processing_run_for_any_date_skips_without_doing_work(job_name, csv_dir, monkeypatch, fake_pipeline_success):
    job_runner.create_run(job_name, OTHER_DATE, status="processing")
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code == 0
    assert fake_pipeline_success == []
    assert not (csv_dir / f"telemetry_{TEST_DATE.isoformat()}.csv").exists()

    with engine.connect() as conn:
        rows = conn.execute(
            job_runs_table.select().where(job_runs_table.c.job_name == job_name)
        ).all()
    assert len(rows) == 1, "the skip itself must not create a second job_runs row"


def test_failed_run_allows_a_retry_through_main(job_name, csv_dir, monkeypatch, fake_pipeline_success):
    job_runner.create_run(job_name, TEST_DATE, status="failed")
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code == 0
    assert len(fake_pipeline_success) == 1


# ── Failure handling ────────────────────────────────────────────────────────


def test_export_failure_never_starts_the_pipeline_and_leaves_no_partial_csv(
    job_name, csv_dir, monkeypatch, fake_pipeline_success
):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated export failure")

    import pandas as pd

    monkeypatch.setattr(pd.DataFrame, "to_csv", _boom)

    exit_code = nightly_export.main()

    assert exit_code != 0
    assert fake_pipeline_success == [], "pipeline must never start if the export failed"
    assert list(csv_dir.iterdir()) == [], "no final or temp CSV file may be left behind"

    with engine.connect() as conn:
        row = conn.execute(
            job_runs_table.select().where(job_runs_table.c.job_name == job_name)
        ).mappings().one()
    assert row["status"] == "failed"
    assert row["error_message"] and "simulated export failure" in row["error_message"]


def test_pipeline_failure_marks_the_run_failed(job_name, csv_dir, monkeypatch, fake_pipeline_failure):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code != 0
    assert len(fake_pipeline_failure) == 1

    with engine.connect() as conn:
        row = conn.execute(
            job_runs_table.select().where(job_runs_table.c.job_name == job_name)
        ).mappings().one()
    assert row["status"] == "failed"
    assert row["error_message"]


# ── Full success ────────────────────────────────────────────────────────────


def test_full_success_marks_completed_with_timestamps(job_name, csv_dir, monkeypatch, fake_pipeline_success):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())

    exit_code = nightly_export.main()

    assert exit_code == 0
    with engine.connect() as conn:
        row = conn.execute(
            job_runs_table.select().where(job_runs_table.c.job_name == job_name)
        ).mappings().one()
    assert row["status"] == "completed"
    assert row["started_at"] is not None
    assert row["finished_at"] is not None
    assert row["finished_at"] >= row["started_at"]


def test_pipeline_invoked_with_same_interpreter_and_explicit_target_date(
    job_name, csv_dir, monkeypatch, fake_pipeline_success
):
    import sys

    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())
    nightly_export.main()

    assert len(fake_pipeline_success) == 1
    command = fake_pipeline_success[0]
    assert command[0] == sys.executable
    assert "--target-date" in command
    assert command[command.index("--target-date") + 1] == TEST_DATE.isoformat()
    assert "--no-prefect" in command


# ── Concurrency ──────────────────────────────────────────────────────────────


def test_only_one_of_two_concurrent_invocations_does_work(job_name, csv_dir, monkeypatch):
    monkeypatch.setenv("TARGET_DATE", TEST_DATE.isoformat())
    calls: list[list[str]] = []
    lock = threading.Lock()

    def fake_run(command, cwd=None, check=None):
        with lock:
            calls.append(command)
        return subprocess_module.CompletedProcess(command, returncode=0)

    monkeypatch.setattr(nightly_export.subprocess, "run", fake_run)

    barrier = threading.Barrier(2)
    exit_codes: list[int] = [None, None]  # type: ignore[list-item]

    def invoke(index: int) -> None:
        barrier.wait()
        exit_codes[index] = nightly_export.main()

    threads = [threading.Thread(target=invoke, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1, "only one of the two concurrent invocations may run the pipeline"
    assert all(code == 0 for code in exit_codes), "the skipped invocation must still exit 0, not error"
