"""Integration tests for app.services.task_tracking — against the REAL
database, not the SQLite sql_engine fixture: `record_dead_letter` uses
`sqlalchemy.dialects.postgresql.insert(...).on_conflict_do_nothing(...)`,
a Postgres-specific construct, and `task_submissions.submitted_by` has a
real FK to `users(id)` — both need the real engine to mean anything, the
same reasoning services/api/tests/test_job_runner.py and
test_allowed_emails.py already use for their own Postgres-specific
mechanics.

Every test uses a unique, synthetic task_id (never a real one) with a
teardown fixture, same isolation style as those two files.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.database import engine
from app.models.task_tracking_storage import task_dead_letters_table, task_submissions_table
from app.services import task_tracking


@pytest.fixture
def task_id():
    tid = f"test-task-{uuid4().hex}"
    yield tid
    with engine.begin() as conn:
        conn.execute(delete(task_submissions_table).where(task_submissions_table.c.task_id == tid))
        conn.execute(delete(task_dead_letters_table).where(task_dead_letters_table.c.task_id == tid))


class TestSubmissions:
    def test_record_and_get_submission(self, task_id):
        task_tracking.record_submission(task_id, "some.task.name", submitted_by=None)
        stored = task_tracking.get_submission(task_id)
        assert stored["task_id"] == task_id
        assert stored["task_name"] == "some.task.name"
        assert stored["submitted_by"] is None
        assert stored["persisted_at"] is None

    def test_get_submission_returns_none_for_unknown_id(self):
        assert task_tracking.get_submission("does-not-exist") is None

    def test_delete_submission_removes_the_row(self, task_id):
        task_tracking.record_submission(task_id, "some.task.name", submitted_by=None)
        task_tracking.delete_submission(task_id)
        assert task_tracking.get_submission(task_id) is None


class TestIdempotencyGuard:
    def test_not_persisted_until_marked(self, task_id):
        task_tracking.record_submission(task_id, "some.task.name", submitted_by=None)
        assert task_tracking.is_already_persisted(task_id) is False

    def test_mark_persisted_flips_the_guard(self, task_id):
        task_tracking.record_submission(task_id, "some.task.name", submitted_by=None)
        task_tracking.mark_persisted(task_id)
        assert task_tracking.is_already_persisted(task_id) is True

    def test_unknown_task_id_is_not_persisted(self):
        assert task_tracking.is_already_persisted("never-submitted") is False


class TestDeadLetters:
    def test_record_dead_letter_inserts_a_row(self, task_id):
        inserted = task_tracking.record_dead_letter(task_id, "some.task.name", attempt_number=4, error_message="boom")
        assert inserted is True

        stored = task_tracking.get_dead_letter(task_id)
        assert stored["task_id"] == task_id
        assert stored["attempt_number"] == 4
        assert stored["error_message"] == "boom"

    def test_duplicate_dead_letter_for_the_same_task_id_is_a_no_op(self, task_id):
        first = task_tracking.record_dead_letter(task_id, "some.task.name", attempt_number=4, error_message="first error")
        second = task_tracking.record_dead_letter(task_id, "some.task.name", attempt_number=4, error_message="second, different message")

        assert first is True
        assert second is False

        stored = task_tracking.get_dead_letter(task_id)
        assert stored["error_message"] == "first error", "the second call must never overwrite the first dead-letter row"

    def test_get_dead_letter_returns_none_when_absent(self, task_id):
        task_tracking.record_submission(task_id, "some.task.name", submitted_by=None)
        assert task_tracking.get_dead_letter(task_id) is None
