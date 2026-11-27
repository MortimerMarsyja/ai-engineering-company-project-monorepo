"""Per-model prediction series for the backoffice dashboard.

`metrics.json` only has aggregate numbers (MAE, RMSE, ...) — enough to say
*which* model won, but not enough to let someone look at what each model
actually predicted, month by month. This module assembles that: the
one-month-ahead test-period predictions for all three candidates (same 24
months, same ground truth — see `README.md`'s comparison table), and each
candidate's own 12-month forward forecast (not just the winner's), so the
dashboard can show "prediction by model" rather than only the single
winning forecast.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from features import TARGET_COLUMN

PREDICTIONS_OUT_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "process" / "sales-profit-forecast" / "predictions.json"
)


def _series(df: pd.DataFrame) -> list[dict]:
    return [
        {"month": m.date().isoformat(), "revenue_usd": float(v)}
        for m, v in zip(df["month"], df[TARGET_COLUMN])
    ]


def _test_period_payload(
    test_df: pd.DataFrame,
    model_pred: "pd.Series | list",
    growth_pred_revenue: "pd.Series | list",
    baseline_pred: "pd.Series | list",
) -> dict:
    months = [m.date().isoformat() for m in test_df["month"]]
    return {
        "months": months,
        "actual": test_df[TARGET_COLUMN].round(2).tolist(),
        "random_forest_revenue": [round(float(v), 2) for v in model_pred],
        "random_forest_growth": [round(float(v), 2) for v in growth_pred_revenue],
        "seasonal_naive": [round(float(v), 2) for v in baseline_pred],
    }


def save_predictions(
    full_df: pd.DataFrame,
    test_df: pd.DataFrame,
    model_pred,
    growth_pred_revenue,
    baseline_pred,
    forecast_revenue_model: pd.DataFrame,
    forecast_growth_model: pd.DataFrame,
    forecast_seasonal_naive: pd.DataFrame,
    path: Path = PREDICTIONS_OUT_PATH,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "historical": _series(full_df),
        "test_period": _test_period_payload(test_df, model_pred, growth_pred_revenue, baseline_pred),
        "forecast_by_model": {
            "random_forest_revenue": _series(forecast_revenue_model),
            "random_forest_growth": _series(forecast_growth_model),
            "seasonal_naive": _series(forecast_seasonal_naive),
        },
    }
    path.write_text(json.dumps(payload, indent=2))
