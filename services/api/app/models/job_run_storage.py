"""SQL storage for `job_runs` — execution log + idempotency/locking source
for background jobs (see supabase/migrations/20261113090000_create_job_runs.sql
for the full contract).

Plain SQLAlchemy Core `Table` on its own unbound `MetaData` — same
pattern as app/models/user_storage.py / allowed_email_storage.py — so
`SQLModel.metadata.create_all()` never touches this migration-owned
table. This module only reads/writes rows; app/services/job_runner.py is
the only thing that should import it.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, MetaData, String, Table, Uuid
from sqlalchemy.types import Date

metadata = MetaData()

job_runs_table = Table(
    "job_runs",
    metadata,
    # Uuid(as_uuid=False) — plain string, cross-dialect (works against
    # both the real Postgres/Supabase engine and a SQLite test engine),
    # same pattern as app/models/allowed_email_storage.py.
    Column("id", Uuid(as_uuid=False), primary_key=True),
    Column("job_name", String, nullable=False),
    Column("target_date", Date, nullable=False),
    Column("status", String, nullable=False),
    Column("started_at", DateTime(timezone=True), nullable=True),
    Column("finished_at", DateTime(timezone=True), nullable=True),
    Column("error_message", String, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
