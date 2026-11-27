"""Train the RandomForestRegressor revenue forecaster.

Algorithm choice — RandomForestRegressor (documented per task request):
  - Dataset is small (108 usable monthly rows after feature lags) — a deep
    neural net or gradient-boosted ensemble with many hyperparameters would
    be more likely to overfit here than to add predictive value.
  - Monthly revenue growth + seasonality is not linear in the engineered
    calendar/lag features; trees capture that without manual interaction terms.
  - `feature_importances_` gives a direct, free explainability readout —
    useful to sanity-check that lag/rolling features actually drive the
    prediction rather than, say, `year` alone extrapolating a trend.
  - Needs little tuning to get a reasonable result (robust to the exact
    `max_depth`/`n_estimators`, unlike e.g. a small neural net's learning
    rate), which matters given the limited time budget for this task and
    the small dataset's limited ability to support an expensive search.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit

import _pathsetup  # noqa: F401
from data_prep import load_sales_data
from features import FEATURE_COLUMNS, TARGET_COLUMN, build_features, drop_rows_without_full_history

RANDOM_SEED = 42
TRAIN_END_YEAR = 2023  # train: <= this year, test: after this year
MODEL_OUT_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "process" / "sales-profit-forecast" / "model.joblib"
)

PARAM_GRID = {
    "n_estimators": [100, 200, 400],
    "max_depth": [3, 5, 8, None],
    "min_samples_leaf": [1, 2, 4],
}


def prepare_dataset(csv_path: Path | str | None = None) -> pd.DataFrame:
    """Load -> validate -> engineer features -> drop rows missing full lag history."""
    raw = load_sales_data(csv_path) if csv_path is not None else load_sales_data()
    featured = build_features(raw)
    return drop_rows_without_full_history(featured)


def chronological_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Train: Jan 2016-equivalent rows through Dec `TRAIN_END_YEAR`. Test: after.

    Note: the first 12 raw months (2016) are already gone by the time this
    runs (dropped in `drop_rows_without_full_history` for lacking `lag_12`),
    so the *usable* training window is 2017-01 through 2023-12 (84 rows),
    test is 2024-01 through 2025-12 (24 rows) — the originally requested
    "train: 2016-2023" describes the raw calendar range, not the row count
    actually available to fit on.
    """
    train_df = df[df["year"] <= TRAIN_END_YEAR].reset_index(drop=True)
    test_df = df[df["year"] > TRAIN_END_YEAR].reset_index(drop=True)
    return train_df, test_df


def tune_hyperparameters(train_df: pd.DataFrame, n_splits: int = 4) -> dict:
    """Grid-search over `PARAM_GRID` using TimeSeriesSplit, fit on train only.

    TimeSeriesSplit never lets a fold's validation block precede its
    training block in time, so no future training-period month is ever
    used to validate a hyperparameter choice for an earlier one. The test
    set is never touched here.
    """
    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_COLUMN]

    tscv = TimeSeriesSplit(n_splits=n_splits)
    search = GridSearchCV(
        RandomForestRegressor(random_state=RANDOM_SEED),
        PARAM_GRID,
        cv=tscv,
        scoring="neg_mean_absolute_error",
    )
    search.fit(X_train, y_train)
    return search.best_params_


def train_model(
    train_df: pd.DataFrame, best_params: dict | None = None
) -> RandomForestRegressor:
    params = best_params or {"n_estimators": 200, "max_depth": 5, "min_samples_leaf": 1}
    model = RandomForestRegressor(random_state=RANDOM_SEED, **params)
    model.fit(train_df[FEATURE_COLUMNS], train_df[TARGET_COLUMN])
    return model


def save_model(model: RandomForestRegressor, path: Path = MODEL_OUT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)


def run_training(csv_path: Path | str | None = None) -> dict:
    """End-to-end: prepare data, split, tune, fit, save. Returns everything
    downstream steps (evaluate/forecast/visualize) need, so they don't
    re-derive the split or re-tune.
    """
    df = prepare_dataset(csv_path)
    train_df, test_df = chronological_split(df)

    best_params = tune_hyperparameters(train_df)
    model = train_model(train_df, best_params)
    save_model(model)

    return {
        "df": df,
        "train_df": train_df,
        "test_df": test_df,
        "best_params": best_params,
        "model": model,
    }


if __name__ == "__main__":
    result = run_training()
    print(f"Best hyperparameters (TimeSeriesSplit CV, MAE-scored): {result['best_params']}")
    print(f"Train rows: {len(result['train_df'])}, test rows: {len(result['test_df'])}")
    print(f"Model saved to {MODEL_OUT_PATH}")
