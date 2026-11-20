-- Celery background-task tracking: two small, separate tables.
--
--   task_submissions — one row per task *enqueued* through this API,
--     written synchronously in the request handler right after the
--     broker accepts the task (never before — see
--     app/services/task_tracking.py). This is what makes
--     GET /tasks/{task_id} authorization and retry-idempotency possible
--     without depending on Celery's own Redis-backed result metadata,
--     which (a) doesn't exist at all for a task that's merely queued but
--     not yet picked up by a worker (exactly the PENDING-ambiguity
--     Celery itself warns about), and (b) expires with result_expires
--     regardless of whether anyone has looked at it yet.
--     `persisted_at` is the idempotency guard for the one task this
--     migration's task currently supports (incidents-CSV ingestion):
--     NULL until that task's side effects (row inserts) have been
--     durably applied at least once; a retry of the SAME task_id checks
--     this before persisting again, so a transient failure that
--     triggers a Celery retry can never insert the same CSV's rows
--     twice.
--
--   task_dead_letters — one row per task that exhausted retries (or hit
--     a non-retryable error on its first attempt), written from the
--     celery.signals.task_failure handler
--     (app/celery_app.py/app/tasks/*). UNIQUE(task_id) is what makes
--     that handler safe to fire more than once for the same terminal
--     failure (it can, in principle, under worker restarts/signal
--     redelivery) — INSERT ... ON CONFLICT (task_id) DO NOTHING keeps
--     exactly one dead-letter row per terminal failure, never more.
--
-- Deliberately separate from both job_runs (Milestone 6's own
-- background-job lock/idempotency table,
-- supabase/migrations/20261113090000_create_job_runs.sql) and
-- reporting.pipeline_runs — different layer again: those track whole
-- scheduled jobs/pipeline runs, these track individual Celery task
-- executions. Never merge any of the three.

CREATE TABLE IF NOT EXISTS task_submissions (
    task_id       text PRIMARY KEY,
    task_name     text NOT NULL,
    submitted_by  integer REFERENCES users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    persisted_at  timestamptz
);

COMMENT ON TABLE task_submissions IS
    'One row per Celery task enqueued via the API — written synchronously '
    'right after the broker accepts the task, before returning 202. Source '
    'of truth for GET /tasks/{task_id} authorization (submitted_by) and for '
    'the retry-idempotency guard (persisted_at: NULL until this task''s side '
    'effects have been durably applied once).';

CREATE TABLE IF NOT EXISTS task_dead_letters (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         text NOT NULL UNIQUE,
    task_name       text,
    attempt_number  integer NOT NULL,
    error_message   text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE task_dead_letters IS
    'One row per Celery task that terminally failed (retries exhausted, or '
    'a non-retryable error on its first attempt) — never for an '
    'intermediate retry. attempt_number is 1-based (exhausting '
    'max_retries=3 means 1 initial attempt + 3 retries = attempt 4). '
    'UNIQUE(task_id) makes the insert safe to attempt more than once for '
    'the same terminal failure (INSERT ... ON CONFLICT (task_id) DO '
    'NOTHING) — never more than one row per task.';
