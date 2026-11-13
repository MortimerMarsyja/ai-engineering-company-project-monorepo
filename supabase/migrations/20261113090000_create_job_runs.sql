-- job_runs — execution log + idempotency/locking source for background
-- jobs (first consumer: scripts/nightly_export.py's "nightly_export" job).
--
-- Deliberately separate from reporting.pipeline_runs (Milestone 6's own
-- execution log, created by
-- supabase/migrations/20261109150000_create_reporting_schema.sql): these
-- track two different layers of execution — pipeline_runs is one data
-- pipeline's own ETL attempts (extract/transform/load), while job_runs is
-- the operational/background-job layer that *invokes* a pipeline as a
-- subprocess alongside its own work (e.g. the CSV export). Never merge
-- the two, and never have one read/write the other's table.
--
-- No separate lock table or lock column: the locking contract is that a
-- row with status='processing' for a given job_name IS the lock (see
-- services/api/app/services/job_runner.py's module docstring for exactly
-- how a Postgres advisory lock is used only to make the "check status,
-- then insert" step atomic — the advisory lock itself is never the
-- long-lived lock; the 'processing' row is).

CREATE TABLE IF NOT EXISTS job_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name        text NOT NULL,
    target_date     date NOT NULL,
    status          text NOT NULL
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    started_at      timestamptz,
    finished_at     timestamptz,
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE job_runs IS
    'Execution log + idempotency/locking source for background jobs '
    '(job_name=''nightly_export'' is the first user). One row per attempt — '
    'a retry after a failure inserts a new row, it never reuses the failed '
    'one. A status=''processing'' row for a job_name is that job''s global '
    'lock, regardless of target_date; a status=''completed'' row for '
    '(job_name, target_date) is what daily idempotency checks against. '
    'Kept separate from reporting.pipeline_runs (Milestone 6''s own ETL '
    'execution log) — different layer of execution, never merged.';

CREATE INDEX IF NOT EXISTS ix_job_runs_job_name_target_date
    ON job_runs USING btree (job_name, target_date);
