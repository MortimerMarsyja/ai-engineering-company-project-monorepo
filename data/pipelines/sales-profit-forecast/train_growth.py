"""Train the YoY-growth-rate RandomForestRegressor (see `features_growth.py`).

Same algorithm and tuning approach as `train.py` (RandomForestRegressor,
`GridSearchCV` + `TimeSeriesSplit` on the training period only, fixed
random seed) — only the target and feature set differ. See `train.py`'s
module docstring for why RandomForestRegressor was chosen; that reasoning
is unchanged here, this model is a different bet on *what to predict*,
not a different algorithm.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit

import _pathsetup  # noqa: F401
from data_prep import load_sales_data
from features_growth import (
    GROWTH_FEATURE_COLUMNS,
    GROWTH_TARGET_COLUMN,
    build_growth_features,
    drop_rows_without_full_growth_history,
)
from train import PARAM_GRID, RANDOM_SEED, TRAIN_END_YEAR, chronological_split

MODEL_OUT_PATH = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "process"
    / "sales-profit-forecast"
    / "model_growth.joblib"
)


def prepare_growth_dataset(csv_path: Path | str | None = None) -> pd.DataFrame:
    raw = load_sales_data(csv_path) if csv_path is not None else load_sales_data()
    featured = build_growth_features(raw)
    return drop_rows_without_full_growth_history(featured)


def tune_growth_hyperparameters(train_df: pd.DataFrame, n_splits: int = 4) -> dict:
    """Same `TimeSeriesSplit`/`GridSearchCV` approach as `train.tune_hyperparameters`,
    scored on the growth rate itself (not the reconstructed revenue) —
    tuning must never see the test set either way.
    """
    X_train = train_df[GROWTH_FEATURE_COLUMNS]
    y_train = train_df[GROWTH_TARGET_COLUMN]

    tscv = TimeSeriesSplit(n_splits=n_splits)
    search = GridSearchCV(
        RandomForestRegressor(random_state=RANDOM_SEED),
        PARAM_GRID,
        cv=tscv,
        scoring="neg_mean_absolute_error",
    )
    search.fit(X_train, y_train)
    return search.best_params_


def train_growth_model(
    train_df: pd.DataFrame, best_params: dict | None = None
) -> RandomForestRegressor:
    params = best_params or {"n_estimators": 200, "max_depth": 5, "min_samples_leaf": 1}
    model = RandomForestRegressor(random_state=RANDOM_SEED, **params)
    model.fit(train_df[GROWTH_FEATURE_COLUMNS], train_df[GROWTH_TARGET_COLUMN])
    return model


def save_growth_model(model: RandomForestRegressor, path: Path = MODEL_OUT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)


def run_growth_training(csv_path: Path | str | None = None) -> dict:
    df = prepare_growth_dataset(csv_path)
    train_df, test_df = chronological_split(df)

    best_params = tune_growth_hyperparameters(train_df)
    model = train_growth_model(train_df, best_params)
    save_growth_model(model)

    return {
        "df": df,
        "train_df": train_df,
        "test_df": test_df,
        "best_params": best_params,
        "model": model,
    }


if __name__ == "__main__":
    result = run_growth_training()
    print(f"[growth model] Best hyperparameters: {result['best_params']}")
    print(f"[growth model] Train rows: {len(result['train_df'])}, test rows: {len(result['test_df'])}")
    print(f"[growth model] Train window: {TRAIN_END_YEAR} cutoff year")
    print(f"[growth model] Model saved to {MODEL_OUT_PATH}")
