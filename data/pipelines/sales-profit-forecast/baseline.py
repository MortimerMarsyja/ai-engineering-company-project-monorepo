"""Seasonal-naive baseline: predict month t's revenue as month (t-12)'s actual revenue."""

from __future__ import annotations

import numpy as np
import pandas as pd


def seasonal_naive_predict(df_with_lag12: pd.DataFrame) -> np.ndarray:
    """`lag_12` IS the seasonal-naive prediction — this just names that intent."""
    return df_with_lag12["lag_12"].to_numpy()


def seasonal_naive_forecast_next_n_months(full_df: pd.DataFrame, n_months: int = 12) -> pd.DataFrame:
    """Forecast each of the next `n_months` as the actual revenue from 12
    months before it. Only valid for `n_months <= 12`: every "12 months
    before" value then falls inside the already-known history, so this
    needs no recursion (unlike `forecast.forecast_next_n_months`, which
    must feed its own predictions back in once it runs past 12 steps).
    """
    if n_months > 12:
        raise ValueError("seasonal_naive_forecast_next_n_months only supports n_months <= 12")

    from features import TARGET_COLUMN

    history = full_df[["month", TARGET_COLUMN]].reset_index(drop=True)
    last_month = history["month"].iloc[-1]
    rows = []
    for i in range(1, n_months + 1):
        next_month = last_month + pd.DateOffset(months=i)
        anchor_month = next_month - pd.DateOffset(months=12)
        anchor_value = history.loc[history["month"] == anchor_month, TARGET_COLUMN]
        rows.append({"month": next_month, TARGET_COLUMN: float(anchor_value.iloc[0])})
    return pd.DataFrame(rows)
