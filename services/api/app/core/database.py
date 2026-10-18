"""Database clients: legacy TinyDB store and the SQLModel/Supabase engine.

TinyDB keeps backing the current services (users, records, incidents,
suppliers). The SQLModel engine is the entry point for anything migrating
to Supabase (Postgres).
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine
from tinydb import TinyDB

from app.core.config import get_settings

settings = get_settings()

# Same db.json used across app/services/*.py and seed*.py
TINYDB_PATH = Path(__file__).resolve().parent.parent.parent / "db.json"


def get_tinydb() -> TinyDB:
    """Return a TinyDB client for the shared db.json file."""
    return TinyDB(TINYDB_PATH)


engine = create_engine(settings.DATABASE_URL, echo=settings.DEBUG)


def init_db() -> None:
    """Create any SQLModel tables that don't exist yet in Supabase."""
    # Imported here (not at module top) so every table=True model is
    # registered on SQLModel.metadata before create_all runs.
    from app.models import inbound, menu_item, outbound  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a fresh SQLModel session per request.

    Use as `db: Session = Depends(get_db)`. Each call opens its own
    session against `engine`, closed once the request finishes.
    """
    with Session(engine) as session:
        yield session
