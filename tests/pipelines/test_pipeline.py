"""Unit tests for the weekly-location-performance pipeline's KPI
transformation tasks — docs/company-briefing.md section 2 (KPI
definitions) and section 4 ("Agregación requerida").

Run from the repo root:

    services/api/.venv/bin/python -m pytest tests/pipelines/test_pipeline.py

(there is no repo-root virtualenv in this monorepo; `pandas`/`prefect` are
installed in services/api/.venv, same as every other Python test suite
here — see data/pipelines/weekly-location-performance/tests/ for the
existing convention this file follows.)

Every test below calls `.fn` — the plain, undecorated function Prefect
stores on a `@task` object — so none of these go through Prefect's task
engine, retries, or cache. That keeps them fast, deterministic, and fully
isolated from any database or external API: the transformation tasks
(data/pipelines/weekly-location-performance/transform.py) are pure Pandas
over an in-memory DataFrame shaped exactly like `telemetry_events` rows,
never touching the DB or network.
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

import conftest  # noqa: F401  (sys.path setup for `import transform`)
from transform import (
    calculate_price_alert_frequency,
    calculate_purchase_cost,
    calculate_stockout_frequency,
    calculate_waste_cost,
    calculate_waste_ratio,
)

_purchase_cost = calculate_purchase_cost.fn
_waste_cost = calculate_waste_cost.fn
_waste_ratio = calculate_waste_ratio.fn
_stockout_frequency = calculate_stockout_frequency.fn
_price_alert_frequency = calculate_price_alert_frequency.fn

WEEK_START = date(2026, 7, 13)


def _event(event_type: str, location_id, country: str, **tags) -> dict:
    """One row shaped exactly like `telemetry_events`
    (services/api/app/models/events.py / telemetry_storage.py): the same
    8 columns the real extraction task reads, with KPI-relevant fields
    nested under `tags` — matching docs/company-briefing.md section 3's
    event_type -> KPI mapping.
    """
    return {
        "event_id": f"{event_type}-{location_id}-{tags}",
        "timestamp": pd.Timestamp("2026-07-13T10:00:00Z"),
        "session_id": None,
        "user_id": None,
        "event_type": event_type,
        "schema_version": "1.0.0",
        "request_id": None,
        "tags": {"location_id": location_id, "country": country, **tags},
    }


# ── 1. total_purchase_cost — "Costo de compra por local" ────────────────


def test_purchase_cost_manually_calculated_value():
    """Manual calculation per docs/company-briefing.md section 4:
    total_purchase_cost = sum(quantity * unit_cost) over
    `inbound_order_created` rows for that location, that week.

    Medellín buys 10 units @ 2.5 and 4 units @ 1.0 this week:
        10 * 2.5 = 25.0
         4 * 1.0 =  4.0
        -----------------
        total    = 29.0
    """
    raw = pd.DataFrame(
        [
            _event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=10, unit_cost=2.5),
            _event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=4, unit_cost=1.0),
            # A different event_type must never contribute to this KPI.
            _event("stock_waste_registered", "CO-MEDELLIN", "CO", quantity=100, unit_cost=100.0),
        ]
    )
    series, rejected = _purchase_cost(raw, WEEK_START)

    assert rejected == 0
    assert series.loc[("CO-MEDELLIN", "CO")] == 29.0


def test_purchase_cost_excludes_rows_with_missing_unit_cost():
    """A row missing `unit_cost` contributes 0, not a fabricated value, and
    is counted in `rejected` — the "never fabricate a cost" rule documented
    on `_costed_sum`.
    """
    raw = pd.DataFrame(
        [
            _event("inbound_order_created", "US-AUSTIN", "US", quantity=5),  # no unit_cost
            _event("inbound_order_created", "US-AUSTIN", "US", quantity=2, unit_cost=10.0),
        ]
    )
    series, rejected = _purchase_cost(raw, WEEK_START)

    assert rejected == 1
    assert series.loc[("US-AUSTIN", "US")] == 20.0  # only the 2nd row: 2 * 10.0


# ── 2. total_waste_cost — "Costo de merma por local" ─────────────────────


def test_waste_cost_manually_calculated_value():
    """Manual calculation: Cali registers 3 units of waste @ 1.0 and
    2 units @ 4.0 this week:
        3 * 1.0 = 3.0
        2 * 4.0 = 8.0
        -------------
        total   = 11.0
    """
    raw = pd.DataFrame(
        [
            _event("stock_waste_registered", "CO-CALI", "CO", quantity=3, unit_cost=1.0),
            _event("stock_waste_registered", "CO-CALI", "CO", quantity=2, unit_cost=4.0),
        ]
    )
    series, rejected = _waste_cost(raw, WEEK_START)

    assert rejected == 0
    assert series.loc[("CO-CALI", "CO")] == 11.0


# ── 3. waste_ratio — "Ratio de merma" ─────────────────────────────────────


def test_waste_ratio_manually_calculated_value():
    """Manual calculation per docs/company-briefing.md section 4:
    waste_ratio = total_waste_cost / total_purchase_cost.

    purchase = 200.0, waste = 25.0  ->  25.0 / 200.0 = 0.125
    """
    purchase = pd.Series(
        [200.0], index=pd.MultiIndex.from_tuples([("CO-BOGOTA", "CO")], names=["location_id", "country"])
    )
    waste = pd.Series(
        [25.0], index=pd.MultiIndex.from_tuples([("CO-BOGOTA", "CO")], names=["location_id", "country"])
    )
    ratio = _waste_ratio(purchase, waste)

    assert ratio.loc[("CO-BOGOTA", "CO")] == pytest.approx(0.125)


def test_waste_ratio_is_zero_when_no_purchases():
    """0 when there were no purchases that week — a valid zero
    denominator, never a division error or a fabricated value
    (docs/company-briefing.md section 4: "0 si no hubo compras esa semana").
    """
    purchase = pd.Series(
        [0.0], index=pd.MultiIndex.from_tuples([("CO-CALI", "CO")], names=["location_id", "country"])
    )
    waste = pd.Series(
        [15.0], index=pd.MultiIndex.from_tuples([("CO-CALI", "CO")], names=["location_id", "country"])
    )
    ratio = _waste_ratio(purchase, waste)

    assert ratio.loc[("CO-CALI", "CO")] == 0.0


# ── 4. stockout_events_count — "Frecuencia de quiebre de stock" ──────────


def test_stockout_frequency_counts_only_its_own_event_type():
    """3 `stock_threshold_triggered` events for one location this week ->
    count must be exactly 3, and a different event_type at the same
    location must not inflate it.
    """
    raw = pd.DataFrame(
        [
            _event("stock_threshold_triggered", "US-MIAMI", "US"),
            _event("stock_threshold_triggered", "US-MIAMI", "US"),
            _event("stock_threshold_triggered", "US-MIAMI", "US"),
            _event("ingredient_price_variance_detected", "US-MIAMI", "US"),
        ]
    )
    counts = _stockout_frequency(raw)

    assert counts.loc[("US-MIAMI", "US")] == 3


# ── 5. price_alert_events_count — "Frecuencia de alertas de precio" ──────


def test_price_alert_frequency_counts_only_its_own_event_type():
    raw = pd.DataFrame(
        [
            _event("ingredient_price_variance_detected", "US-MIAMI", "US"),
            _event("ingredient_price_variance_detected", "US-MIAMI", "US"),
            _event("stock_threshold_triggered", "US-MIAMI", "US"),
        ]
    )
    counts = _price_alert_frequency(raw)

    assert counts.loc[("US-MIAMI", "US")] == 2


# ── Defensive behavior on malformed input ─────────────────────────────────


def test_non_numeric_unit_cost_raises_instead_of_silently_computing_garbage():
    """A wrong-type `unit_cost` (a string instead of a number) must never
    be silently coerced into a bogus cost — `_costed_sum`'s
    `astype(float) * astype(float)` raises on it, so the task fails loudly
    (defensive-by-exception) rather than persisting a wrong number
    downstream. A null/missing `unit_cost` is the *other*, already-expected
    case (see `test_purchase_cost_excludes_rows_with_missing_unit_cost`
    above) — never fabricated, but also never raised, since "no cost data"
    is a known, counted gap. A malformed non-null value is not: it
    indicates corrupt upstream data, and that must surface, not disappear.
    """
    raw = pd.DataFrame(
        [
            _event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=5, unit_cost="not-a-number"),
        ]
    )

    with pytest.raises(ValueError):
        _purchase_cost(raw, WEEK_START)


def test_null_location_id_row_is_discarded_not_fabricated_into_a_group():
    """A row with no `location_id` has no valid grouping key for this
    report's grain (docs/company-briefing.md section 4: one row per
    location_id per week) — pandas' `groupby` drops rows with a null key
    by default, so this row is silently discarded from the aggregate
    rather than invented into a fake "unknown location" row. The other,
    well-formed row for a real location must still be computed normally.
    """
    raw = pd.DataFrame(
        [
            _event("inbound_order_created", None, "CO", quantity=1, unit_cost=50.0),
            _event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=2, unit_cost=10.0),
        ]
    )
    series, rejected = _purchase_cost(raw, WEEK_START)

    assert ("CO-MEDELLIN", "CO") in series.index
    assert series.loc[("CO-MEDELLIN", "CO")] == 20.0
    assert not any(pd.isna(location_id) for location_id, _country in series.index)


# ── Cache must never hide a transformation error ──────────────────────────


def test_cache_never_serves_a_stale_success_after_a_failing_input(monkeypatch):
    """Runs the *real* `@task` (not `.fn`) inside a flow so Prefect's own
    cache layer is exercised. A failing call (bad data) must raise every
    time it's retried with that same bad input — Prefect only ever caches
    a COMPLETED task run, never a FAILED one — and a later call with good
    data must compute fresh, not be confused by the earlier failure.
    """
    from uuid import uuid4

    from prefect import flow

    bad_id = f"bad-{uuid4()}"
    good_id = f"good-{uuid4()}"

    bad_raw = pd.DataFrame(
        [_event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=1, unit_cost="broken")]
    )
    bad_raw.loc[0, "event_id"] = bad_id

    good_raw = pd.DataFrame(
        [_event("inbound_order_created", "CO-MEDELLIN", "CO", quantity=2, unit_cost=10.0)]
    )
    good_raw.loc[0, "event_id"] = good_id

    @flow
    def attempt_bad():
        return calculate_purchase_cost(bad_raw, WEEK_START)

    @flow
    def attempt_good():
        return calculate_purchase_cost(good_raw, WEEK_START)

    with pytest.raises(ValueError):
        attempt_bad()
    # Retrying the exact same bad input must fail again — a cached
    # "success" must never paper over a real transformation error.
    with pytest.raises(ValueError):
        attempt_bad()

    series, rejected = attempt_good()
    assert rejected == 0
    assert series.loc[("CO-MEDELLIN", "CO")] == 20.0
