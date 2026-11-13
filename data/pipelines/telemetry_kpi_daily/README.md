# `telemetry_kpi_daily` — PLACEHOLDER

This is a **placeholder** entry point, not a real KPI pipeline. No
"Milestone 6" briefing/spec exists anywhere in this repo (confirmed by an
exhaustive search of `docs/` and `CONTEXT*.md` when this was created) —
there is no daily telemetry-KPI business logic to implement yet.

It exists so `scripts/nightly_export.py` (the nightly telemetry
export/backup job) has a real, runnable subprocess with the exact
interface that job's own spec asked for:

```bash
python -m data.pipelines.telemetry_kpi_daily.run --target-date 2026-07-13 --no-prefect
```

What it actually does: reads `--target-date`, queries `telemetry_events`
for that UTC calendar day (reusing
`app.models.telemetry_storage.fetch_telemetry_events_dataframe` — the
same function the weekly-location-performance pipeline's extraction and
`GET /telemetry/report` already use), and logs the row count. It reads
the **database**, never `nightly_export.py`'s CSV backup — that CSV is an
audit copy only, never a pipeline input.

Unlike every other pipeline under `data/pipelines/` (kebab-case folder
names, deliberately *not* dotted-importable — see
`weekly-location-performance/_pathsetup.py`), this folder uses
underscores specifically so `python -m data.pipelines.telemetry_kpi_daily.run`
works. `data/__init__.py` and `data/pipelines/__init__.py` exist only to
support that one import path.

**Replace this module's body** with the real Milestone 6 pipeline once
that spec exists. `scripts/nightly_export.py`'s subprocess invocation
(`PIPELINE_MODULE` in that script) does not need to change when you do,
as long as the real pipeline keeps accepting `--target-date` and exits
0/non-zero the same way.
