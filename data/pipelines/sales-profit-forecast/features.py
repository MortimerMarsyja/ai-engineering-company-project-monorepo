"""Feature engineering for the monthly revenue forecast.

Target: `revenue_usd`.

`covers_served` and `avg_ticket_usd` are deliberately NOT used as features,
even though they're in the raw CSV: both are only known for the month
being predicted (there's no independent forecast of covers/ticket feeding
this model), so using their contemporaneous value would leak the answer —
`revenue_usd ≈ covers_served × avg_ticket_usd` almost exactly for this
dataset. Only calendar features and the target's own lagged/rolling
history are used.

All lag and rolling features are built from the target itself and are
shifted so that the row for month `t` only ever sees months `< t`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "month_of_year",
    "year",
    "quarter",
    "month_sin",
    "month_cos",
    "lag_1",
    "lag_12",
    "roll_mean_3",
    "roll_mean_6",
]
TARGET_COLUMN = "revenue_usd"


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add engineered feature columns to a chronologically-sorted sales DataFrame.

    Returns a new DataFrame (input is not mutated) with `FEATURE_COLUMNS`
    and `TARGET_COLUMN` added. Rows at the start of the series that don't
    yet have 12 prior months (needed for `lag_12`) have NaN features and
    must be dropped by the caller before training/evaluation — see
    `drop_rows_without_full_history`.
    """
    out = df.copy()

    out["month_of_year"] = out["month"].dt.month
    out["year"] = out["month"].dt.year
    out["quarter"] = out["month"].dt.quarter

    angle = 2 * np.pi * out["month_of_year"] / 12
    out["month_sin"] = np.sin(angle)
    out["month_cos"] = np.cos(angle)

    out["lag_1"] = out[TARGET_COLUMN].shift(1)
    out["lag_12"] = out[TARGET_COLUMN].shift(12)

    # shift(1) first so month t's rolling window covers [t-3, t-1] / [t-6, t-1],
    # never including month t's own (unknown-at-prediction-time) revenue.
    past_revenue = out[TARGET_COLUMN].shift(1)
    out["roll_mean_3"] = past_revenue.rolling(window=3).mean()
    out["roll_mean_6"] = past_revenue.rolling(window=6).mean()

    return out


def drop_rows_without_full_history(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the leading rows that lack a full `lag_12`/`roll_mean_6` history.

    With monthly data and a 12-month lag, this drops the first 12 rows of
    the series (here: 2016-01 through 2016-12), leaving 108 usable rows.
    """
    return df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN]).reset_index(drop=True)


def feature_scaling_note() -> str:
    """Documents the scaling decision (also kept in the pipeline README)."""
    return (
        "No feature scaling/standardization is applied. RandomForestRegressor "
        "splits each feature independently on raw thresholds (it never computes "
        "a distance or a dot product across features), so it is invariant to "
        "monotonic rescaling of any single feature — standardizing would not "
        "change a single split the trees make, only cost extra code and an "
        "extra object (the scaler) to persist and keep in sync with the model."
    )
