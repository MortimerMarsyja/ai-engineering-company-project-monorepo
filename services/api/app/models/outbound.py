"""StockExit domain model — Brasaland's outbound-equivalent entity.

Records ingredient stock leaving a restaurant's inventory: consumed in
kitchen prep or discarded (context.md: "Fresh ingredients selected
daily" implies spoilage/waste tracking, not just consumption). Mirrors
InboundStock's shape and FK pattern (app.models.inbound).

`user_uuid` identifies the staff member who logged the exit. Users are
TinyDB documents (app.services.users), a separate store from this
Supabase table, so it is kept as a plain string with no SQL-level FK.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel

from app.models.schemas import City, Country, ExitReason


class StockExit(SQLModel, table=True):
    """A single ingredient withdrawal from a Brasaland location's inventory."""

    __tablename__ = "stock_exits"

    id: int | None = Field(default=None, primary_key=True)

    # FK to the product-equivalent entity (MenuItem.id in Supabase).
    ingredient_id: int = Field(foreign_key="menu_items.id", index=True)

    quantity: float = Field(gt=0)
    unit: str = Field(default="kg", description="Unit of measure: kg, L, units, ...")
    reason: ExitReason = Field(
        default="kitchen_use", sa_column=Column(String)
    )

    user_uuid: str = Field(index=True, description="UUID/id of the staff member who logged this exit")

    # Which restaurant location the stock left from.
    country: Country = Field(sa_column=Column(String))
    city: City | None = Field(default=None, sa_column=Column(String, nullable=True))

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
