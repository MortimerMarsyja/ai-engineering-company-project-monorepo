"""Multi-month recursive forecasting.

Distinct from the test-set evaluation in `evaluate.py`: that one is
**one-month-ahead** — every test row's `lag_1`/`lag_12`/rolling features
come from real historical revenue, even when predicting 2024-2025. This
module instead forecasts forward from the end of the *entire* known
series (through 2025-12), where no real future revenue exists yet — each
predicted month's lag/rolling features must be built from the model's
*own* previous predictions, recursively. Errors can compound month over
month; this is a materially harder and less reliable regime than the
one-month-ahead test metrics in `evaluate.py`, and the two must never be
reported as the same kind of accuracy.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from features import FEATURE_COLUMNS, TARGET_COLUMN


def _features_for_next_month(history: pd.DataFrame, next_month: pd.Timestamp) -> pd.DataFrame:
    revenue = history[TARGET_COLUMN]
    angle = 2 * np.pi * next_month.month / 12
    row = {
        "month_of_year": next_month.month,
        "year": next_month.year,
        "quarter": (next_month.month - 1) // 3 + 1,
        "month_sin": np.sin(angle),
        "month_cos": np.cos(angle),
        "lag_1": revenue.iloc[-1],
        "lag_12": revenue.iloc[-12],
        "roll_mean_3": revenue.iloc[-3:].mean(),
        "roll_mean_6": revenue.iloc[-6:].mean(),
    }
    return pd.DataFrame([row])[FEATURE_COLUMNS]


def forecast_next_n_months(
    model: RandomForestRegressor, full_history_df: pd.DataFrame, n_months: int = 12
) -> pd.DataFrame:
    """Recursively forecast `n_months` beyond the end of `full_history_df`.

    `full_history_df` must have at least 12 rows and columns `month`,
    `TARGET_COLUMN`, sorted chronologically (the raw validated dataset,
    before `build_features`/`drop_rows_without_full_history` — this
    function builds its own lag features per step).
    """
    history = full_history_df[["month", TARGET_COLUMN]].copy().reset_index(drop=True)
    forecasts = []

    for _ in range(n_months):
        next_month = history["month"].iloc[-1] + pd.DateOffset(months=1)
        X_next = _features_for_next_month(history, next_month)
        y_next = float(model.predict(X_next)[0])

        forecasts.append({"month": next_month, TARGET_COLUMN: y_next})
        history = pd.concat(
            [history, pd.DataFrame([{"month": next_month, TARGET_COLUMN: y_next}])],
            ignore_index=True,
        )

    return pd.DataFrame(forecasts)
