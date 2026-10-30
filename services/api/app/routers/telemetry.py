"""Telemetry ingestion router.

POST /telemetry/events validates and acknowledges a batch of telemetry
events (docs/event-envelope.md, docs/event-delivery-strategy.md). This
phase is limited to validation, logging, and acknowledgement — no
persistence, queueing, or forwarding yet (TELEMETRY_ENDPOINT is read but
unused, see app.core.config).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.models.telemetry import TelemetryEventBatch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/events")
async def ingest_events(batch: TelemetryEventBatch) -> dict[str, int]:
    """Validate and acknowledge a batch of telemetry events.

    Logs the batch size and each event's `event_type` only — never the full
    event payload or its `properties` (which may carry event-specific,
    non-public data per docs/event-envelope.md section 5).
    """
    event_types = [event.event_type for event in batch.events]
    logger.info(
        "Received telemetry batch: size=%d event_types=%s",
        len(batch.events),
        event_types,
    )
    return {"received": len(batch.events)}
