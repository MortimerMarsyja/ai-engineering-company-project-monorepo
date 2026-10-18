"""InboundStock domain model — Brasaland's inbound-equivalent entity.

Records a delivery of ingredients received at a restaurant from a
supplier (context.md: "Fresh ingredients selected daily"). Each row
links back to the MenuItem the stock replenishes.

`user_uuid` identifies the staff member who logged the receipt. Users
are TinyDB documents (app.services.users), a separate store from this
Supabase table, so it is kept as a plain string with no SQL-level FK.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel

from app.models.schemas import City, Country


class InboundStock(SQLModel, table=True):
    """A single ingredient delivery received at a Brasaland location."""

    __tablename__ = "inbound_stock"

    id: int | None = Field(default=None, primary_key=True)

    # FK to the product-equivalent entity (MenuItem.id in Supabase).
    ingredient_id: int = Field(foreign_key="menu_items.id", index=True)

    quantity: float = Field(gt=0)
    unit: str = Field(default="kg", description="Unit of measure: kg, L, units, ...")

    # Who supplied and who logged the delivery.
    supplier_id: int | None = Field(
        default=None,
        description="Supplier doc_id from the TinyDB suppliers table (no SQL FK across stores)",
    )
    user_uuid: str = Field(index=True, description="UUID/id of the staff member who logged this receipt")

    # Which restaurant location received the stock.
    country: Country = Field(sa_column=Column(String))
    city: City | None = Field(default=None, sa_column=Column(String, nullable=True))

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
