"""Transformation task — docs/PIPELINE_DESIGN.md section 4.

Pure Pandas, no I/O: given the same raw events and week_start, always the
same aggregated output. Analogous in spirit to
`services/api/app/services/telemetry_analysis.py` (same "never fabricate a
value" discipline) but its own module, per docs/company-briefing.md section
7 (that file is out of scope and must not be reused/modified).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd
from prefect import flow, task

EVENT_TYPE_COLUMN = "event_type"
TAGS_COLUMN = "tags"

INBOUND_EVENT_TYPE = "inbound_order_created"
WASTE_EVENT_TYPE = "stock_waste_registered"
STOCKOUT_EVENT_TYPE = "stock_threshold_triggered"
PRICE_ALERT_EVENT_TYPE = "ingredient_price_variance_detected"

# country -> currency, same mapping the frontend already uses (toCurrency()) —
# docs/company-briefing.md section 4. Never converted, never mixed in one row.
COUNTRY_TO_CURRENCY = {"CO": "COP", "US": "USD"}

# Bumped whenever the aggregation formula itself changes — e.g. once the
# missing-cost instrumentation gap (docs/company-briefing.md section 3 /
# docs/PIPELINE_DESIGN.md section 2) is resolved on the event-schema side
# and this task starts reading a real `unit_cost`. Folded into the cache
# key below so a cached result computed under an old formula can never be
# served after the logic changes, even for byte-identical input data.
TRANSFORM_VERSION = "1.0.0"

# Cache validity window — long enough that an immediate retry after a
# downstream load failure (docs/PIPELINE_DESIGN.md section 8) reuses this
# computation instead of re-running Pandas over the same input; short
# enough that a cache entry never survives from one weekly scheduled run
# into the next one, so a stale/garbage entry can't outlive a single
# operational day.
TRANSFORM_CACHE_EXPIRATION = timedelta(hours=6)

_OUTPUT_COLUMNS = [
    "location_id",
    "country",
    "week_start",
    "total_purchase_cost",
    "total_waste_cost",
    "waste_ratio",
    "stockout_events_count",
    "price_alert_events_count",
    "currency",
]


@dataclass(frozen=True)
class TransformResult:
    aggregated: pd.DataFrame
    records_rejected: int
    records_transformed: int


def _dataframe_fingerprint(df: pd.DataFrame) -> str:
    """Deterministic SHA-256 over every cell of `df`. Extraction always
    orders rows by timestamp, so two reads of the same underlying rows
    always hash identically; any added, removed, or changed row (e.g. a
    late-arriving event for this week, docs/PIPELINE_DESIGN.md section 5)
    changes the hash.
    """
    if df.empty:
        return "empty"
    # `tags` holds dicts, which pandas' own hasher can't hash directly —
    # serialize it to a canonical (sorted-key) JSON string first, exactly
    # like every other column, so the hash still depends on its content.
    hashable = df.copy()
    if TAGS_COLUMN in hashable.columns:
        hashable[TAGS_COLUMN] = hashable[TAGS_COLUMN].map(lambda tags: json.dumps(tags, sort_keys=True, default=str))
    row_hashes = pd.util.hash_pandas_object(hashable, index=False)
    return hashlib.sha256(row_hashes.to_numpy().tobytes()).hexdigest()


def transform_cache_key(context: Any, parameters: dict[str, Any]) -> str:
    """What determines the cache key, and how long it stays valid:

    Key = f(TRANSFORM_VERSION, week_start, fingerprint(raw_events)):
      - `TRANSFORM_VERSION` separates results computed under different
        aggregation logic (see its own docstring above) — a version bump
        invalidates every previously cached entry at once.
      - `week_start` keeps two different weeks from ever sharing a cache
        entry, even in the (practically impossible) case their fingerprints
        collided.
      - the fingerprint of the *exact* `raw_events` rows is what makes this
        a content cache, not a time-based one: two calls for the same week
        only share a key if they were handed the exact same rows. A
        reconciliation rerun that picks up a late-arriving event for that
        week (section 5) produces a different fingerprint and therefore a
        cache miss — it is never served a stale aggregate computed before
        that event existed.

    Validity window: `TRANSFORM_CACHE_EXPIRATION` (6 hours) — see that
    constant's own docstring for why that specific duration was chosen.

    Shared by both costed-sum tasks below (`calculate_purchase_cost`,
    `calculate_waste_cost`), which are handed the exact same unfiltered
    `raw_events` — the task's own name is folded into the key too, so the
    two tasks never collide into (and incorrectly serve) each other's
    cached result despite hashing the same input DataFrame.
    """
    week_start: date = parameters["week_start"]
    raw_events: pd.DataFrame = parameters["raw_events"]
    fingerprint = _dataframe_fingerprint(raw_events)
    task_name = context.task.name if context is not None and context.task is not None else "unknown"
    return (
        f"weekly_location_performance:transform:{task_name}:v{TRANSFORM_VERSION}:"
        f"{week_start.isoformat()}:{fingerprint}"
    )


def _empty_location_series(name: str, dtype: str) -> pd.Series:
    """An empty Series indexed by an explicitly-named, empty
    (location_id, country) MultiIndex — needed so `pd.concat(..., axis=1)`
    below keeps those two index level names even when one of the 4 KPI
    series has no rows at all (an unnamed empty default index would
    otherwise make the concatenated frame lose 'location_id'/'country' as
    column names after `reset_index()`).
    """
    empty_index = pd.MultiIndex.from_arrays([[], []], names=["location_id", "country"])
    return pd.Series(dtype=dtype, name=name, index=empty_index)


def _expand(df: pd.DataFrame, event_type: str, fields: list[str]) -> pd.DataFrame:
    """Rows matching `event_type`, with `fields` pulled out of `tags` into
    top-level columns via one vectorized `pd.json_normalize` call — same
    technique as `app.services.telemetry_analysis._expand_properties`. A
    row whose tags lack one of `fields` gets NaN there rather than raising.
    """
    subset = df.loc[df[EVENT_TYPE_COLUMN] == event_type]
    if subset.empty:
        return subset.assign(**{field: pd.Series(dtype="object") for field in fields})
    flattened = pd.json_normalize(subset[TAGS_COLUMN]).reindex(columns=fields)
    flattened.index = subset.index
    return subset.join(flattened)


def _costed_sum(df: pd.DataFrame, event_type: str, output_name: str) -> tuple[pd.Series, int]:
    """Sum(quantity * unit_cost) grouped by (location_id, country) for one
    event_type, plus how many of its rows had no usable cost.

    Known gap (docs/company-briefing.md section 3 / docs/PIPELINE_DESIGN.md
    section 2): neither `inbound_order_created` nor `stock_waste_registered`
    carries a cost field in the approved event schema yet
    (services/api/app/models/events.py). This never fabricates a cost: a
    row missing `unit_cost` in `tags` contributes 0 to the sum (the DDL's
    `numeric NOT NULL DEFAULT 0` leaves no room for a distinct "unknown"
    value) but is counted in the returned rejection count, so "$0 because
    nothing was missing" and "$0 because cost data is missing" stay
    distinguishable in `reporting.pipeline_runs.records_rejected` — never
    silently conflated the way a bare `fillna(0)` without counting would.
    """
    expanded = _expand(df, event_type, ["location_id", "country", "quantity", "unit_cost"])
    if expanded.empty:
        return _empty_location_series(output_name, "float64"), 0

    missing_cost = expanded["unit_cost"].isna()
    rejected = int(missing_cost.sum())
    line_cost = np.where(
        missing_cost,
        0.0,
        expanded["quantity"].astype(float) * expanded["unit_cost"].astype(float),
    )
    expanded = expanded.assign(line_cost=line_cost)
    series = expanded.groupby(["location_id", "country"])["line_cost"].sum().rename(output_name)
    return series, rejected


def _event_counts(df: pd.DataFrame, event_type: str, output_name: str) -> pd.Series:
    expanded = _expand(df, event_type, ["location_id", "country"])
    if expanded.empty:
        return _empty_location_series(output_name, "int64")
    return expanded.groupby(["location_id", "country"]).size().rename(output_name)


# Retries: every transformation task below is pure Pandas with no I/O. Per
# docs/PIPELINE_DESIGN.md section 10, the only realistic failure here is a
# transient worker resource issue (e.g. memory pressure under an unusually
# large week), not a bug retrying would paper over — hence a single retry,
# a safety margin rather than a recovery strategy. A malformed/incomplete
# `tags` dict on an individual row is never a task failure: it is handled
# inline (counted, excluded from that KPI's sum) exactly like the existing
# policy in app.services.telemetry_analysis — it never raises.
#
# Each KPI from docs/company-briefing.md section 2 gets its own task, with
# explicit inputs/outputs (no shared/global state), so the transformation
# subflow below can run, cache and retry each one independently — and so
# each is independently unit-testable via `.fn` (tests/pipelines/test_pipeline.py).


@task(
    name="calculate_purchase_cost",
    retries=1,
    retry_delay_seconds=10,
    cache_key_fn=transform_cache_key,
    cache_expiration=TRANSFORM_CACHE_EXPIRATION,
)
def calculate_purchase_cost(raw_events: pd.DataFrame, week_start: date) -> tuple[pd.Series, int]:
    """total_purchase_cost — sum(quantity * unit_cost) over
    `inbound_order_created` rows, grouped by (location_id, country).
    `week_start` isn't used by the computation itself; it's part of the
    cache key so a cached result is never shared across different weeks.
    """
    return _costed_sum(raw_events, INBOUND_EVENT_TYPE, "total_purchase_cost")


@task(
    name="calculate_waste_cost",
    retries=1,
    retry_delay_seconds=10,
    cache_key_fn=transform_cache_key,
    cache_expiration=TRANSFORM_CACHE_EXPIRATION,
)
def calculate_waste_cost(raw_events: pd.DataFrame, week_start: date) -> tuple[pd.Series, int]:
    """total_waste_cost — sum(quantity * unit_cost) over
    `stock_waste_registered` rows, grouped by (location_id, country).
    """
    return _costed_sum(raw_events, WASTE_EVENT_TYPE, "total_waste_cost")


@task(name="calculate_waste_ratio", retries=1, retry_delay_seconds=10)
def calculate_waste_ratio(total_purchase_cost: pd.Series, total_waste_cost: pd.Series) -> pd.Series:
    """waste_ratio = total_waste_cost / total_purchase_cost; 0 when there
    were no purchases that week — a valid zero denominator (the location
    genuinely didn't buy), not an "unavailable" measurement
    (docs/company-briefing.md section 4).
    """
    combined = pd.concat([total_purchase_cost, total_waste_cost], axis=1).fillna(0)
    if combined.empty:
        return _empty_location_series("waste_ratio", "float64")
    purchase = combined.iloc[:, 0]
    waste = combined.iloc[:, 1]
    ratio = np.where(purchase > 0, waste / purchase, 0.0)
    return pd.Series(ratio, index=combined.index, name="waste_ratio")


@task(name="calculate_stockout_frequency", retries=1, retry_delay_seconds=10)
def calculate_stockout_frequency(raw_events: pd.DataFrame) -> pd.Series:
    """stockout_events_count — count of `stock_threshold_triggered` rows,
    grouped by (location_id, country).
    """
    return _event_counts(raw_events, STOCKOUT_EVENT_TYPE, "stockout_events_count")


@task(name="calculate_price_alert_frequency", retries=1, retry_delay_seconds=10)
def calculate_price_alert_frequency(raw_events: pd.DataFrame) -> pd.Series:
    """price_alert_events_count — count of
    `ingredient_price_variance_detected` rows, grouped by
    (location_id, country).
    """
    return _event_counts(raw_events, PRICE_ALERT_EVENT_TYPE, "price_alert_events_count")


@flow(name="transform_weekly_location_performance_flow")
def transform_weekly_location_performance_flow(raw_events: pd.DataFrame, week_start: date) -> TransformResult:
    """Transformación subflow — docs/PIPELINE_DESIGN.md section 4/10.

    Runs the 5 KPI tasks above over the same `raw_events`, then assembles
    one row per (location_id, country) at this week's grain. Explicit
    input (`raw_events`, `week_start`) and output (`TransformResult`) —
    nothing is read from or written to a global.
    """
    rejected = 0

    purchase, purchase_rejected = calculate_purchase_cost(raw_events, week_start)
    rejected += purchase_rejected

    waste, waste_rejected = calculate_waste_cost(raw_events, week_start)
    rejected += waste_rejected

    waste_ratio = calculate_waste_ratio(purchase, waste)
    stockout_counts = calculate_stockout_frequency(raw_events)
    price_alert_counts = calculate_price_alert_frequency(raw_events)

    combined = pd.concat(
        [purchase, waste, waste_ratio, stockout_counts, price_alert_counts], axis=1
    ).fillna(0)

    if combined.empty:
        return TransformResult(
            aggregated=pd.DataFrame(columns=_OUTPUT_COLUMNS),
            records_rejected=rejected,
            records_transformed=0,
        )

    combined = combined.reset_index()
    combined["total_purchase_cost"] = combined["total_purchase_cost"].astype(float)
    combined["total_waste_cost"] = combined["total_waste_cost"].astype(float)
    combined["stockout_events_count"] = combined["stockout_events_count"].astype(int)
    combined["price_alert_events_count"] = combined["price_alert_events_count"].astype(int)

    # Re-derive waste_ratio after the final fillna(0): a location that only
    # appears via stockout/price-alert counts (no purchase/waste rows at
    # all) must still get the correct 0-denominator rule applied, not
    # whatever calculate_waste_ratio computed before those rows existed in
    # the combined index.
    combined["waste_ratio"] = np.where(
        combined["total_purchase_cost"] > 0,
        combined["total_waste_cost"] / combined["total_purchase_cost"],
        0.0,
    )
    combined["currency"] = combined["country"].map(COUNTRY_TO_CURRENCY)
    combined["week_start"] = week_start

    combined = combined.sort_values(["location_id"]).reset_index(drop=True)
    combined = combined[_OUTPUT_COLUMNS]

    return TransformResult(
        aggregated=combined,
        records_rejected=rejected,
        records_transformed=len(combined),
    )
