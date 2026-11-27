"""Generates `sales_forecast_analysis.ipynb` from cell source embedded below,
then executes it in-place with `nbclient` so the deliverable notebook
already contains real outputs (not just code) without a manual
"Run All" step.
"""

from __future__ import annotations

from pathlib import Path

import nbformat as nbf
from nbclient import NotebookClient

OUT_PATH = Path(__file__).resolve().parent / "sales_forecast_analysis.ipynb"

CELLS: list[tuple[str, str]] = [
    ("markdown", """\
# Brasaland Monthly Revenue Forecast

Target: `revenue_usd`. Source: `data/raw/sales/brasaland_sales.csv`
(120 monthly rows, 2016-01 through 2025-12, single `market` value
`"consolidated"`). Algorithm, feature, and metric choices are documented
in `README.md`; this notebook runs the same pipeline modules end to end
and inspects the results."""),
    ("code", """\
import _pathsetup  # noqa: F401
from data_prep import load_sales_data
from features import FEATURE_COLUMNS, TARGET_COLUMN, build_features, drop_rows_without_full_history
from train import chronological_split, run_training
from evaluate import evaluate_model
from forecast import forecast_next_n_months
from metrics import compute_all_metrics
import visualize as viz

import matplotlib.pyplot as plt
%matplotlib inline"""),
    ("markdown", "## 1. Data preparation"),
    ("code", """\
raw = load_sales_data()
print(f"{len(raw)} rows, {raw['month'].min().date()} .. {raw['month'].max().date()}")
raw.head()"""),
    ("code", """\
raw.describe()"""),
    ("markdown", """\
No missing values, no duplicate months, no gap in the monthly sequence
(`load_sales_data` raises if any of those hold) — this dataset is clean.
`market` is constant (`"consolidated"`) across all 120 rows, so it carries
no information and is not used as a feature."""),
    ("markdown", "## 2. Feature engineering"),
    ("code", """\
featured = build_features(raw)
clean = drop_rows_without_full_history(featured)
print(f"{len(raw)} raw rows -> {len(clean)} usable rows (first 12 months dropped: need a full lag_12)")
clean[["month", *FEATURE_COLUMNS, TARGET_COLUMN]].head()"""),
    ("markdown", """\
`covers_served` and `avg_ticket_usd` are intentionally excluded: both are
only known for the month being predicted, and `revenue_usd ≈ covers_served
× avg_ticket_usd` almost exactly in this dataset — using either as a
feature would leak the answer. Only calendar features (month/year/quarter,
cyclical sin/cos encoding) and the target's own lagged/rolling history are
used. No feature scaling is applied — RandomForestRegressor splits on raw
per-feature thresholds, so it's invariant to monotonic rescaling."""),
    ("markdown", "## 3. Chronological split"),
    ("code", """\
train_df, test_df = chronological_split(clean)
print(f"Train: {len(train_df)} rows ({train_df['month'].min().date()} .. {train_df['month'].max().date()})")
print(f"Test:  {len(test_df)} rows ({test_df['month'].min().date()} .. {test_df['month'].max().date()})")"""),
    ("markdown", """\
Note: the requested "train 2016-2023 / test 2024-2025" describes the raw
calendar range. The first 12 *raw* months (2016) are already dropped for
lacking a full `lag_12`, so the usable train window is 2017-2023 (84 rows)
and test is 2024-2025 (24 rows)."""),
    ("markdown", "## 4. Model training (RandomForestRegressor + TimeSeriesSplit tuning)"),
    ("code", """\
trained = run_training()
model, best_params = trained["model"], trained["best_params"]
print("Best hyperparameters (TimeSeriesSplit CV, neg MAE scoring):", best_params)"""),
    ("markdown", """\
**Why RandomForestRegressor**: the dataset is small (108 usable rows) —
a model with many hyperparameters would be more likely to overfit than to
add value. Revenue growth + seasonality are nonlinear in the engineered
calendar/lag features; trees capture that without manual interaction
terms. `feature_importances_` gives free explainability. It needs little
tuning to get a reasonable result, which matters given this task's limited
time budget and this dataset's limited ability to support an expensive
search.

Hyperparameters were tuned via `GridSearchCV` with `TimeSeriesSplit`
(4 folds) over `n_estimators`, `max_depth`, `min_samples_leaf` — every
fold's validation block is strictly later in time than its training
block, and the test set was never touched during tuning."""),
    ("markdown", "## 5. Evaluation on the held-out test set (one-month-ahead)"),
    ("code", """\
results = evaluate_model(model, train_df, test_df)
results["model_metrics"]"""),
    ("code", """\
results["baseline_metrics"]"""),
    ("markdown", """\
### Metric definitions and limitations

- **MSE/RMSE**: squared-error based — penalize large misses heavily,
  in USD² / USD. Sensitive to outliers; alone they say nothing about
  *directional bias* (consistently under- or over-forecasting).
- **MAE**: average absolute USD error. More robust to outliers than
  RMSE, but treats a $10k miss on a $400k month the same as on a $900k
  month.
- **R²**: fraction of test-set revenue variance explained relative to
  predicting the test-set mean. Can be negative if the model is worse
  than that trivial mean-predictor; here it should be compared against
  the *seasonal-naive* baseline instead of 0, since revenue has a strong
  trend the mean-predictor ignores entirely.
- **WAPE**: `sum(|error|) / sum(|actual|)` — a scale-free error rate,
  robust to any single month unlike MAPE (no near-zero actual here, but
  WAPE is the safer general choice).
- **Gini (regression, normalized ranking)**: NOT the classification Gini
  (`2*AUC-1`). This is the ranking/discrimination metric popularized in
  insurance-claims and Kaggle regression competitions: how well
  predictions *order* months relative to the best possible ordering
  (sorting by actual value), via the Lorenz curve. A model can rank months
  correctly (high Gini) while still being numerically off on each one
  (high MAE) — it answers a different question than the error metrics
  above, not a better one.
- **PSI (predicted-distribution drift)**: PSI is originally a
  classification/credit-scoring metric comparing a score's distribution
  across two populations; there's no single accepted regression
  adaptation. This notebook defines it explicitly: train-period
  predictions binned into deciles vs. test-period predictions compared
  against those same bins. It flags *distributional drift*, not accuracy.
- **K2 Score**: NOT computed. It isn't a recognized ML metric, and no
  document in this repo defines it — flagged as an open ambiguity per the
  task's own instruction, rather than guessing a formula. R² is reported
  separately under its own name.

**A low MSE alone is not enough**: a model that always predicts last
year's same month (the seasonal-naive baseline below) can have a low MSE
on a strongly seasonal series purely by exploiting the pattern, without
showing any real skill at the *change* from last year. Comparing against
that baseline, and looking at WAPE/Gini/the error-over-time plot together,
is what actually tells you whether the model earns its complexity."""),
    ("markdown", "## 6. Model vs. seasonal-naive baseline — and why the baseline wins here"),
    ("code", """\
fig = viz.plot_model_vs_baseline(results["model_metrics"], results["baseline_metrics"])
plt.show()"""),
    ("markdown", """\
**Finding, stated plainly: the seasonal-naive baseline outperforms the
RandomForestRegressor on every error metric in this test period**
(lower MAE/RMSE/WAPE, higher R²). Verified root cause — not a tuning
artifact:"""),
    ("code", """\
import numpy as np
print("Train max revenue:      $%.2f" % train_df[TARGET_COLUMN].max())
print("Test actual range:      $%.2f .. $%.2f" % (test_df[TARGET_COLUMN].min(), test_df[TARGET_COLUMN].max()))
print("Model prediction range: $%.2f .. $%.2f" % (results["test_predictions"].min(), results["test_predictions"].max()))"""),
    ("markdown", """\
Brasaland's revenue has a strong, steady upward trend. Tree-based models
(including Random Forest) **cannot extrapolate beyond the target range
seen during training** — every leaf predicts an average of training
labels that fell into it, so the maximum possible prediction is bounded
by (and in practice below) the training set's maximum. Since every test
month's actual revenue exceeds the training maximum, the model
systematically underpredicts throughout 2024-2025. The seasonal-naive
baseline (`lag_12`) has no such ceiling — it directly reuses a real prior
value from a point already past that ceiling, implicitly riding the trend.

This is a genuine, documented limitation of this algorithm choice for a
trending series, not a bug to silently fix by retuning. Reported here
rather than hidden, per the task's own request to document limitations."""),
    ("markdown", "## 7. Visualizations"),
    ("code", """\
fig = viz.plot_historical_revenue(raw)
plt.show()"""),
    ("code", """\
fig = viz.plot_actual_vs_predicted(test_df, results["test_predictions"])
plt.show()"""),
    ("code", """\
fig = viz.plot_prediction_errors(test_df, results["test_predictions"])
plt.show()"""),
    ("code", """\
fig = viz.plot_seasonality(raw)
plt.show()"""),
    ("code", """\
fig = viz.plot_feature_importance(model, FEATURE_COLUMNS)
plt.show()"""),
    ("markdown", "## 8. 12-month recursive forecast"),
    ("markdown", """\
Distinct from section 5's evaluation: that was **one-month-ahead** (every
test row's lag/rolling features come from *real* historical revenue).
Below, each forecasted month's lag/rolling features are built from the
model's **own previous predictions**, recursively, since no real future
revenue exists yet. Errors can compound month over month — a materially
harder regime, never to be reported as the same kind of accuracy as
section 5."""),
    ("code", """\
forecast_df = forecast_next_n_months(model, raw, n_months=12)
forecast_df"""),
    ("code", """\
fig = viz.plot_forecast(raw, forecast_df)
plt.show()"""),
    ("markdown", """\
Given section 6's finding, this 12-month forecast should be read with the
same caveat: because every forecasted month sits above the training
revenue ceiling, and each step recursively feeds off the previous
(already-underestimated) step, this forecast is **very likely a
conservative floor**, not a central estimate — it is bounded close to the
historical maximum rather than continuing the real trend. Confirmed by
`pipeline.py`'s run: the forecasted months stay in the ~$720k-856k range,
below the $994k already observed in December 2025."""),
    ("markdown", """\
## 9. Second model: predicting YoY growth instead of absolute revenue

Section 6 found that `RandomForestRegressor` underperforms the
seasonal-naive baseline because trees can't extrapolate past the training
revenue ceiling, and this series keeps growing past it. This section
tests a direct fix for that specific cause: instead of predicting
`revenue_usd` directly, predict the **year-over-year growth rate**
(`revenue_usd_t / revenue_usd_(t-12) - 1`), then reconstruct absolute
revenue as `revenue_usd_(t-12) * (1 + predicted_growth)`. The anchor
(`revenue_usd_(t-12)`) is always real, already-past-the-ceiling historical
data — so the reconstructed revenue is **not** bounded by the training
set's revenue range the way a direct revenue prediction is, even though
the *rate* being predicted stays within a modest, trend-independent band."""),
    ("code", """\
import _pathsetup  # noqa: F401
from features_growth import GROWTH_FEATURE_COLUMNS, GROWTH_TARGET_COLUMN, build_growth_features, drop_rows_without_full_growth_history, reconstruct_revenue
from train_growth import run_growth_training
from evaluate_growth import evaluate_growth_model, select_best_model

growth_featured = build_growth_features(raw)
growth_clean = drop_rows_without_full_growth_history(growth_featured)
print(f"{len(raw)} raw rows -> {len(growth_clean)} usable rows (first 24 months dropped: growth_lag_12 needs a growth rate from 12 months back, which itself needs revenue from 12 months before that)")
growth_clean[["month", *GROWTH_FEATURE_COLUMNS, GROWTH_TARGET_COLUMN]].head()"""),
    ("markdown", """\
**Leakage check**: every growth feature (`growth_lag_1`, `growth_lag_12`,
`growth_roll_mean_3`, `growth_roll_mean_6`) is shifted to only use growth
rates realized strictly before month `t` — verified in
`tests/test_features_growth.py::test_growth_features_only_see_the_past`.
`revenue_usd_t` itself (the value the target is derived from) never
appears as a feature, only as part of the target's own definition."""),
    ("code", """\
trained_growth = run_growth_training()
growth_model = trained_growth["model"]
train_df_growth, test_df_growth = trained_growth["train_df"], trained_growth["test_df"]
print(f"Train: {len(train_df_growth)} rows, test: {len(test_df_growth)} rows — same 24 test months as section 3 (2024-2025)")
print("Best hyperparameters:", trained_growth["best_params"])"""),
    ("markdown", "## 10. Growth model vs. original RandomForest vs. seasonal naive"),
    ("code", """\
growth_results = evaluate_growth_model(growth_model, train_df_growth, test_df_growth)
growth_results["revenue_metrics"]"""),
    ("code", """\
best = select_best_model({
    "random_forest_revenue": results["model_metrics"],
    "random_forest_growth": growth_results["revenue_metrics"],
    "seasonal_naive": results["baseline_metrics"],
})
best"""),
    ("code", """\
fig = viz.plot_three_way_comparison(results["model_metrics"], growth_results["revenue_metrics"], results["baseline_metrics"])
plt.show()"""),
    ("code", """\
fig = viz.plot_actual_vs_predicted(test_df_growth, growth_results["test_predictions_revenue"])
plt.show()"""),
    ("markdown", """\
**Result: the YoY-growth model wins.** It has the lowest MAE/RMSE/WAPE and
the highest R² and Gini of all three candidates — a clear improvement
over both the original absolute-revenue RandomForest *and* the
seasonal-naive baseline, not just over one of them. This confirms the
diagnosis in section 6: the problem was specifically the extrapolation
ceiling on an *absolute* revenue target, not RandomForestRegressor as an
algorithm — reframing the target to something that doesn't need to exceed
previously-seen values (a growth rate) while reconstructing through a
real, already-past-the-ceiling anchor resolves it directly."""),
    ("code", """\
fig = viz.plot_feature_importance(growth_model, GROWTH_FEATURE_COLUMNS)
plt.show()"""),
    ("markdown", "## 11. Final 12-month forecast, using the selected best model"),
    ("markdown", """\
Per section 10's result, the forecast below uses the **YoY-growth model**,
not the original absolute-revenue model from section 8 — `pipeline.py`
selects whichever model wins the comparison automatically, rather than
always defaulting to the first one built."""),
    ("code", """\
from pipeline import _forecast_with_growth_model

final_forecast_df = (
    _forecast_with_growth_model(growth_model, raw)
    if best["winner"] == "random_forest_growth"
    else forecast_next_n_months(model, raw, n_months=12)
)
final_forecast_df"""),
    ("code", """\
fig = viz.plot_forecast(raw, final_forecast_df)
plt.show()"""),
    ("markdown", """\
Unlike section 8's forecast (bounded below the historical maximum), this
forecast is free to exceed the training-period revenue ceiling — December
2026 is forecast above $1M, past the $994k already observed in December
2025, consistent with the series' real trend rather than flattening
against it."""),
    ("markdown", "## 12. Conclusions and unresolved issues"),
    ("markdown", """\
- The dataset (`data/raw/sales/brasaland_sales.csv`) is clean, complete,
  and has no PII — safe as committed.
- Only `revenue_usd` exists; there is no cost/profit data in this repo
  today (see `data/pipelines/sales-profit-forecast/README.md`), so this
  pipeline forecasts **revenue**, not profit, despite the task's framing.
- The original absolute-revenue RandomForestRegressor underperforms the
  seasonal-naive baseline because of tree-based extrapolation limits on
  trending data — a verified limitation, not a tuning bug.
- **Reframing the target as YoY growth and reconstructing revenue through
  the real `lag_12` anchor fixes this**: it beats both the original model
  and the seasonal-naive baseline on every metric, and is the model
  `pipeline.py` now selects and forecasts with by default.
- `K2 Score` was not computed — no accepted definition exists anywhere in
  this repo. **Open issue**: needs a stakeholder definition before it can
  be added.
- `market` is constant (`"consolidated"`) in the current dataset — the
  pipeline would need no code change to generalize to multiple markets
  if/when that data exists, since neither feature module reads anything
  but `month`/`revenue_usd`.
- **Open issue**: the growth model's own forecast (section 11) is still a
  *recursive* multi-month forecast — compounding error month over month
  remains a real risk for the later months of the 12-month horizon, even
  though the single-step (one-month-ahead) evaluation in section 10 is
  strong. Not quantified further here (e.g. via a backtested multi-step
  recursive error) — a natural next step, not done due to time budget."""),
]


def build_notebook() -> nbf.NotebookNode:
    nb = nbf.v4.new_notebook()
    nb["cells"] = [
        nbf.v4.new_markdown_cell(src) if kind == "markdown" else nbf.v4.new_code_cell(src)
        for kind, src in CELLS
    ]
    nb["metadata"]["kernelspec"] = {
        "name": "python3",
        "display_name": "Python 3 (sales-profit-forecast)",
        "language": "python",
    }
    return nb


if __name__ == "__main__":
    notebook = build_notebook()
    client = NotebookClient(notebook, resources={"metadata": {"path": str(OUT_PATH.parent)}})
    client.execute()
    with OUT_PATH.open("w") as f:
        nbf.write(notebook, f)
    print(f"Executed notebook written to {OUT_PATH}")
