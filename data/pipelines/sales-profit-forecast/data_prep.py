"""Load and validate the Brasaland historical sales dataset.

Source: `data/raw/sales/brasaland_sales.csv` (see that folder's README for
provenance notes). No schema document for this specific dataset exists in
the repo today (checked `CONTEXT.md`/`CONTEXT.es.md` and `docs/*.md` — none
mention it), so validation below checks the dataset's own internal
consistency (types, duplicates, monthly continuity) rather than against an
external contract that doesn't exist.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CSV_PATH = REPO_ROOT / "data" / "raw" / "sales" / "brasaland_sales.csv"

REQUIRED_COLUMNS = ["month", "revenue_usd", "covers_served", "avg_ticket_usd", "market"]
NUMERIC_COLUMNS = ["revenue_usd", "covers_served", "avg_ticket_usd"]


class DataValidationError(ValueError):
    """Raised when the dataset fails a hard validation check."""


def load_sales_data(csv_path: Path | str = DEFAULT_CSV_PATH) -> pd.DataFrame:
    """Load, validate and clean the monthly sales dataset.

    Returns a DataFrame sorted chronologically by `month`, with `month` as
    a proper `datetime64[ns]` column and numeric columns coerced to float.
    Raises `DataValidationError` on any problem that cannot be safely
    auto-corrected (missing required columns, duplicate months, a gap in
    the monthly sequence). Rows with unparseable values are dropped and
    reported, never silently coerced to a guessed number.
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise DataValidationError(f"Sales CSV not found at {csv_path}")

    df = pd.read_csv(csv_path)

    missing_cols = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing_cols:
        raise DataValidationError(f"Missing required columns: {sorted(missing_cols)}")

    df["month"] = pd.to_datetime(df["month"], errors="coerce")
    unparseable_dates = int(df["month"].isna().sum())
    if unparseable_dates:
        df = df.dropna(subset=["month"])

    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    unparseable_numeric = int(df[NUMERIC_COLUMNS].isna().any(axis=1).sum())
    if unparseable_numeric:
        df = df.dropna(subset=NUMERIC_COLUMNS)

    df = df.sort_values("month").reset_index(drop=True)

    duplicate_months = df["month"][df["month"].duplicated()].tolist()
    if duplicate_months:
        raise DataValidationError(
            f"Duplicate month(s) in dataset: {sorted(set(d.date().isoformat() for d in duplicate_months))}"
        )

    expected_months = pd.date_range(df["month"].min(), df["month"].max(), freq="MS")
    missing_months = sorted(set(expected_months) - set(df["month"]))
    if missing_months:
        raise DataValidationError(
            f"Dataset has gaps in the monthly sequence: "
            f"{[m.date().isoformat() for m in missing_months]}"
        )

    if (df[NUMERIC_COLUMNS] < 0).any().any():
        raise DataValidationError("Negative value found in a numeric column (revenue/covers/ticket).")

    if unparseable_dates or unparseable_numeric:
        print(
            f"[data_prep] Dropped {unparseable_dates} row(s) with an unparseable date and "
            f"{unparseable_numeric} row(s) with an unparseable numeric value."
        )

    n_markets = df["market"].nunique()
    if n_markets == 1:
        print(
            f"[data_prep] Note: `market` has a single constant value "
            f"({df['market'].iloc[0]!r}) across all {len(df)} rows — it carries no "
            "discriminative information for this dataset and is not used as a feature."
        )

    return df


if __name__ == "__main__":
    data = load_sales_data()
    print(data.describe(include="all"))
