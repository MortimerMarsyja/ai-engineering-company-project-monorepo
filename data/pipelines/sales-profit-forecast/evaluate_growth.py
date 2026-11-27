"""Evaluate the YoY-growth model and compare it against the original
absolute-revenue RandomForestRegressor and the seasonal-naive baseline,
all on the *same* reconstructed-revenue scale and the *same* 24 test
months (2024-2025), so the comparison is apples-to-apples.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from features import TARGET_COLUMN
from features_growth import GROWTH_FEATURE_COLUMNS, GROWTH_TARGET_COLUMN, reconstruct_revenue
from metrics import compute_all_metrics

METRICS_OUT_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "process" / "sales-profit-forecast" / "metrics.json"
)


def evaluate_growth_model(
    model: RandomForestRegressor, train_df: pd.DataFrame, test_df: pd.DataFrame
) -> dict:
    """Mirrors `evaluate.evaluate_model`'s shape, but on the growth model:
    predicts the growth rate, then reconstructs absolute revenue via
    `lag_12 * (1 + predicted_growth)` before computing the same metrics
    used for the other two models, so all three are comparable.
    """
    y_test_growth = test_df[GROWTH_TARGET_COLUMN].to_numpy()
    y_test_revenue = test_df[TARGET_COLUMN].to_numpy()

    train_pred_growth = model.predict(train_df[GROWTH_FEATURE_COLUMNS])
    test_pred_growth = model.predict(test_df[GROWTH_FEATURE_COLUMNS])

    train_pred_revenue = reconstruct_revenue(train_df, train_pred_growth)
    test_pred_revenue = reconstruct_revenue(test_df, test_pred_growth)

    revenue_metrics = compute_all_metrics(
        y_test_revenue, test_pred_revenue, psi_reference=train_pred_revenue
    )
    growth_rate_mae = float(np.mean(np.abs(y_test_growth - test_pred_growth)))

    return {
        "revenue_metrics": revenue_metrics,
        "growth_rate_mae": growth_rate_mae,
        "test_predictions_growth": test_pred_growth,
        "test_predictions_revenue": test_pred_revenue,
        "y_test_growth": y_test_growth,
        "y_test_revenue": y_test_revenue,
    }


def select_best_model(candidates: dict[str, dict]) -> dict:
    """`candidates` maps a model name to its metrics dict (must include "mae").
    Selection rule: lowest test-set MAE on reconstructed/absolute revenue
    — the same unit (USD) and the same 24 test months for every candidate,
    so MAE is directly comparable without any further normalization.
    """
    ranked = sorted(candidates.items(), key=lambda item: item[1]["mae"])
    return {
        "winner": ranked[0][0],
        "ranking": [{"model": name, "mae": metrics["mae"]} for name, metrics in ranked],
    }


def save_growth_comparison(
    model_metrics: dict,
    baseline_metrics: dict,
    growth_metrics: dict,
    best_model: dict,
    path: Path = METRICS_OUT_PATH,
) -> None:
    """Overwrites `metrics.json` with all three models + the selection result,
    keeping every existing model's metrics (nothing from the original
    comparison is dropped, per the task's "retain all existing evaluation
    results" instruction).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "random_forest_revenue": {"name": "RandomForestRegressor (absolute revenue)", "metrics": model_metrics},
        "random_forest_growth": {
            "name": "RandomForestRegressor (YoY growth, reconstructed)",
            "metrics": growth_metrics,
        },
        "baseline": {"name": "seasonal_naive", "metrics": baseline_metrics},
        "best_model": best_model,
    }
    path.write_text(json.dumps(payload, indent=2))


if __name__ == "__main__":
    import _pathsetup  # noqa: F401
    from baseline import seasonal_naive_predict
    from train import run_training
    from train_growth import run_growth_training

    original = run_training()
    growth = run_growth_training()

    from evaluate import evaluate_model

    original_results = evaluate_model(original["model"], original["train_df"], original["test_df"])
    growth_results = evaluate_growth_model(growth["model"], growth["train_df"], growth["test_df"])

    best = select_best_model(
        {
            "random_forest_revenue": original_results["model_metrics"],
            "random_forest_growth": growth_results["revenue_metrics"],
            "seasonal_naive": original_results["baseline_metrics"],
        }
    )
    save_growth_comparison(
        original_results["model_metrics"],
        original_results["baseline_metrics"],
        growth_results["revenue_metrics"],
        best,
    )

    print("Original RF (revenue) metrics:", json.dumps(original_results["model_metrics"], indent=2))
    print("Growth RF (reconstructed revenue) metrics:", json.dumps(growth_results["revenue_metrics"], indent=2))
    print("Seasonal naive metrics:", json.dumps(original_results["baseline_metrics"], indent=2))
    print("Best model:", json.dumps(best, indent=2))
