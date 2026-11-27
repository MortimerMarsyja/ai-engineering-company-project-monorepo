"""Reads the `sales-profit-forecast` pipeline's output artifacts from disk.

Unlike `app/services/reporting.py` (which reads its pipeline's output from
Supabase), this pipeline is fully standalone and writes plain files —
`data/process/sales-profit-forecast/metrics.json` + `forecast.csv` (see
`data/pipelines/sales-profit-forecast/README.md`). Both are gitignored,
regenerable artifacts: `pipeline.py` must be run at least once (locally or
on whatever host serves this API) before this module has anything to
return. No database read/write happens here.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

_OUTPUT_DIR = Path(__file__).resolve().parents[4] / "data" / "process" / "sales-profit-forecast"
_METRICS_PATH = _OUTPUT_DIR / "metrics.json"
_FORECAST_PATH = _OUTPUT_DIR / "forecast.csv"
_PREDICTIONS_PATH = _OUTPUT_DIR / "predictions.json"


def get_sales_forecast() -> dict[str, Any] | None:
    """Returns the combined metrics + forecast + per-model prediction
    series payload, or `None` if the pipeline has never been run (any
    output file missing) — the router turns that into a 404, never a
    500, since "not run yet" is an expected state, not a server error.
    """
    if not _METRICS_PATH.exists() or not _FORECAST_PATH.exists() or not _PREDICTIONS_PATH.exists():
        return None

    metrics = json.loads(_METRICS_PATH.read_text())
    predictions = json.loads(_PREDICTIONS_PATH.read_text())

    with _FORECAST_PATH.open(newline="") as f:
        forecast = [
            {"month": row["month"], "revenue_usd": float(row["revenue_usd"])}
            for row in csv.DictReader(f)
        ]

    return {**metrics, "forecast": forecast, **predictions}
