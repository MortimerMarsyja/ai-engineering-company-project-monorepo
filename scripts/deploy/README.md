# `scripts/deploy` — nightly_export scheduling

Deployment config for running `scripts/nightly_export.py` automatically.
This repo's only existing precedent for scheduling a background Python
job is `data/pipelines/weekly-location-performance/deploy/` (systemd
units on a bare-metal/VM host, not a container) — the files here follow
that same convention, since `docker-compose.yml` only defines `ui` and
`backend` (no scheduler/worker service exists to extend).

## Chosen option: systemd timer

`nightly-export.service` + `nightly-export.timer` — the OS-level cron
option, expressed as systemd units (rather than a raw crontab entry) so
it matches the existing `weekly-location-performance-serve.service`/
`prefect-server.service` precedent: same `User=`/`WorkingDirectory=`
convention, same journald-backed logging, same "install once, systemd
restarts/tracks it" operational model.

Install:

```bash
sudo cp nightly-export.service nightly-export.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nightly-export.timer
```

Verify:

```bash
systemctl list-timers nightly-export.timer      # next scheduled run, in UTC
journalctl -u nightly-export.service -n 100     # recent output (job_name/status/target_date/job_run_id on every line)
```

**Schedule: daily at 02:00 UTC** — no schedule was already established
anywhere in this repo for this job, so this is the task's own documented
default. The `OnCalendar=*-*-* 02:00:00 UTC` line in `nightly-export.timer`
sets the timezone explicitly: systemd otherwise resolves `OnCalendar`
against the host's local timezone, not UTC, so a host not already
configured for UTC would silently fire at the wrong wall-clock time
without that suffix.

**Prerequisites on the host** (same as `weekly-location-performance`'s
own deploy docs):
- `services/api/.venv` already created with this project's dependencies
  installed (the `ExecStart=` line uses that interpreter directly).
- `services/api/.env` present with a real `DATABASE_URL` — loaded by
  `app.core.config` at import time, not duplicated into the unit file.
- `/opt/brasaland/data/raw/` writable by the `User=` the service runs as
  (persistent storage, not an ephemeral container filesystem — if this
  ever runs inside a container instead, that directory needs a mounted
  volume so exported CSVs survive a container restart).

## Alternative: plain crontab

If the host has no systemd (or the team prefers a plain crontab entry),
the equivalent is:

```cron
# m h dom mon dow   command
0 2 * * *   cd /opt/brasaland && TZ=UTC /opt/brasaland/services/api/.venv/bin/python scripts/nightly_export.py >> /var/log/nightly-export.log 2>&1
```

`TZ=UTC` on the command itself is required for the same reason as the
systemd timer's explicit `UTC` suffix — cron interprets `0 2 * * *`
against whatever timezone the crontab's environment resolves to (usually
the system's local timezone), not UTC, unless told otherwise. Logs go to
a plain file here instead of journald; redirect/rotate it with whatever
log tooling the host already uses.

## Why not a dedicated scheduler container

`docker-compose.yml` has no scheduler/worker service to add this to, and
introducing one (a new long-running container whose only job is to sleep
until 02:00 UTC and exec a one-off script) would be new infrastructure
with no existing precedent in this repo, for no benefit over the systemd
timer above — which this project's deployment model already uses for
exactly this kind of job. Revisit this if the project moves its whole
deployment onto an orchestrator with native scheduled-job support (e.g. a
Kubernetes CronJob) in the future.

## Explicitly not used

Per the task's own constraints — this job must never run inside the
FastAPI process:
- No APScheduler inside `services/api`.
- No `@repeat_every`.
- No FastAPI `lifespan` hook starting or scheduling this job.

`scripts/nightly_export.py` only ever runs as its own, independent OS
process (systemd unit or cron entry), never imported by or started from
`app.main`.
