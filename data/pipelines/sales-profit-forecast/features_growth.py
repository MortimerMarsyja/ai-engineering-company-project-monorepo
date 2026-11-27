"""Feature engineering for the year-over-year (YoY) growth-rate model.

Target: `yoy_growth_t = revenue_usd_t / revenue_usd_(t-12) - 1` — the
percentage change versus the same month last year, instead of absolute
`revenue_usd`. Predicting a growth *rate* is a different bet than
predicting absolute revenue: if growth rates are more stable across years
than the absolute level (plausible for a steadily-growing business), a
model that targets the rate and gets rescaled by a known anchor
(`revenue_usd_(t-12)`, always real historical data) could sidestep
`RandomForestRegressor`'s extrapolation ceiling documented in
`README.md` and `train.py` — since the *rate* needn't exceed anything
seen in training even while the *reconstructed absolute revenue* (rate x
a growing anchor) naturally does.

Built on top of `features.build_features`'s output, reusing its
calendar features and `lag_12` (= `revenue_usd_(t-12)`, needed both as a
feature and later to reconstruct absolute revenue from a predicted rate).
Every growth-derived feature is additionally shifted so month t's features
only ever see growth rates from months `< t` — never `yoy_growth` itself
or any value computed from `revenue_usd_t`.
"""

from __future__ import annotations

import pandas as pd

from features import TARGET_COLUMN, build_features

GROWTH_TARGET_COLUMN = "yoy_growth"

GROWTH_FEATURE_COLUMNS = [
    "month_of_year",
    "year",
    "quarter",
    "month_sin",
    "month_cos",
    "lag_12",  # revenue_usd_(t-12): the reconstruction anchor, also a useful scale feature
    "growth_lag_1",
    "growth_lag_12",
    "growth_roll_mean_3",
    "growth_roll_mean_6",
]


def build_growth_features(df: pd.DataFrame) -> pd.DataFrame:
    """Returns `build_features(df)`'s output plus the growth target and
    growth-lag/rolling features. Does not mutate `df`.
    """
    out = build_features(df)

    # yoy_growth_t uses revenue_usd_t (the value being predicted) and
    # lag_12 (revenue_usd_(t-12), already real historical data) — this is
    # the TARGET definition, not a feature; it's fine for a target to
    # depend on the value being predicted.
    out[GROWTH_TARGET_COLUMN] = out[TARGET_COLUMN] / out["lag_12"] - 1

    # Every feature below is shifted so row t only sees growth rates from
    # months strictly before t.
    past_growth = out[GROWTH_TARGET_COLUMN].shift(1)
    out["growth_lag_1"] = past_growth
    out["growth_lag_12"] = out[GROWTH_TARGET_COLUMN].shift(12)
    out["growth_roll_mean_3"] = past_growth.rolling(window=3).mean()
    out["growth_roll_mean_6"] = past_growth.rolling(window=6).mean()

    return out


def drop_rows_without_full_growth_history(df: pd.DataFrame) -> pd.DataFrame:
    """Drop leading rows lacking a full growth-feature history.

    `growth_lag_12` needs a growth rate computed 12 months back, which
    itself needs `revenue_usd` from 12 months before *that* — the first
    24 months (2016-01 through 2017-12) are dropped, leaving 96 usable
    rows (vs. 108 for the absolute-revenue model, which only drops 12).
    """
    return df.dropna(
        subset=GROWTH_FEATURE_COLUMNS + [GROWTH_TARGET_COLUMN]
    ).reset_index(drop=True)


def reconstruct_revenue(df_with_lag12: pd.DataFrame, predicted_growth) -> pd.Series:
    """`revenue_usd_t = revenue_usd_(t-12) * (1 + predicted_growth_t)`.

    `lag_12` is always a real, already-known historical value — reusing it
    here is not leakage, it's the same anchor the seasonal-naive baseline
    already relies on.
    """
    import numpy as np

    return df_with_lag12["lag_12"].to_numpy() * (1 + np.asarray(predicted_growth, dtype=float))
