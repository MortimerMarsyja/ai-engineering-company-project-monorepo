"""Integration tests for app.services.job_runner — against the REAL
database, not the SQLite sql_engine fixture: the locking mechanism relies
on a Postgres-specific primitive (pg_advisory_xact_lock), which SQLite
has no equivalent for, and the whole point of several tests here (the
concurrency ones especially) is to prove the *real* lock actually
serializes concurrent callers — a mock or a different database engine
would not be testing the real behavior at all.

Every test uses a unique, synthetic job_name (never "nightly_export" or
any other real job name) so this suite can never interfere with, or be
interfered by, a real job's rows — same `TEST-`-prefix-style isolation
already used by data/pipelines/weekly-location-performance/tests/
test_load_idempotency.py for its own real-database tests.
"""

from __future__ import annotations

import threading
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.database import engine
from app.models.job_run_storage import job_runs_table
from app.services import job_runner

TEST_DATE = date(2099, 6, 1)
OTHER_DATE = date(2099, 6, 2)


def _unique_job_name() -> str:
    return f"test_job_runner_{uuid4().hex}"


@pytest.fixture
def job_name():
    name = _unique_job_name()
    yield name
    with engine.begin() as conn:
        conn.execute(delete(job_runs_table).where(job_runs_table.c.job_name == name))


class TestLockAndIdempotencyQueries:
    def test_has_processing_lock_false_when_no_rows(self, job_name):
        assert job_runner.has_processing_lock(job_name) is False

    def test_has_processing_lock_true_regardless_of_target_date(self, job_name):
        job_runner.create_run(job_name, OTHER_DATE, status="processing")
        assert job_runner.has_processing_lock(job_name) is True

    def test_has_completed_for_date_is_date_specific(self, job_name):
        job_runner.create_run(job_name, TEST_DATE, status="completed")
        assert job_runner.has_completed_for_date(job_name, TEST_DATE) is True
        assert job_runner.has_completed_for_date(job_name, OTHER_DATE) is False

    def test_checking_only_job_name_is_not_enough_for_idempotency(self, job_name):
        # A completed run for a DIFFERENT date must never satisfy the
        # idempotency check for TEST_DATE — this is the exact requirement
        # the task calls out explicitly ("comprobar solo job_name no es
        # suficiente").
        job_runner.create_run(job_name, OTHER_DATE, status="completed")
        assert job_runner.has_completed_for_date(job_name, TEST_DATE) is False


class TestTryAcquireRun:
    def test_acquires_when_clear(self, job_name):
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert result.acquired is True
        assert result.run_id is not None

        stored = job_runner.get_run(result.run_id)
        assert stored["status"] == "processing"
        assert stored["job_name"] == job_name
        assert stored["target_date"] == TEST_DATE
        assert stored["started_at"] is not None

    def test_blocked_by_processing_lock_regardless_of_date(self, job_name):
        job_runner.create_run(job_name, OTHER_DATE, status="processing")
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert result.acquired is False
        assert result.reason == "processing_lock"

    def test_blocked_by_completed_for_same_date(self, job_name):
        job_runner.create_run(job_name, TEST_DATE, status="completed")
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert result.acquired is False
        assert result.reason == "already_completed"

    def test_completed_for_a_different_date_does_not_block(self, job_name):
        job_runner.create_run(job_name, OTHER_DATE, status="completed")
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert result.acquired is True

    def test_failed_run_allows_a_retry(self, job_name):
        first = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert first.acquired is True
        job_runner.mark_failed(first.run_id, "simulated failure")

        second = job_runner.try_acquire_run(job_name, TEST_DATE)
        assert second.acquired is True
        assert second.run_id != first.run_id

    def test_no_job_runs_row_created_for_a_skipped_attempt(self, job_name):
        job_runner.create_run(job_name, OTHER_DATE, status="processing")
        job_runner.try_acquire_run(job_name, TEST_DATE)

        with engine.connect() as conn:
            rows = conn.execute(
                job_runs_table.select().where(job_runs_table.c.job_name == job_name)
            ).all()
        # Only the one seeded 'processing' row — the blocked attempt
        # itself must not have inserted anything.
        assert len(rows) == 1


class TestMarkCompletedAndFailed:
    def test_mark_completed_sets_status_and_finished_at(self, job_name):
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        job_runner.mark_completed(result.run_id)

        stored = job_runner.get_run(result.run_id)
        assert stored["status"] == "completed"
        assert stored["finished_at"] is not None

    def test_mark_failed_sets_status_finished_at_and_error_message(self, job_name):
        result = job_runner.try_acquire_run(job_name, TEST_DATE)
        job_runner.mark_failed(result.run_id, "boom: something broke")

        stored = job_runner.get_run(result.run_id)
        assert stored["status"] == "failed"
        assert stored["finished_at"] is not None
        assert stored["error_message"] == "boom: something broke"


class TestConcurrentAcquisition:
    def test_only_one_of_many_concurrent_callers_acquires(self, job_name):
        """The real race this whole locking design exists to prevent:
        many threads calling try_acquire_run for the same (job_name,
        target_date) at effectively the same instant. Each thread opens
        its own DB connection (via job_runner's own _get_session, one per
        call), so this genuinely exercises Postgres's advisory lock
        across concurrent connections, not just Python-level serialization.
        """
        thread_count = 8
        results: list[job_runner.AcquireResult] = [None] * thread_count  # type: ignore[list-item]
        barrier = threading.Barrier(thread_count)

        def attempt(index: int) -> None:
            barrier.wait()  # line everyone up to fire as close to simultaneously as possible
            results[index] = job_runner.try_acquire_run(job_name, TEST_DATE)

        threads = [threading.Thread(target=attempt, args=(i,)) for i in range(thread_count)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        acquired = [r for r in results if r.acquired]
        assert len(acquired) == 1, f"expected exactly 1 acquisition, got {len(acquired)}"

        with engine.connect() as conn:
            rows = conn.execute(
                job_runs_table.select().where(job_runs_table.c.job_name == job_name)
            ).all()
        assert len(rows) == 1, "exactly one job_runs row must exist after the race, not one per thread"
