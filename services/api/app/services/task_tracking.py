"""task_tracking — the only module that reads/writes `task_submissions`
and `task_dead_letters` (see
supabase/migrations/20261118100000_create_task_tracking_tables.sql).

Why this exists instead of relying on Celery's own Redis result backend
for ownership/idempotency: `AsyncResult(task_id)` has **no backend entry
at all** for a task that has been published to the broker but not yet
picked up by a worker — Celery's PENDING state is genuinely ambiguous
(unknown id, queued-but-not-started, or an expired result all look
identical). Authorization and the retry-idempotency guard both need to be
correct *immediately* after a task is enqueued, before any worker has
touched it — so both are backed by this module's own rows, written
synchronously in the request handler right after the broker accepts the
task, not derived from Celery's backend state.

Same per-call `Session(engine)` pattern as app/services/job_runner.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session

from app.core.database import engine
from app.models.task_tracking_storage import task_dead_letters_table, task_submissions_table


def _get_session() -> Session:
    return Session(engine)


def record_submission(task_id: str, task_name: str, submitted_by: int | None) -> None:
    """Called once, synchronously, right after the broker has accepted
    the task — never before (see app/routers/incidents.py). Source of
    truth for GET /tasks/{task_id}'s ownership check.
    """
    with _get_session() as db:
        db.execute(
            task_submissions_table.insert().values(
                task_id=task_id,
                task_name=task_name,
                submitted_by=submitted_by,
                created_at=datetime.now(timezone.utc),
                persisted_at=None,
            )
        )
        db.commit()


def delete_submission(task_id: str) -> None:
    """Called only when the broker never accepted the task (the publish
    call itself raised) — the submission row written just before that
    attempt would otherwise be a permanent, misleading "not found" trap
    for GET /tasks/{task_id}, since the task it refers to will never run.
    Never called for any other reason: once a task has actually been
    published, its submission row must persist for the task's whole
    lifetime (ownership + idempotency depend on it existing).
    """
    with _get_session() as db:
        db.execute(delete(task_submissions_table).where(task_submissions_table.c.task_id == task_id))
        db.commit()


def get_submission(task_id: str) -> dict | None:
    with _get_session() as db:
        row = db.execute(
            select(task_submissions_table).where(task_submissions_table.c.task_id == task_id)
        ).first()
        return dict(row._mapping) if row is not None else None


def is_already_persisted(task_id: str) -> bool:
    """Retry-idempotency guard: has this exact task_id already applied its
    side effects once (in a prior attempt)? If the submission row itself
    doesn't exist (shouldn't happen for a task this worker is executing,
    since record_submission runs before the task is ever enqueued),
    treated as not-yet-persisted — the caller's persist step is what
    would actually create evidence of having run.
    """
    submission = get_submission(task_id)
    return submission is not None and submission["persisted_at"] is not None


def mark_persisted(task_id: str) -> None:
    """Call immediately after this task's side effects have been durably
    applied — before returning the task's result, so a crash between
    "persisted" and "marked" is the only window where a retry could
    duplicate work (same minimal-window tradeoff every idempotency marker
    in this codebase accepts, e.g. job_runner.py's advisory-lock window).
    """
    with _get_session() as db:
        db.execute(
            update(task_submissions_table)
            .where(task_submissions_table.c.task_id == task_id)
            .values(persisted_at=datetime.now(timezone.utc))
        )
        db.commit()


def record_dead_letter(task_id: str, task_name: str | None, attempt_number: int, error_message: str) -> bool:
    """Insert a dead-letter row for a terminally-failed task. Safe to call
    more than once for the same task_id (e.g. a duplicate
    celery.signals.task_failure delivery) — UNIQUE(task_id) +
    ON CONFLICT DO NOTHING means only the first call actually inserts a
    row; every subsequent call for the same task_id is a deliberate
    no-op, never a second dead-letter row or an error.

    Returns True if this call actually inserted the row, False if a
    dead-letter for this task_id already existed — callers use this to
    log which case happened, never to change whether the original
    failure is still reported (see app/tasks/incidents.py).
    """
    statement = pg_insert(task_dead_letters_table).values(
        id=str(uuid4()),
        task_id=task_id,
        task_name=task_name,
        attempt_number=attempt_number,
        error_message=error_message[:4000],
        created_at=datetime.now(timezone.utc),
    )
    statement = statement.on_conflict_do_nothing(index_elements=["task_id"])

    with _get_session() as db:
        result = db.execute(statement)
        db.commit()
        return result.rowcount > 0


def get_dead_letter(task_id: str) -> dict | None:
    with _get_session() as db:
        row = db.execute(
            select(task_dead_letters_table).where(task_dead_letters_table.c.task_id == task_id)
        ).first()
        return dict(row._mapping) if row is not None else None
