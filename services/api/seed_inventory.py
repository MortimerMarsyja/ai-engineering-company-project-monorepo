"""Seed Supabase with the minimum inventory demo data: one product per
restaurant city, plus inbound/outbound orders for each.

There is no literal product/inventory list in CONTEXT.md (it only
mentions "Fresh ingredients selected daily" and the 14 locations), so
this seeds one representative dish per city with enough inbound orders
to comfortably cover one outbound order — net stock stays positive and
always equals sum(inbound) - sum(outbound) for that product/location.

Idempotent: re-running skips any product whose SKU already exists (and
its orders), so it never duplicates data.

Usage (via uv):
    uv run seed-inventory
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.core.database import engine, init_db
from app.models.inbound import InboundStock
from app.models.menu_item import MenuItem
from app.models.outbound import StockExit
from app.services.users import get_user_by_email

# (name, sku, country, city, price_cop, price_usd, [inbound_quantities], outbound_quantity)
SEED_PRODUCTS: list[tuple[str, str, str, str, float, float, list[float], float]] = [
    ("Churrasco Brasaland Medellín", "BRS-MED-001", "Colombia", "Medellín", 45000, 12.0, [20.0, 15.0], 12.0),
    ("Churrasco Brasaland Bogotá", "BRS-BOG-001", "Colombia", "Bogotá", 48000, 12.5, [18.0, 12.0], 10.0),
    ("Churrasco Brasaland Cali", "BRS-CAL-001", "Colombia", "Cali", 44000, 11.5, [22.0, 10.0], 15.0),
    ("Brasaland Churrasco Miami", "BRS-MIA-001", "United States", "Miami", 50000, 13.0, [25.0, 10.0], 8.0),
    ("Brasaland Churrasco Orlando", "BRS-ORL-001", "United States", "Orlando", 49000, 12.75, [20.0, 8.0], 9.0),
]


def seed() -> None:
    init_db()

    # Attribute seeded orders to the seeded admin account (seed_users.py)
    # if it exists yet; fall back to a clearly-labeled placeholder id.
    admin = get_user_by_email("admin@brasaland.com")
    seed_user_uuid = str(admin["id"]) if admin else "seed-script"

    with Session(engine) as db:
        created_products = 0
        skipped_products = 0
        created_inbound = 0
        created_outbound = 0

        for name, sku, country, city, price_cop, price_usd, inbound_qtys, outbound_qty in SEED_PRODUCTS:
            existing = db.exec(select(MenuItem).where(MenuItem.sku == sku)).first()
            if existing is not None:
                print(f"  ⏭  Skipped (already seeded): {sku} — {name}")
                skipped_products += 1
                continue

            product = MenuItem(
                name=name,
                sku=sku,
                category="Meat",
                country=country,
                city=city,
                price_cop=price_cop,
                price_usd=price_usd,
            )
            db.add(product)
            db.commit()
            db.refresh(product)
            created_products += 1

            for qty in inbound_qtys:
                db.add(
                    InboundStock(
                        ingredient_id=product.id,
                        quantity=qty,
                        unit="kg",
                        user_uuid=seed_user_uuid,
                        country=country,
                        city=city,
                    )
                )
                created_inbound += 1

            db.add(
                StockExit(
                    ingredient_id=product.id,
                    quantity=outbound_qty,
                    unit="kg",
                    reason="kitchen_use",
                    user_uuid=seed_user_uuid,
                    country=country,
                    city=city,
                )
            )
            created_outbound += 1
            db.commit()

            net_stock = sum(inbound_qtys) - outbound_qty
            print(
                f"  ✅ Seeded: {sku} — {name} "
                f"({len(inbound_qtys)} inbound, 1 outbound, net stock = {net_stock} kg)"
            )

        print()
        print("─" * 50)
        print("  📊 Summary")
        print(f"     Products created   : {created_products}")
        print(f"     Products skipped   : {skipped_products}")
        print(f"     Inbound orders     : {created_inbound}")
        print(f"     Outbound orders    : {created_outbound}")
        print("─" * 50)


def main() -> None:
    """Entry point for `uv run seed-inventory`."""
    print("🌱 Seeding Brasaland inventory (products, inbound, outbound) into Supabase …")
    seed()
    print("\nDone! ✨")


if __name__ == "__main__":
    main()
