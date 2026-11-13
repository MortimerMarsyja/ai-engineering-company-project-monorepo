"""job_runner — centralizes every create/update/query touching `job_runs`
(supabase/migrations/20261113090000_create_job_runs.sql). Any caller that
needs locking/idempotency/execution-logging for a background job (first
consumer: scripts/nightly_export.py) should go through this module
instead of querying `job_runs_table` directly.

Locking/idempotency contract
-----------------------------
There is no separate lock table or lock column. The rule is:

  - A row with status='processing' for a job_name IS that job's global
    lock (across every target_date) — `has_processing_lock`.
  - A row with status='completed' for (job_name, target_date) is what
    daily idempotency checks against — `has_completed_for_date`.
  - A row with status='failed' never blocks anything — a failed attempt
    simply isn't a 'processing' or 'completed' row, so the next call to
    `try_acquire_run` for the same (job_name, target_date) succeeds
    normally. This is what "a failed run must allow a retry" means in
    practice: nothing special has to be written to "clear" a failure.

The one real race to guard against is two processes calling
`try_acquire_run` for the same job_name at (almost) the same instant: both
could see "no processing row, no completed row for today" and both insert
their own 'processing' row, defeating the lock. `try_acquire_run` closes
this window with a **Postgres advisory lock**
(`pg_advisory_xact_lock`, transaction-scoped) taken on a key derived from
`job_name` *before* the processing/completed checks: every call for the
same job_name is fully serialized through that lock, so "check, then
insert" is effectively one atomic step. The advisory lock is released the
instant that short transaction commits (succeed or lose the race) — it is
never held for the duration of the actual job (the export + pipeline
subprocess). That long work runs with the advisory lock already released;
the 'processing' row left behind by the winning transaction is what
represents "a run is active" for as long as the real work takes.

Recovering a stuck 'processing' row
------------------------------------
There is deliberately no automatic lock expiry or forced re-run here (see
nightly_export.py's module docstring for why) — if the process holding a
'processing' row is killed abruptly (OOM, host crash, `kill -9`) before it
can call `mark_completed`/`mark_failed`, that row stays 'processing'
forever and keeps blocking every future run of that job_name. Recovering
is a manual, deliberate action:

    UPDATE job_runs
       SET status = 'failed',
           finished_at = now(),
           error_message = 'Manually recovered: run abandoned by a killed process.'
     WHERE id = '<the stuck run's id>';

Find the stuck row first with
`SELECT * FROM job_runs WHERE job_name = '...' AND status = 'processing';`
and confirm the underlying process is actually gone (e.g. its PID isn't
running, or enough wall-clock time has passed for a nightly job that it
clearly isn't still legitimately in progress) before updating it — this
is an operator's judgment call, which is exactly why it isn't automated.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from sqlalchemy import insert, select, text, update
from sqlmodel import Session

from app.core.database import engine
from app.models.job_run_storage import job_runs_table

JobStatus = Literal["pending", "processing", "completed", "failed"]

# Why a hash of job_name, not the job_name string itself: Postgres's
# single-key pg_advisory_xact_lock takes one bigint. zlib.crc32 is stable
# across processes/platforms (unlike Python's salted built-in hash()) and
# fits in postgres' bigint range with room to spare.
def _advisory_lock_key(job_name: str) -> int:
    return zlib.crc32(job_name.encode("utf-8"))


def _get_session() -> Session:
    return Session(engine)


@dataclass(frozen=True)
class AcquireResult:
    acquired: bool
    run_id: str | None
    # Populated only when acquired is False — why the caller didn't get
    # the lock, so it can log/exit accordingly without re-deriving it.
    reason: Literal["processing_lock", "already_completed"] | None = None


def has_processing_lock(job_name: str) -> bool:
    """Is there a 'processing' row for this job_name, for ANY target_date?"""
    with _get_session() as db:
        row = db.execute(
            select(job_runs_table.c.id)
            .where(job_runs_table.c.job_name == job_name)
            .where(job_runs_table.c.status == "processing")
        ).first()
        return row is not None


def has_completed_for_date(job_name: str, target_date: date) -> bool:
    """Is there a 'completed' row for this exact (job_name, target_date)?"""
    with _get_session() as db:
        row = db.execute(
            select(job_runs_table.c.id)
            .where(job_runs_table.c.job_name == job_name)
            .where(job_runs_table.c.target_date == target_date)
            .where(job_runs_table.c.status == "completed")
        ).first()
        return row is not None


def create_run(job_name: str, target_date: date, status: JobStatus = "processing") -> str:
    """Insert a new job_runs row and return its id. Bypasses the
    lock/idempotency checks — callers that need those must use
    `try_acquire_run` instead. Exists mainly for `try_acquire_run`'s own
    use and for tests."""
    from uuid import uuid4

    run_id = str(uuid4())
    now = datetime.now(timezone.utc)
    with _get_session() as db:
        db.execute(
            insert(job_runs_table).values(
                id=run_id,
                job_name=job_name,
                target_date=target_date,
                status=status,
                started_at=now if status == "processing" else None,
                finished_at=None,
                error_message=None,
                created_at=now,
            )
        )
        db.commit()
    return run_id


def try_acquire_run(job_name: str, target_date: date) -> AcquireResult:
    """Atomically check the lock + daily-idempotency conditions and, if
    both are clear, insert a new 'processing' row — all inside one
    transaction serialized by a Postgres advisory lock keyed on
    `job_name` (see module docstring). The transaction (and the advisory
    lock with it) is committed/released before this function returns;
    only the 'processing' row it leaves behind represents the active run
    from here on.
    """
    now = datetime.now(timezone.utc)
    with _get_session() as db:
        with db.begin():
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _advisory_lock_key(job_name)})

            processing = db.execute(
                select(job_runs_table.c.id)
                .where(job_runs_table.c.job_name == job_name)
                .where(job_runs_table.c.status == "processing")
            ).first()
            if processing is not None:
                return AcquireResult(acquired=False, run_id=None, reason="processing_lock")

            completed = db.execute(
                select(job_runs_table.c.id)
                .where(job_runs_table.c.job_name == job_name)
                .where(job_runs_table.c.target_date == target_date)
                .where(job_runs_table.c.status == "completed")
            ).first()
            if completed is not None:
                return AcquireResult(acquired=False, run_id=None, reason="already_completed")

            from uuid import uuid4

            run_id = str(uuid4())
            db.execute(
                insert(job_runs_table).values(
                    id=run_id,
                    job_name=job_name,
                    target_date=target_date,
                    status="processing",
                    started_at=now,
                    finished_at=None,
                    error_message=None,
                    created_at=now,
                )
            )
        # `with db.begin()` has committed here — the advisory lock is
        # released, and the long-lived work (export + pipeline subprocess)
        # happens entirely outside this transaction.
        return AcquireResult(acquired=True, run_id=run_id)


def mark_completed(run_id: str) -> None:
    with _get_session() as db:
        db.execute(
            update(job_runs_table)
            .where(job_runs_table.c.id == run_id)
            .values(status="completed", finished_at=datetime.now(timezone.utc))
        )
        db.commit()


def mark_failed(run_id: str, error_message: str) -> None:
    with _get_session() as db:
        db.execute(
            update(job_runs_table)
            .where(job_runs_table.c.id == run_id)
            .values(
                status="failed",
                finished_at=datetime.now(timezone.utc),
                error_message=error_message[:2000],
            )
        )
        db.commit()


def get_run(run_id: str) -> dict | None:
    with _get_session() as db:
        row = db.execute(select(job_runs_table).where(job_runs_table.c.id == run_id)).first()
        return dict(row._mapping) if row is not None else None
