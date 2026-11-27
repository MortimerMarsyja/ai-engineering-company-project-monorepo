"""One-month-ahead evaluation on the held-out test set (2024-2025), plus
comparison against the seasonal-naive baseline. See `forecast.py`'s
docstring for why this is a different regime than the 12-month recursive
forecast.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from baseline import seasonal_naive_predict
from features import FEATURE_COLUMNS, TARGET_COLUMN
from metrics import compute_all_metrics

METRICS_OUT_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "process" / "sales-profit-forecast" / "metrics.json"
)


def evaluate_model(
    model: RandomForestRegressor, train_df: pd.DataFrame, test_df: pd.DataFrame
) -> dict:
    """Returns model metrics, baseline metrics, and the raw predictions
    needed for the plots in `visualize.py`.
    """
    y_test = test_df[TARGET_COLUMN].to_numpy()

    train_pred = model.predict(train_df[FEATURE_COLUMNS])
    test_pred = model.predict(test_df[FEATURE_COLUMNS])

    model_metrics = compute_all_metrics(y_test, test_pred, psi_reference=train_pred)
    baseline_pred = seasonal_naive_predict(test_df)
    baseline_metrics = compute_all_metrics(y_test, baseline_pred)

    return {
        "model_metrics": model_metrics,
        "baseline_metrics": baseline_metrics,
        "test_predictions": test_pred,
        "baseline_predictions": baseline_pred,
        "y_test": y_test,
    }


def save_metrics(model_metrics: dict, baseline_metrics: dict, path: Path = METRICS_OUT_PATH) -> None:
    """Writes a dashboard-consumable metrics file (plain JSON, no DataFrame)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": {"name": "RandomForestRegressor", "metrics": model_metrics},
        "baseline": {"name": "seasonal_naive", "metrics": baseline_metrics},
    }
    path.write_text(json.dumps(payload, indent=2))


if __name__ == "__main__":
    import _pathsetup  # noqa: F401
    from train import run_training

    trained = run_training()
    results = evaluate_model(trained["model"], trained["train_df"], trained["test_df"])
    save_metrics(results["model_metrics"], results["baseline_metrics"])

    print("Model metrics:", json.dumps(results["model_metrics"], indent=2))
    print("Baseline metrics:", json.dumps(results["baseline_metrics"], indent=2))
