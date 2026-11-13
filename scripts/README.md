# `scripts` folder

This folder contains **helper scripts** for the monorepo: development automation, maintenance utilities, repetitive tasks (setup, lint, migrations, data generation, etc.), and internal tooling.

- **Main purpose**: group support tools that do not belong to a specific app, agent, or pipeline but make the team’s work easier.
- **Recommendation**: document each script (what it does, parameters, requirements, usage examples) and keep them reproducible (and safe) across environments.

## `nightly_export.py` — nightly telemetry CSV backup + Milestone 6 pipeline trigger

```bash
python scripts/nightly_export.py                       # yesterday, UTC
TARGET_DATE=2026-07-13 python scripts/nightly_export.py # a specific day (manual/backfill)
```

Run with the `services/api` virtualenv's Python (`app.*` — DB access — is
only importable there):

```bash
services/api/.venv/bin/python scripts/nightly_export.py
```

What it does:
1. Resolves `target_date` — `TARGET_DATE` env var (`YYYY-MM-DD`) if set,
   otherwise yesterday in UTC. An invalid `TARGET_DATE` is rejected before
   anything else happens (no `job_runs` row is created for it).
2. Atomically acquires the right to run via `app.services.job_runner`
   (backed by the `job_runs` table — see
   `supabase/migrations/20261113090000_create_job_runs.sql`): skips with
   exit code 0, no work done, if either (a) a run for this job is already
   `processing` (any date), or (b) a run for this exact `target_date` is
   already `completed`. A previous `failed` run never blocks a retry.
3. Exports `telemetry_events` for that UTC day to
   `data/raw/telemetry_<target_date>.csv` — **only if that file doesn't
   already exist** (never overwritten; published atomically via a temp
   file, so a failed export never leaves a partial CSV at the final
   path). This file is a backup/audit copy only; the pipeline itself
   always reads the database, never this CSV.
4. Runs the Milestone 6 pipeline as a subprocess (same Python interpreter,
   `target_date` passed explicitly — see `PIPELINE_MODULE` in the script,
   currently `data.pipelines.telemetry_kpi_daily.run`, a **placeholder**:
   no Milestone 6 spec exists in this repo yet, see that module's own
   docstring).
5. Marks the run `completed` only if both steps succeeded; any failure in
   either step marks it `failed` with the error message and exits
   non-zero.

**Recovering a stuck run**: if the process is killed abruptly mid-run, its
`job_runs` row stays `processing` forever (no automatic lock expiry by
design) and keeps blocking every future run of this job. Recover by hand:

```sql
UPDATE job_runs
   SET status = 'failed', finished_at = now(),
       error_message = 'Manually recovered: run abandoned by a killed process.'
 WHERE id = '<the stuck run''s id>';
```

Find the stuck row first with
`SELECT * FROM job_runs WHERE job_name = 'nightly_export' AND status = 'processing';`
and confirm the process is actually gone before updating it.

**Scheduling**: see [`deploy/README.md`](./deploy/README.md) — a systemd
timer, daily at 02:00 UTC by default (no prior schedule existed for this
job). This script never runs inside the FastAPI process (no APScheduler,
no `@repeat_every`, no lifespan hook) — only as its own OS-level scheduled
process.

> _Spanish version: [README.es.md](./README.es.md)._
