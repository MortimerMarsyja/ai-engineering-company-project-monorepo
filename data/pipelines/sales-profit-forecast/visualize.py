"""The 7 requested charts. Each function returns the Matplotlib `Figure` it
built (never calls `plt.show()`) so the caller decides whether to save,
embed in the notebook, or both. USD values are formatted with thousands
separators via `matplotlib.ticker.FuncFormatter`.
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter

from features import TARGET_COLUMN

USD = FuncFormatter(lambda x, _: f"${x:,.0f}")


def _new_fig(figsize=(10, 5)) -> tuple[Figure, plt.Axes]:
    fig, ax = plt.subplots(figsize=figsize)
    return fig, ax


def plot_historical_revenue(full_df: pd.DataFrame) -> Figure:
    fig, ax = _new_fig()
    ax.plot(full_df["month"], full_df[TARGET_COLUMN], color="#2563eb", linewidth=1.8)
    ax.set_title("Brasaland — Historical Monthly Revenue (2016-2025)")
    ax.set_xlabel("Month")
    ax.set_ylabel("Revenue (USD)")
    ax.yaxis.set_major_formatter(USD)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return fig


def plot_actual_vs_predicted(test_df: pd.DataFrame, test_pred: np.ndarray) -> Figure:
    fig, ax = _new_fig()
    ax.plot(test_df["month"], test_df[TARGET_COLUMN], label="Actual", color="#111827", marker="o")
    ax.plot(test_df["month"], test_pred, label="Predicted (RandomForest)", color="#dc2626", marker="o")
    ax.set_title("Actual vs. Predicted Revenue — Test Period (2024-2025, one-month-ahead)")
    ax.set_xlabel("Month")
    ax.set_ylabel("Revenue (USD)")
    ax.yaxis.set_major_formatter(USD)
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return fig


def plot_prediction_errors(test_df: pd.DataFrame, test_pred: np.ndarray) -> Figure:
    errors = test_df[TARGET_COLUMN].to_numpy() - test_pred
    fig, ax = _new_fig()
    colors = np.where(errors >= 0, "#16a34a", "#dc2626")
    ax.bar(test_df["month"], errors, color=colors, width=20)
    ax.axhline(0, color="black", linewidth=0.8)
    ax.set_title("Prediction Error Over Time (Actual − Predicted)")
    ax.set_xlabel("Month")
    ax.set_ylabel("Error (USD)")
    ax.yaxis.set_major_formatter(USD)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return fig


def plot_seasonality(full_df: pd.DataFrame) -> Figure:
    by_month = full_df.groupby(full_df["month"].dt.month)[TARGET_COLUMN].mean()
    fig, ax = _new_fig()
    ax.bar(by_month.index, by_month.values, color="#7c3aed")
    ax.set_title("Average Revenue by Calendar Month (Seasonality, 2016-2025)")
    ax.set_xlabel("Month")
    ax.set_ylabel("Average Revenue (USD)")
    ax.set_xticks(range(1, 13))
    ax.yaxis.set_major_formatter(USD)
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    return fig


def plot_feature_importance(model, feature_columns: list[str]) -> Figure:
    importances = pd.Series(model.feature_importances_, index=feature_columns).sort_values()
    fig, ax = _new_fig()
    ax.barh(importances.index, importances.values, color="#0891b2")
    ax.set_title("RandomForestRegressor Feature Importance")
    ax.set_xlabel("Importance")
    fig.tight_layout()
    return fig


def plot_model_vs_baseline(model_metrics: dict, baseline_metrics: dict) -> Figure:
    labels = ["mae", "rmse", "wape"]
    model_vals = [model_metrics[m] for m in labels]
    baseline_vals = [baseline_metrics[m] for m in labels]

    x = np.arange(len(labels))
    width = 0.35
    fig, ax = _new_fig()
    ax.bar(x - width / 2, model_vals, width, label="RandomForest", color="#dc2626")
    ax.bar(x + width / 2, baseline_vals, width, label="Seasonal naive", color="#6b7280")
    ax.set_xticks(x)
    ax.set_xticklabels(["MAE (USD)", "RMSE (USD)", "WAPE (ratio)"])
    ax.set_title("Model vs. Seasonal-Naive Baseline (Test Period)")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    return fig


def plot_three_way_comparison(
    revenue_model_metrics: dict, growth_model_metrics: dict, baseline_metrics: dict
) -> Figure:
    """MAE/RMSE/WAPE for all three candidates: the original absolute-revenue
    RandomForest, the YoY-growth RandomForest (reconstructed to revenue),
    and the seasonal-naive baseline — same bars as `plot_model_vs_baseline`,
    extended to three candidates instead of two.
    """
    labels = ["mae", "rmse", "wape"]
    series = {
        "RF (revenue)": [revenue_model_metrics[m] for m in labels],
        "RF (YoY growth)": [growth_model_metrics[m] for m in labels],
        "Seasonal naive": [baseline_metrics[m] for m in labels],
    }
    colors = {"RF (revenue)": "#dc2626", "RF (YoY growth)": "#16a34a", "Seasonal naive": "#6b7280"}

    x = np.arange(len(labels))
    width = 0.26
    fig, ax = _new_fig()
    for i, (name, values) in enumerate(series.items()):
        ax.bar(x + (i - 1) * width, values, width, label=name, color=colors[name])
    ax.set_xticks(x)
    ax.set_xticklabels(["MAE (USD)", "RMSE (USD)", "WAPE (ratio)"])
    ax.set_title("Model Comparison — Test Period (2024-2025)")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    return fig


def plot_forecast(full_df: pd.DataFrame, forecast_df: pd.DataFrame) -> Figure:
    fig, ax = _new_fig()
    ax.plot(full_df["month"], full_df[TARGET_COLUMN], label="Historical", color="#111827")
    ax.plot(
        forecast_df["month"],
        forecast_df[TARGET_COLUMN],
        label="Forecast (next 12 months, recursive)",
        color="#f59e0b",
        linestyle="--",
        marker="o",
    )
    ax.axvline(full_df["month"].iloc[-1], color="#9ca3af", linestyle=":")
    ax.set_title("Historical Revenue + 12-Month Recursive Forecast")
    ax.set_xlabel("Month")
    ax.set_ylabel("Revenue (USD)")
    ax.yaxis.set_major_formatter(USD)
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    return fig
