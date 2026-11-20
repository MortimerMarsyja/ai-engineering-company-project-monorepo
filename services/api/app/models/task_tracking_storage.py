"""SQL storage for `task_submissions` and `task_dead_letters` — see
supabase/migrations/20261118100000_create_task_tracking_tables.sql for the
full contract. Plain SQLAlchemy Core `Table`s on their own unbound
`MetaData`, same pattern as app/models/job_run_storage.py /
allowed_email_storage.py, so `SQLModel.metadata.create_all()` never
touches these migration-owned tables. Only app/services/task_tracking.py
should import this module.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, Uuid

metadata = MetaData()

task_submissions_table = Table(
    "task_submissions",
    metadata,
    Column("task_id", String, primary_key=True),
    Column("task_name", String, nullable=False),
    Column("submitted_by", Integer, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("persisted_at", DateTime(timezone=True), nullable=True),
)

task_dead_letters_table = Table(
    "task_dead_letters",
    metadata,
    # Uuid(as_uuid=False) — plain string, cross-dialect (works against
    # both the real Postgres/Supabase engine and a SQLite test engine),
    # same pattern as app/models/allowed_email_storage.py.
    Column("id", Uuid(as_uuid=False), primary_key=True),
    Column("task_id", String, nullable=False, unique=True),
    Column("task_name", String, nullable=True),
    Column("attempt_number", Integer, nullable=False),
    Column("error_message", String, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
