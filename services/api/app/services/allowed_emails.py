"""Registration-whitelist service — admin-managed allowlist of emails
permitted to self-register via POST /api/v1/users.

Same per-call `Session(engine)` pattern as app/services/users.py. Emails
are compared case-insensitively (lower-cased on write and on lookup), so
`Admin@Example.com` and `admin@example.com` are the same entry — the
`users` table itself stores whatever case the registrant typed, which is
why lookups here normalize both sides rather than trusting raw equality.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, func, insert, select
from sqlmodel import Session

from app.core.database import engine
from app.models.allowed_email_storage import allowed_registration_emails_table
from app.models.user_storage import users_table


def _get_session() -> Session:
    return Session(engine)


def _normalize(email: str) -> str:
    return email.strip().lower()


def _build_response(row, registered: bool) -> dict:
    created_at = row.created_at
    return {
        "id": str(row.id),
        "email": row.email,
        "added_by": row.added_by,
        "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
        "registered": registered,
    }


def is_email_allowed(email: str) -> bool:
    with _get_session() as db:
        row = db.execute(
            select(allowed_registration_emails_table.c.id).where(
                allowed_registration_emails_table.c.email == _normalize(email)
            )
        ).first()
        return row is not None


def list_allowed_emails() -> list[dict]:
    """Every whitelist entry, newest first, flagged with whether an
    account with that email already exists."""
    with _get_session() as db:
        rows = db.execute(
            select(allowed_registration_emails_table).order_by(
                allowed_registration_emails_table.c.created_at.desc()
            )
        ).all()
        registered_emails = {
            email
            for (email,) in db.execute(select(func.lower(users_table.c.email))).all()
        }
        return [_build_response(row, row.email in registered_emails) for row in rows]


def add_allowed_email(email: str, added_by: int | None) -> dict:
    """Raises ValueError if the email is already whitelisted."""
    normalized = _normalize(email)
    with _get_session() as db:
        existing = db.execute(
            select(allowed_registration_emails_table.c.id).where(
                allowed_registration_emails_table.c.email == normalized
            )
        ).first()
        if existing is not None:
            raise ValueError(f"'{normalized}' is already on the allowed list.")

        entry_id = str(uuid4())
        db.execute(
            insert(allowed_registration_emails_table).values(
                id=entry_id,
                email=normalized,
                added_by=added_by,
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        row = db.execute(
            select(allowed_registration_emails_table).where(
                allowed_registration_emails_table.c.id == entry_id
            )
        ).one()
        already_registered = (
            db.execute(
                select(users_table.c.id).where(func.lower(users_table.c.email) == normalized)
            ).first()
            is not None
        )
        return _build_response(row, already_registered)


def remove_allowed_email(entry_id: UUID) -> bool:
    """Returns False if no entry with that id exists."""
    entry_id_str = str(entry_id)
    with _get_session() as db:
        existing = db.execute(
            select(allowed_registration_emails_table.c.id).where(
                allowed_registration_emails_table.c.id == entry_id_str
            )
        ).first()
        if existing is None:
            return False
        db.execute(
            delete(allowed_registration_emails_table).where(
                allowed_registration_emails_table.c.id == entry_id_str
            )
        )
        db.commit()
        return True
