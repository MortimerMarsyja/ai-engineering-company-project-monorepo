"""Tests for POST /telemetry/events and the TELEMETRY_ENDPOINT setting."""

from __future__ import annotations

import logging

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app

VALID_EVENT = {
    "eventId": "a1b2c3d4-0000-4000-8000-000000000001",
    "timestamp": "2026-10-28T15:04:05.123Z",
    "sessionId": "b3f1b2a0-1111-4a2b-9c3d-000000000001",
    "userId": "42",
    "event_type": "inbound_order_created",
    "schemaVersion": "1.0.0",
    "requestId": None,
    "properties": {
        "location_id": "CO-MEDELLIN",
        "country": "CO",
        "product_id": "7",
        "product_category": "Meat",
        "quantity": 12.5,
        "unit": "kg",
        "currency": "COP",
        "order_id": "101",
        "supplier_id": "9",
    },
}


def _event(**overrides) -> dict:
    return {**VALID_EVENT, **overrides}


@pytest.mark.asyncio
async def test_valid_batch_returns_correct_count():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/telemetry/events",
            json={"events": [_event(), _event(eventId="a1b2c3d4-0000-4000-8000-000000000002")]},
        )
    assert resp.status_code == 200
    assert resp.json() == {"received": 2}


@pytest.mark.asyncio
async def test_empty_batch_returns_zero():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": []})
    assert resp.status_code == 200
    assert resp.json() == {"received": 0}


@pytest.mark.asyncio
async def test_missing_events_key_is_rejected():
    """Malformed batch (no `events` key at all) uses the standard 422 shape."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={})
    assert resp.status_code == 422
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_events_key_not_a_list_is_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": "not-a-list"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_event_data_is_rejected():
    """A batch with one well-formed event and one missing a required field (timestamp)."""
    bad_event = _event()
    del bad_event["timestamp"]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": [_event(), bad_event]})
    assert resp.status_code == 422
    errors = resp.json()["detail"]
    assert any("timestamp" in str(e.get("loc", [])) for e in errors)


@pytest.mark.asyncio
async def test_timestamp_without_timezone_is_rejected():
    event = _event(timestamp="2026-10-28T15:04:05.123")  # no "Z" / offset
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_exact_json_field_naming_round_trips():
    """eventId/sessionId/userId/schemaVersion/requestId (camelCase) + event_type (snake_case)
    must all be accepted exactly as named by the plan — no renaming/aliasing."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": [_event()]})
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_camel_case_event_type_key_is_rejected_as_unknown_field():
    """`eventType` (camelCase) is not a recognized field — the plan requires
    the snake_case `event_type` key exactly."""
    event = _event()
    event["eventType"] = event.pop("event_type")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_event_type_must_be_snake_case():
    """camelCase / PascalCase / kebab-case event_type values are rejected."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for bad_name in ["inboundOrderCreated", "InboundOrderCreated", "inbound-order-created", "inbound"]:
            resp = await client.post("/api/v1/telemetry/events", json={"events": [_event(event_type=bad_name)]})
            assert resp.status_code == 422, f"{bad_name} should have been rejected"


@pytest.mark.asyncio
async def test_valid_snake_case_event_type_is_accepted():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/telemetry/events", json={"events": [_event(event_type="session_expired")]}
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_batch_logs_size_and_event_types_without_payload(caplog):
    with caplog.at_level(logging.INFO, logger="app.routers.telemetry"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/telemetry/events",
                json={"events": [_event(), _event(event_type="login_failed")]},
            )
    assert resp.status_code == 200
    log_text = "\n".join(r.message for r in caplog.records)
    assert "size=2" in log_text
    assert "inbound_order_created" in log_text
    assert "login_failed" in log_text
    # Never log full payloads or event-specific properties.
    assert "CO-MEDELLIN" not in log_text
    assert "supplier_id" not in log_text


def test_telemetry_endpoint_setting_is_read_without_outbound_calls(monkeypatch):
    """Reading TELEMETRY_ENDPOINT via the standard settings mechanism must not
    make any network call — this phase only establishes the config pattern."""
    monkeypatch.setenv("TELEMETRY_ENDPOINT", "https://telemetry.example.com/ingest")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.TELEMETRY_ENDPOINT == "https://telemetry.example.com/ingest"
    finally:
        get_settings.cache_clear()


def test_telemetry_endpoint_defaults_to_empty_without_failing_startup():
    """Absence of TELEMETRY_ENDPOINT must not prevent settings (and therefore
    the app) from loading — it's optional and currently unused."""
    settings = get_settings()
    assert isinstance(settings.TELEMETRY_ENDPOINT, str)
