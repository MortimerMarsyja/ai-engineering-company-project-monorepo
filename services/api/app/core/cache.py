"""In-process TTL cache for the endpoints flagged as cacheable in
docs/cache-evaluation.md (``incidents/metrics`` and the ``suppliers`` list).

This is a single-process, in-memory cache — good enough for the current
single-worker deployment, but it will NOT be shared across multiple workers
or instances. If the service is ever scaled horizontally, this should move
to Redis instead (already flagged as a future item in
docs/ARCHITECTURE_PROPOSAL.md).
"""

from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_store: dict[str, tuple[float, Any]] = {}


def get(key: str) -> Any | None:
    """Return the cached value for ``key``, or None if missing/expired."""
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            del _store[key]
            return None
        return value


def set(key: str, value: Any, ttl_seconds: float) -> None:
    """Cache ``value`` under ``key`` for ``ttl_seconds``."""
    with _lock:
        _store[key] = (time.monotonic() + ttl_seconds, value)


def invalidate_prefix(prefix: str) -> None:
    """Drop every cached key starting with ``prefix`` (e.g. a whole
    endpoint's cache, regardless of query-param variants)."""
    with _lock:
        for key in [k for k in _store if k.startswith(prefix)]:
            del _store[key]
