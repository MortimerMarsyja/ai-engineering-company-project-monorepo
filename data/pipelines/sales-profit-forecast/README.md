# `sales-profit-forecast`

Monthly revenue forecasting pipeline for Brasaland, trained on
`data/raw/sales/brasaland_sales.csv` (see that folder's README for dataset
provenance). Two `RandomForestRegressor` models are trained and compared
against a seasonal-naive baseline: one predicting absolute `revenue_usd`
directly, one predicting the year-over-year growth rate and reconstructing
revenue from it. The growth model wins the comparison — see "Second model"
below — and is what `pipeline.py` forecasts with by default.

## Scope correction: revenue, not profit

This pipeline forecasts **`revenue_usd`**, not profit. The source CSV has
no cost/margin column, and this repo has no sales/transactions domain at
all today — only inventory in/outbound costs and menu-item list prices
(`services/api/app/models/{inbound,outbound,menu_item}.py`), which are a
different granularity (per-event/per-local) than this monthly/consolidated
dataset and can't be joined to it without a business decision on how.
Computing real profit would require either a cost column added to this
CSV's source, or joining it against a monthly cost aggregate (the
`weekly-location-performance` pipeline computes something adjacent at
weekly/per-local grain, not monthly/consolidated) — not done here to avoid
fabricating a profit number from mismatched data.

## Layout

| File | Role |
| --- | --- |
| `data_prep.py` | Load + validate `brasaland_sales.csv` (types, duplicates, monthly continuity, negative values). Raises `DataValidationError` rather than silently fixing a structural problem. |
| `features.py` | Calendar + lag/rolling features, built so month `t`'s features only ever see months `< t`. Excludes `covers_served`/`avg_ticket_usd` (leakage — see below). |
| `baseline.py` | Seasonal-naive baseline (`lag_12` = same month last year). |
| `train.py` | Absolute-revenue `RandomForestRegressor`, hyperparameters tuned via `GridSearchCV` + `TimeSeriesSplit` on the training period only. Saves the fitted model. |
| `features_growth.py` | Feature engineering for the YoY-growth model: growth target definition, growth-lag/rolling features (all past-only), and `reconstruct_revenue()`. |
| `train_growth.py` | YoY-growth `RandomForestRegressor` — same algorithm/tuning approach as `train.py`, different target/feature set. |
| `metrics.py` | MSE/RMSE/MAE/R²/WAPE + regression-adapted Gini and PSI, each with an explicit stated definition (see "Metrics" below). `K2 Score` is deliberately NOT computed — see below. |
| `evaluate.py` | One-month-ahead test-set evaluation, absolute-revenue model vs. baseline. |
| `evaluate_growth.py` | Same evaluation for the growth model (reconstructed to revenue first) + `select_best_model()`, the 3-way comparison rule. |
| `forecast.py` | 12-month **recursive** forecast beyond the known data, using the absolute-revenue model — a materially different, harder regime than `evaluate.py`'s one-month-ahead test (see its docstring). |
| `visualize.py` | The 7 requested charts plus a 3-way model comparison chart, each returning a `Figure` (never calls `plt.show()`). |
| `pipeline.py` | End-to-end orchestration: trains both models, compares them, forecasts with whichever wins, writes all artifacts to `data/process/sales-profit-forecast/`. |
| `build_notebook.py` | Generates and executes `sales_forecast_analysis.ipynb` (the analysis notebook deliverable) from embedded cell source. |
| `tests/` | Leakage checks (both models), data validation checks, metric unit tests, reconstruction-correctness check — no DB/network, pure functions. |

## Running it

```bash
cd data/pipelines/sales-profit-forecast
uv sync   # once, installs this pipeline's own venv (pandas, scikit-learn, matplotlib, nbformat/nbclient)

.venv/bin/python pipeline.py              # full run: train, evaluate, forecast, plots, metrics.json
.venv/bin/python build_notebook.py        # regenerates the executed notebook
.venv/bin/python -m pytest tests/ -v      # 15 tests
```

This pipeline is fully standalone (reads only a local CSV, no database) —
unlike `weekly-location-performance`, it does **not** need `services/api`'s
virtualenv or `app.*` package.

## Algorithm choice: RandomForestRegressor

- Dataset is small (108 usable monthly rows after feature lags) — a model
  with many hyperparameters would be more likely to overfit than to add
  value.
- Revenue growth + seasonality are nonlinear in the engineered
  calendar/lag features; trees capture that without manual interaction terms.
- `feature_importances_` gives free explainability.
- Needs little tuning to get a reasonable result, which matters given this
  task's time budget and this dataset's limited ability to support an
  expensive search.
- No feature scaling is applied: `RandomForestRegressor` splits each
  feature independently on raw thresholds, so it is invariant to
  monotonic rescaling — standardizing would not change a single split.

## Feature engineering and leakage

Target: `revenue_usd`. Features: `month_of_year`, `year`, `quarter`,
`month_sin`/`month_cos` (cyclical encoding), `lag_1`, `lag_12`,
`roll_mean_3`, `roll_mean_6` (all shifted to only see months `< t`).

`covers_served` and `avg_ticket_usd` are **excluded on purpose**, even
though they're columns in the raw CSV: `revenue_usd ≈ covers_served ×
avg_ticket_usd` almost exactly in this dataset, and neither is
independently forecast — using either as a contemporaneous feature would
leak the answer.

## Dataset split

Train: calendar 2016-2023. Test: 2024-2025. In practice, the first 12 raw
months (2016) are dropped before training because they lack a full
`lag_12`, so the *usable* train window is 2017-2023 (84 rows) and test is
2024-2025 (24 rows). The test set is never touched by `GridSearchCV`/
`TimeSeriesSplit` tuning.

## Metrics — definitions, and what's deliberately not computed

- **MSE / RMSE / MAE / R²**: standard, via scikit-learn.
- **WAPE**: `sum(|error|) / sum(|actual|)` — scale-free, robust to any
  single near-zero actual (not an issue here, but the safer general choice
  over MAPE).
- **Gini (regression)**: NOT the classification Gini (`2*AUC-1`). This
  repo had no definition for "Gini appropriate for regression," so
  `metrics.gini_regression` implements and documents the specific
  normalized ranking/Lorenz-curve definition popularized in insurance and
  Kaggle regression competitions — it measures ranking quality, not
  pointwise accuracy, and is reported as that, explicitly, not as a
  drop-in replacement for MAE/RMSE.
- **PSI**: PSI is originally a classification/credit-scoring drift
  metric; there is no single accepted regression adaptation either.
  `metrics.population_stability_index` is applied here to the model's
  *predicted* revenue distribution (train-period predictions as the
  reference, test-period predictions as the comparison) — it flags
  distributional drift in what the model outputs, not forecast accuracy.
- **K2 Score: not computed.** It is not a recognized ML/statistics metric,
  and no document in this repo (`CONTEXT.md`, `CONTEXT.es.md`, `docs/*.md`)
  defines it — there is also no `CONTEXT-company.md` file in this repo to
  check against (confirmed by search). Per this task's own instruction to
  flag an undefined metric rather than invent a formula, it is left out.
  R² is reported separately, under its own name, in case "K2" was meant
  to refer to it.

**Why a low MSE alone is insufficient**: a model that always predicts last
year's same month (the seasonal-naive baseline) can score a low MSE on a
strongly seasonal series purely by exploiting that pattern, without
showing any real skill at the *change* from last year. The baseline
comparison, WAPE, Gini, and the error-over-time plot together are what
actually tell you whether the extra model complexity earned anything —
MSE in isolation can't.

## Finding: the seasonal-naive baseline wins here — and why

On the held-out test set, the seasonal-naive baseline (`lag_12`)
outperforms `RandomForestRegressor` on every error metric (lower
MAE/RMSE/WAPE, higher R²). Verified root cause, not a tuning artifact:
Brasaland's revenue has a strong, steady upward trend, and **tree-based
models cannot extrapolate beyond the target range seen during training**
— every leaf predicts an average of the training labels that landed in
it, so the model's maximum possible prediction is bounded by (and in
practice below) the training set's maximum revenue. Since every test-set
month's actual revenue exceeds that training maximum, the model
systematically underpredicts throughout 2024-2025. The seasonal-naive
baseline has no such ceiling — `lag_12` directly reuses a real prior value
that is itself already past that ceiling, implicitly riding the trend.
See `sales_forecast_analysis.ipynb` section 6 for the verifying numbers.

This also means the 12-month recursive forecast in `forecast.py` (see its
docstring for why it's a different, harder regime than the one-month-ahead
test above) is very likely a **conservative floor**: bounded close to the
historical maximum rather than continuing the real trend, and compounding
that underestimate recursively month over month.

## Second model: predicting YoY growth instead of absolute revenue

Direct fix for the specific cause found above: instead of predicting
`revenue_usd` directly, `train_growth.py` predicts the **year-over-year
growth rate** (`revenue_usd_t / revenue_usd_(t-12) - 1`), and
`features_growth.reconstruct_revenue()` turns that back into an absolute
number as `revenue_usd_(t-12) * (1 + predicted_growth)`. The anchor
(`revenue_usd_(t-12)`) is always real, already-past-the-ceiling historical
data, so the reconstructed revenue is **not** bounded by the training
set's revenue range the way predicting revenue directly is — only the
*rate* needs to stay within a range the model has seen, and growth rates
don't carry the same multi-year upward trend the absolute level does.

Same algorithm, tuning approach, and leakage discipline as the first
model (`train.py`'s "Algorithm choice" reasoning is unchanged — see
`train_growth.py`'s docstring); every growth feature is shifted to only
use growth rates realized strictly before month `t`
(`tests/test_features_growth.py`). The first 24 months (not 12) are
dropped before training, since `growth_lag_12` needs a growth rate
computed 12 months back, which itself needs revenue from 12 months
before *that* — usable train is 2018-2023 (72 rows), test is 2024-2025
(24 rows) — **the same 24 test months** as the first model, so all three
candidates are compared on identical ground truth.

### Result: the growth model wins

| Candidate | MAE (USD) | RMSE (USD) | R² | WAPE | Gini |
| --- | --- | --- | --- | --- | --- |
| RandomForest (YoY growth, reconstructed) | **23,736** | **27,473** | **0.861** | **0.031** | **0.864** |
| Seasonal naive | 37,576 | 44,340 | 0.639 | 0.049 | 0.737 |
| RandomForest (absolute revenue) | 45,875 | 57,262 | 0.398 | 0.059 | 0.732 |

The growth model beats **both** the original model and the baseline on
every metric — not a trade-off, a strict improvement. This confirms the
diagnosis above: the problem was the extrapolation ceiling on an
*absolute* revenue target specifically, not `RandomForestRegressor` as an
algorithm. `pipeline.py` now selects the best of the three (lowest test
MAE, via `evaluate_growth.select_best_model`) and forecasts with whichever
one wins, rather than always defaulting to the absolute-revenue model —
currently the growth model, which also means the 12-month forecast is no
longer artificially capped near the historical maximum (it now forecasts
past $1M for December 2026, vs. $856k from the original model).

## Open issues (unresolved, not silently worked around)

1. **This forecasts revenue, not profit** — no cost/profit data exists for
   this dataset's grain (see "Scope correction" above).
2. **`K2 Score` is undefined anywhere in this repo** — not computed; needs
   a stakeholder definition.
3. ~~RandomForestRegressor underperforms the seasonal-naive baseline~~ —
   **resolved** by the YoY-growth reframing above; the original
   absolute-revenue model is kept in the pipeline (not deleted) purely for
   the side-by-side comparison, per this task's "retain all existing
   evaluation results" instruction.
4. **`market` is constant** (`"consolidated"`) in the current dataset —
   neither feature module reads anything but `month`/`revenue_usd`, so no
   code change is needed if a real multi-market breakdown is added later.
5. **The growth model's forecast is still recursive** (section 11 of the
   notebook) — compounding error across the 12-month horizon remains an
   open risk even though the one-month-ahead evaluation above is strong.
   Not quantified further here (e.g. a backtested multi-step recursive
   error) due to time budget.

## Outputs (consumed by the existing Brasaland dashboard)

`pipeline.py` writes to `data/process/sales-profit-forecast/` (gitignored —
regenerable from the raw CSV):

- `model.joblib` / `model_growth.joblib` — the two fitted models.
- `metrics.json` — `{"random_forest_revenue": {...}, "random_forest_growth": {...}, "baseline": {...}, "best_model": {"winner": ..., "ranking": [...]}}`, plain JSON.
- `forecast.csv` — next 12 months, `month,revenue_usd`, from whichever model `best_model.winner` names.
- `plots/*.png` — the 7 requested charts plus the growth model's actual-vs-predicted, feature importance, and the 3-way comparison chart (10 total).
