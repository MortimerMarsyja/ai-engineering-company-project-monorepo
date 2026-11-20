"""Tests for app.tasks.incidents.process_incidents_csv — the Celery task
behind POST /incidents/analyze.

Runs the task via `.apply()` (not `.delay()`/`.apply_async()`): this
executes the task's real code synchronously in-process, including its
real `self.retry()` calls — Celery's eager-apply path actually re-invokes
the task body on each retry rather than simulating it, so this genuinely
exercises the retry/backoff/exception-classification logic, not a mock of
it. What `.apply()` does NOT exercise is the real wall-clock delay a
retry's `countdown` causes with a live broker (that requires an actual
worker — verified manually against a real Redis + worker + Flower; see
the PR description) or the broker-publish step itself (covered by
test_tasks_router.py's mocked HTTP-level tests instead).

Against the REAL database — `analyze()`'s persistence, task_tracking's
idempotency guard, and the task_failure-signal-driven dead-letter write
all need the real engine, same reasoning as test_task_tracking.py.
"""

from __future__ import annotations

import logging
from datetime import date
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import delete, exc as sa_exc

from app.core.database import engine
from app.models.incident_storage import incidents_table
from app.models.task_tracking_storage import task_dead_letters_table, task_submissions_table
from app.services import task_tracking
from app.tasks import incidents as incidents_task_module

process_incidents_csv = incidents_task_module.process_incidents_csv


def _valid_row(marker: str, location_id: str = "COL-01") -> dict:
    """`marker` is embedded in the description (free text, unlike
    reporter_id which must match ^MGR-\\d{2}$) so each test's row stays
    identifiable/cleanable without needing a fresh valid reporter_id per
    test — every synthetic row shares one fixed, valid dummy reporter_id.
    """
    return {
        "location_id": location_id,
        "category": "SUPPLY",
        "description": f"Synthetic test incident row [{marker}]",
        "reporter_id": "MGR-99",
        "status": "OPEN",
        "date": date(2026, 11, 18).isoformat(),
        "satisfaction_score": "",
        "customer_id": "",
    }


@pytest.fixture
def task_id():
    tid = f"test-task-{uuid4().hex}"
    task_tracking.record_submission(tid, process_incidents_csv.name, submitted_by=None)
    yield tid
    with engine.begin() as conn:
        conn.execute(delete(task_submissions_table).where(task_submissions_table.c.task_id == tid))
        conn.execute(delete(task_dead_letters_table).where(task_dead_letters_table.c.task_id == tid))


@pytest.fixture
def marker():
    """A unique string embedded in a test's row description, used to find
    (and clean up) exactly the incident row(s) that test created."""
    value = uuid4().hex[:12]
    yield value
    with engine.begin() as conn:
        conn.execute(delete(incidents_table).where(incidents_table.c.description.like(f"%[{value}]%")))


def _persisted_rows_for(marker_value: str) -> list:
    with engine.connect() as conn:
        return conn.execute(
            incidents_table.select().where(incidents_table.c.description.like(f"%[{marker_value}]%"))
        ).all()


class TestSuccessfulExecution:
    def test_success_persists_and_returns_the_summary(self, task_id, marker):
        rows = [_valid_row(marker)]

        result = process_incidents_csv.apply(args=[rows, None], task_id=task_id)

        assert result.state == "SUCCESS"
        assert result.result["total_rows"] == 1
        assert result.result["valid_count"] == 1
        assert result.result["persisted_count"] == 1
        assert task_tracking.is_already_persisted(task_id) is True
        assert len(_persisted_rows_for(marker)) == 1


class TestTransientRetrySucceeds:
    def test_transient_failure_then_successful_retry(self, task_id, marker, caplog):
        rows = [_valid_row(marker)]

        call_count = {"n": 0}
        real_analyze = incidents_task_module.analyze

        def flaky(rows_arg, persist=True):
            call_count["n"] += 1
            if call_count["n"] < 2:
                raise sa_exc.OperationalError("transient", {}, Exception("connection reset"))
            return real_analyze(rows_arg, persist=persist)

        with caplog.at_level(logging.INFO, logger="app.tasks.incidents"):
            with patch.object(incidents_task_module, "analyze", side_effect=flaky):
                result = process_incidents_csv.apply(args=[rows, None], task_id=task_id)

        assert call_count["n"] == 2
        assert result.state == "SUCCESS"
        assert result.result["persisted_count"] == 1
        assert "status=retry" in caplog.text
        assert "status=success" in caplog.text


class TestRetryLimitAndBackoff:
    def test_exhausting_retries_logs_increasing_backoff_and_fails_on_attempt_4(self, task_id, marker, caplog):
        rows = [_valid_row(marker)]

        def always_transient(rows_arg, persist=True):
            raise sa_exc.OperationalError("always transient", {}, Exception("db unreachable"))

        with caplog.at_level(logging.INFO, logger="app.tasks.incidents"):
            with patch.object(incidents_task_module, "analyze", side_effect=always_transient):
                result = process_incidents_csv.apply(args=[rows, None], task_id=task_id)

        assert result.state == "FAILURE"
        # 3 retries (attempts 1,2,3) + the final failed attempt 4 — only
        # from the task's own logger (app.tasks.incidents), not the
        # separate dead-letter signal handler's logger (app.tasks), which
        # also logs its own "status=failure" line for the same event.
        task_records = [r for r in caplog.records if r.name == "app.tasks.incidents"]
        retry_lines = [r.message for r in task_records if "status=retry" in r.message]
        failure_lines = [r.message for r in task_records if "status=failure" in r.message]
        assert len(retry_lines) == 3
        assert len(failure_lines) == 1
        assert "countdown_s=2" in retry_lines[0]
        assert "countdown_s=4" in retry_lines[1]
        assert "countdown_s=8" in retry_lines[2]
        assert "attempt=4" in failure_lines[0]

        # No incident row ever got persisted — every attempt failed before
        # reaching the DB write.
        assert _persisted_rows_for(marker) == []


class TestDeadLetterOnFinalFailure:
    def test_final_failure_creates_exactly_one_dead_letter_record(self, task_id, marker):
        rows = [_valid_row(marker)]

        def always_transient(rows_arg, persist=True):
            raise sa_exc.OperationalError("always transient", {}, Exception("db unreachable"))

        with patch.object(incidents_task_module, "analyze", side_effect=always_transient):
            process_incidents_csv.apply(args=[rows, None], task_id=task_id)

        dead_letter = task_tracking.get_dead_letter(task_id)
        assert dead_letter is not None
        assert dead_letter["attempt_number"] == 4  # 1 initial + 3 retries

        with engine.connect() as conn:
            all_dead_letters = conn.execute(
                task_dead_letters_table.select().where(task_dead_letters_table.c.task_id == task_id)
            ).all()
        assert len(all_dead_letters) == 1, "exactly one dead-letter row, never more"

    def test_no_dead_letter_record_during_intermediate_retries(self, task_id, marker):
        rows = [_valid_row(marker)]

        call_count = {"n": 0}
        real_analyze = incidents_task_module.analyze

        def flaky(rows_arg, persist=True):
            call_count["n"] += 1
            if call_count["n"] < 2:
                raise sa_exc.OperationalError("transient", {}, Exception("connection reset"))
            return real_analyze(rows_arg, persist=persist)

        with patch.object(incidents_task_module, "analyze", side_effect=flaky):
            result = process_incidents_csv.apply(args=[rows, None], task_id=task_id)

        assert result.state == "SUCCESS"
        # The task retried once (an intermediate retry) and then
        # succeeded — a dead-letter row must never have been written for
        # that intermediate retry, only a true terminal failure would
        # create one.
        assert task_tracking.get_dead_letter(task_id) is None


class TestPermanentErrorsAreNeverRetried:
    def test_inactive_submitter_fails_immediately_without_retrying(self, task_id, marker):
        rows = [_valid_row(marker)]

        with patch.object(
            incidents_task_module.users_service,
            "get_user_by_id",
            return_value={"id": 1, "is_active": False},
        ):
            result = process_incidents_csv.apply(args=[rows, 1], task_id=task_id)

        assert result.state == "FAILURE"
        dead_letter = task_tracking.get_dead_letter(task_id)
        assert dead_letter is not None
        assert dead_letter["attempt_number"] == 1, "a permanent error must never be retried"
        assert "no longer active" in dead_letter["error_message"]
        assert _persisted_rows_for(marker) == []


class TestIdempotencyOnRetry:
    def test_a_task_id_that_already_persisted_does_not_duplicate_rows_on_a_later_attempt(self, task_id, marker):
        """Simulates the scenario the idempotency guard exists for: this
        exact task_id already got far enough to persist once (e.g. a
        prior attempt succeeded at the DB write but the worker was killed
        before the task could report SUCCESS, and got redelivered). A
        later call with the SAME task_id must not insert the same rows
        again.
        """
        rows = [_valid_row(marker)]

        # First call: persists normally.
        first = process_incidents_csv.apply(args=[rows, None], task_id=task_id)
        assert first.result["persisted_count"] == 1

        # Second call, SAME task_id — simulates a redelivery/retry of the
        # same logical attempt after it already persisted.
        second = process_incidents_csv.apply(args=[rows, None], task_id=task_id)
        assert second.state == "SUCCESS"
        assert second.result["persisted_count"] == 0, "must not report persisting again"

        assert len(_persisted_rows_for(marker)) == 1, "the row must exist exactly once, never duplicated"
