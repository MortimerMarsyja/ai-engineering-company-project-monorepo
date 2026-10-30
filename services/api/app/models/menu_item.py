"""MenuItem domain model — Brasaland's product-equivalent entity.

A dish served at a Brasaland restaurant. `sku` is the internal menu code
(POS lookup); `category` reuses the same ProductCategory suppliers are
tagged with, since each dish is built from a supplied category of goods.
Lives in Supabase via the SQLModel engine (app.core.database), separate
from the TinyDB-backed entities (users, records, incidents, suppliers).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Column, String
from sqlmodel import Field, SQLModel

from app.models.schemas import City, Country, DietaryPreference, ProductCategory


class MenuItem(SQLModel, table=True):
    """A dish on the Brasaland menu, scoped to a country (and optionally a city).

    `category`/`country`/`city` are typed as Literal for Pydantic validation
    but stored as plain strings (SQLModel can't map typing.Literal to a
    SQLAlchemy column type on its own).
    """

    __tablename__ = "menu_items"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    sku: str = Field(unique=True, index=True)

    category: ProductCategory = Field(default="Other", sa_column=Column(String))
    country: Country = Field(sa_column=Column(String))
    city: City | None = Field(default=None, sa_column=Column(String, nullable=True))

    price_cop: float = Field(gt=0, description="Price in Colombian pesos")
    price_usd: float = Field(gt=0, description="Price in US dollars")

    dietary_preferences: list[DietaryPreference] = Field(
        default_factory=list, sa_column=Column(JSON)
    )
    is_available: bool = Field(default=True)
    minimum_stock: float = Field(
        default=5.0,
        description="Threshold below which stock_threshold_triggered fires on an outbound order.",
    )

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
