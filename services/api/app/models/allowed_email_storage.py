"""SQL storage for `allowed_registration_emails`.

Plain SQLAlchemy Core `Table` on its own unbound `MetaData` — same pattern
as `app/models/user_storage.py` — so `SQLModel.metadata.create_all()`
never touches this migration-owned table. DDL authority lives in
`supabase/migrations/20261111120000_create_allowed_registration_emails.sql`;
this module only reads/writes rows.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, Uuid

metadata = MetaData()

allowed_registration_emails_table = Table(
    "allowed_registration_emails",
    metadata,
    # Uuid(as_uuid=False) — plain string, cross-dialect (works against both
    # the real Postgres/Supabase engine and the SQLite test engine in
    # tests/conftest.py), same pattern as app/models/candidate_storage.py.
    Column("id", Uuid(as_uuid=False), primary_key=True),
    Column("email", String, nullable=False, unique=True),
    Column("added_by", Integer, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
