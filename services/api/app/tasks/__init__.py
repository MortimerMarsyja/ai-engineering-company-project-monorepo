"""Celery tasks live inside `app` (the same package `services/api`'s
FastAPI process already is), not a separate top-level `services/worker`
package — the worker needs the exact same database models, service
functions, and settings the API uses (app.core.database, app.services.*,
app.core.config), and this repo's established convention is to avoid
fragile cross-package imports (see e.g. data/pipelines/*'s sys.path
bootstraps for the opposite situation) rather than introduce one here
when a single shared package already does the job. The worker and the
API process run as independent OS processes either way — the worker
command (`celery -A app.celery_app worker`, see app/celery_app.py) never
runs inside `uvicorn`/FastAPI's process or lifespan.
"""
