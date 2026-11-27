"""End-to-end orchestration: train -> evaluate -> forecast -> visualize -> save artifacts.

Run with: `.venv/bin/python pipeline.py` from this directory.

Writes everything under `data/process/sales-profit-forecast/` (gitignored —
regenerable from `data/raw/sales/brasaland_sales.csv` by re-running this
script), matching this repo's `data/process` convention (pipeline-produced
artifacts, separate from raw source data):
  - `model.joblib` / `model_growth.joblib` — the two fitted RandomForestRegressors.
  - `metrics.json` — all three candidates' metrics + the selected best model, dashboard-consumable.
  - `forecast.csv` — next 12 months' forecasted revenue (from the best model), dashboard-consumable.
  - `plots/*.png` — the 7 requested charts plus the 3-way model comparison.
"""

from __future__ import annotations

import json
from pathlib import Path

import _pathsetup  # noqa: F401
from baseline import seasonal_naive_forecast_next_n_months
from data_prep import load_sales_data
from evaluate import evaluate_model, save_metrics
from evaluate_growth import evaluate_growth_model, save_growth_comparison, select_best_model
from features import FEATURE_COLUMNS
from features_growth import GROWTH_FEATURE_COLUMNS
from forecast import forecast_next_n_months
from predictions_export import save_predictions
from train import run_training
from train_growth import run_growth_training
from visualize import (
    plot_actual_vs_predicted,
    plot_feature_importance,
    plot_forecast,
    plot_historical_revenue,
    plot_model_vs_baseline,
    plot_prediction_errors,
    plot_seasonality,
    plot_three_way_comparison,
)

OUT_DIR = Path(__file__).resolve().parents[3] / "data" / "process" / "sales-profit-forecast"
PLOTS_DIR = OUT_DIR / "plots"
FORECAST_OUT_PATH = OUT_DIR / "forecast.csv"


def run_pipeline() -> dict:
    trained = run_training()
    model, train_df, test_df = trained["model"], trained["train_df"], trained["test_df"]
    eval_results = evaluate_model(model, train_df, test_df)

    trained_growth = run_growth_training()
    growth_results = evaluate_growth_model(
        trained_growth["model"], trained_growth["train_df"], trained_growth["test_df"]
    )

    best_model = select_best_model(
        {
            "random_forest_revenue": eval_results["model_metrics"],
            "random_forest_growth": growth_results["revenue_metrics"],
            "seasonal_naive": eval_results["baseline_metrics"],
        }
    )
    save_growth_comparison(
        eval_results["model_metrics"],
        eval_results["baseline_metrics"],
        growth_results["revenue_metrics"],
        best_model,
    )

    full_df = load_sales_data()

    # Every candidate's own 12-month forward forecast — not just the
    # winner's — so the dashboard can show "prediction by model".
    forecast_revenue_model = forecast_next_n_months(model, full_df, n_months=12)
    forecast_growth_model = _forecast_with_growth_model(trained_growth["model"], full_df)
    forecast_seasonal_naive = seasonal_naive_forecast_next_n_months(full_df, n_months=12)

    forecast_by_winner = {
        "random_forest_revenue": forecast_revenue_model,
        "random_forest_growth": forecast_growth_model,
        "seasonal_naive": forecast_seasonal_naive,
    }
    forecast_df = forecast_by_winner[best_model["winner"]]

    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    forecast_df.to_csv(FORECAST_OUT_PATH, index=False)

    save_predictions(
        full_df=full_df,
        test_df=test_df,
        model_pred=eval_results["test_predictions"],
        growth_pred_revenue=growth_results["test_predictions_revenue"],
        baseline_pred=eval_results["baseline_predictions"],
        forecast_revenue_model=forecast_revenue_model,
        forecast_growth_model=forecast_growth_model,
        forecast_seasonal_naive=forecast_seasonal_naive,
    )

    figures = {
        "01_historical_revenue.png": plot_historical_revenue(full_df),
        "02_actual_vs_predicted.png": plot_actual_vs_predicted(test_df, eval_results["test_predictions"]),
        "03_prediction_errors.png": plot_prediction_errors(test_df, eval_results["test_predictions"]),
        "04_seasonality.png": plot_seasonality(full_df),
        "05_feature_importance.png": plot_feature_importance(model, FEATURE_COLUMNS),
        "06_model_vs_baseline.png": plot_model_vs_baseline(
            eval_results["model_metrics"], eval_results["baseline_metrics"]
        ),
        "07_forecast_next_12_months.png": plot_forecast(full_df, forecast_df),
        "08_actual_vs_predicted_growth.png": plot_actual_vs_predicted(
            trained_growth["test_df"], growth_results["test_predictions_revenue"]
        ),
        "09_feature_importance_growth.png": plot_feature_importance(
            trained_growth["model"], GROWTH_FEATURE_COLUMNS
        ),
        "10_model_comparison_three_way.png": plot_three_way_comparison(
            eval_results["model_metrics"], growth_results["revenue_metrics"], eval_results["baseline_metrics"]
        ),
    }
    for filename, fig in figures.items():
        fig.savefig(PLOTS_DIR / filename, dpi=150)

    return {
        "trained": trained,
        "trained_growth": trained_growth,
        "eval_results": eval_results,
        "growth_results": growth_results,
        "best_model": best_model,
        "full_df": full_df,
        "forecast_df": forecast_df,
    }


def _forecast_with_growth_model(growth_model, full_df):
    """Recursive 12-month forecast using the growth model: predict next
    month's YoY growth rate, reconstruct revenue via `lag_12 * (1 + growth)`,
    append, repeat — same recursive structure as `forecast.py`, adapted for
    a growth-rate model instead of a revenue model.
    """
    import numpy as np
    import pandas as pd

    from features import TARGET_COLUMN

    history = full_df[["month", TARGET_COLUMN]].copy().reset_index(drop=True)
    forecasts = []

    for _ in range(12):
        next_month = history["month"].iloc[-1] + pd.DateOffset(months=1)
        revenue = history[TARGET_COLUMN]
        lag_12 = revenue.iloc[-12]
        growth_series = (revenue / revenue.shift(12) - 1).dropna().reset_index(drop=True)

        angle = 2 * np.pi * next_month.month / 12
        row = pd.DataFrame(
            [
                {
                    "month_of_year": next_month.month,
                    "year": next_month.year,
                    "quarter": (next_month.month - 1) // 3 + 1,
                    "month_sin": np.sin(angle),
                    "month_cos": np.cos(angle),
                    "lag_12": lag_12,
                    "growth_lag_1": growth_series.iloc[-1],
                    "growth_lag_12": growth_series.iloc[-12],
                    "growth_roll_mean_3": growth_series.iloc[-3:].mean(),
                    "growth_roll_mean_6": growth_series.iloc[-6:].mean(),
                }
            ]
        )[GROWTH_FEATURE_COLUMNS]

        predicted_growth = float(growth_model.predict(row)[0])
        predicted_revenue = lag_12 * (1 + predicted_growth)

        forecasts.append({"month": next_month, TARGET_COLUMN: predicted_revenue})
        history = pd.concat(
            [history, pd.DataFrame([{"month": next_month, TARGET_COLUMN: predicted_revenue}])],
            ignore_index=True,
        )

    return pd.DataFrame(forecasts)


if __name__ == "__main__":
    results = run_pipeline()
    print(f"Best hyperparameters (revenue model): {results['trained']['best_params']}")
    print(f"Best hyperparameters (growth model): {results['trained_growth']['best_params']}")
    print("Revenue model metrics:", json.dumps(results["eval_results"]["model_metrics"], indent=2))
    print("Growth model metrics (reconstructed):", json.dumps(results["growth_results"]["revenue_metrics"], indent=2))
    print("Baseline metrics:", json.dumps(results["eval_results"]["baseline_metrics"], indent=2))
    print("Best model:", json.dumps(results["best_model"], indent=2))
    print(f"\nForecast (next 12 months, using {results['best_model']['winner']}) written to {FORECAST_OUT_PATH}")
    print(results["forecast_df"])
    print(f"\nPlots written to {PLOTS_DIR}")
