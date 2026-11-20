"""Celery application — background task processing shared by the API
process (to enqueue tasks and poll results), the independent worker, and
Flower (monitoring). Redis is both the broker and the result backend
(``REDIS_URL``, app/core/config.py) — a single service, already required
infrastructure once Celery is introduced, with no need for a second
broker technology.

Worker (run from `services/api`, same venv as the API — see
app/tasks/__init__.py for why tasks live inside this same package rather
than a separate top-level service):

    celery -A app.celery_app worker --loglevel=info

Flower (monitoring UI):

    celery -A app.celery_app flower --port=5555

This module must never be imported by `app.main`'s module-level code in a
way that starts a worker, a beat scheduler, or any background thread —
the API process only ever *uses* `celery_app` to enqueue tasks
(`task.delay(...)`) and to read state (`AsyncResult(...)`), never to
execute one.
"""

from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "brasaland",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.incidents"],
)

celery_app.conf.update(
    # JSON only, both directions — task args/kwargs and results must be
    # plain JSON-serializable data (ids, strings, lists, dicts), never
    # pickled Python objects (ORM instances, request objects, etc.). This
    # is both a security hardening (no pickle deserialization of
    # attacker-reachable broker messages) and the explicit contract this
    # codebase's tasks must follow.
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # STARTED is only ever recorded (and visible via GET /tasks/{id} or
    # Flower) if this is on — by default Celery only tracks
    # PENDING/SUCCESS/FAILURE.
    task_track_started=True,
    # Required for Flower (and anything else consuming Celery's event
    # stream) to observe sent/received/started/succeeded/failed/retried
    # transitions in real time. Without task_send_sent_event, Flower can
    # show a task as PENDING once a worker claims it but never shows that
    # it was actually published by the API process in the first place.
    worker_send_task_events=True,
    task_send_sent_event=True,
    # Keep extra metadata (name, args, kwargs, queue, ...) in backend
    # result entries once a task reaches a tracked state — useful for
    # Flower and for debugging; ownership/authorization for
    # GET /tasks/{id} still goes through app.services.task_tracking's own
    # persisted table, never this (Redis-backed, TTL-bound, and absent
    # entirely for a merely-queued PENDING task — see that module's
    # docstring for why this can't be the authorization source of truth).
    result_extended=True,
    # How long a result (and the task_track_started STARTED/RETRY state)
    # stays in Redis before Celery expires it — after this, polling
    # GET /tasks/{id} for an old task_id reverts to indistinguishable-
    # from-unknown PENDING. 1 day matches this project's other
    # short-TTL-cache conventions (see app/core/cache.py) scaled up for a
    # background job a caller might reasonably poll hours later.
    result_expires=86400,
    # Recommended default since Celery 6 deprecated the old startup
    # behavior — retry connecting to the broker on worker startup instead
    # of crashing immediately if Redis isn't up yet (e.g. compose startup
    # ordering, see docker-compose.yml's healthcheck-gated depends_on).
    broker_connection_retry_on_startup=True,
)

# Registers the task_failure -> dead-letter signal handler. Imported here
# (not left to each task module) so both the worker and the API process
# have it registered as soon as they import celery_app — harmless in the
# API process, which never executes a task and so never triggers the
# signal itself.
from app.tasks import signal_handlers  # noqa: E402, F401
