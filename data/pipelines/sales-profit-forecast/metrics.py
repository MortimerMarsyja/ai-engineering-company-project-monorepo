"""Evaluation metrics for the revenue forecast.

Several of the requested metrics (PSI, Gini) are not standard regression
metrics and have no single canonical definition — this module picks one
documented, cited definition for each and states it explicitly rather than
inventing an unstated formula. `K2 Score` is NOT computed here: it is not
a recognized ML metric, and no document in this repo (`CONTEXT.md`,
`docs/*.md`) defines it. Per the task's own instruction to flag rather
than invent an undefined metric, it is left out; R² (a real, standard
metric) is reported separately under its own name.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def wape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Weighted Absolute Percentage Error: sum(|err|) / sum(|actual|).

    Unlike MAPE, a single near-zero actual value can't blow up the metric
    — appropriate here since this dataset's monthly revenue never
    approaches zero.
    """
    y_true, y_pred = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    return float(np.sum(np.abs(y_true - y_pred)) / np.sum(np.abs(y_true)))


def population_stability_index(
    reference: np.ndarray, comparison: np.ndarray, n_bins: int = 10
) -> float:
    """PSI comparing two distributions, binned into `reference`-derived deciles.

    PSI is originally a classification/credit-scoring drift metric (comparing
    a score's distribution between two populations). There is no single
    accepted regression adaptation, so this module defines it explicitly as:
    bin `reference` into `n_bins` equal-frequency deciles, then compare how
    `comparison`'s values fall into those same bin edges.
    `PSI = sum((c_pct - r_pct) * ln(c_pct / r_pct))` over bins, with a small
    epsilon to avoid a log(0)/div-by-0 on an empty bin.

    Here it is applied to the model's *predicted* revenue: `reference` is
    the training-period predictions, `comparison` is the test-period
    predictions — it answers "has the model's output distribution shifted
    between the period it was fit on and the held-out period?", a proxy for
    distributional drift, not predictive accuracy (a model can have a low
    PSI and still be a poor forecaster, or vice versa).
    """
    reference, comparison = np.asarray(reference, dtype=float), np.asarray(comparison, dtype=float)
    eps = 1e-6

    quantiles = np.linspace(0, 1, n_bins + 1)
    edges = np.unique(np.quantile(reference, quantiles))
    edges[0], edges[-1] = -np.inf, np.inf

    ref_counts, _ = np.histogram(reference, bins=edges)
    comp_counts, _ = np.histogram(comparison, bins=edges)

    ref_pct = ref_counts / ref_counts.sum() + eps
    comp_pct = comp_counts / comp_counts.sum() + eps

    return float(np.sum((comp_pct - ref_pct) * np.log(comp_pct / ref_pct)))


def gini_regression(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Normalized ranking-based Gini coefficient for a regression score.

    This is the "normalized Gini" popularized by insurance-claims and
    Kaggle regression competitions (e.g. Allstate Claims Severity): it
    measures how well `y_pred` *ranks* observations relative to the
    best-possible ranking (sorting by `y_true` itself), via the Lorenz
    curve of `y_true` cumulated in `y_pred`-sorted order. It is a
    discrimination/ranking-quality metric, NOT a pointwise accuracy
    metric — unrelated to the classification Gini (`2 * AUC - 1`), and a
    model can rank months correctly (high Gini) while still being
    numerically off on each one (high MAE), or vice versa.

    Returns 1.0 for a perfect ranking, ~0.0 for a ranking no better than
    random, and is undefined (returns NaN) if every `y_true` value is
    identical.
    """

    def _gini(actual: np.ndarray, pred: np.ndarray) -> float:
        n = len(actual)
        order = np.lexsort((np.arange(n), -pred))
        sorted_actual = actual[order]
        total = sorted_actual.sum()
        if total == 0:
            return 0.0
        cum = np.cumsum(sorted_actual) / total
        return 1 - 2 * np.sum(cum) / n + 1 / n

    y_true, y_pred = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    perfect = _gini(y_true, y_true)
    if perfect == 0:
        return float("nan")
    return float(_gini(y_true, y_pred) / perfect)


def compute_all_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    *,
    psi_reference: np.ndarray | None = None,
) -> dict[str, float]:
    """Every metric requested for the task, keyed by name. See each function's
    docstring for its definition and limitations; also summarized in README.md.
    """
    y_true, y_pred = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    result = {
        "mse": float(mean_squared_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
        "wape": wape(y_true, y_pred),
        "gini_regression": gini_regression(y_true, y_pred),
    }
    if psi_reference is not None:
        result["psi_predicted_distribution_train_vs_test"] = population_stability_index(
            psi_reference, y_pred
        )
    return result


def metrics_to_frame(metrics: dict[str, float]) -> pd.DataFrame:
    return pd.DataFrame({"metric": list(metrics.keys()), "value": list(metrics.values())})
