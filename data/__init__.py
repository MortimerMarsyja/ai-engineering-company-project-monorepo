"""Marks `data/` as a real Python package.

Every existing pipeline under `data/pipelines/` (e.g. `weekly-location-
performance/`) is deliberately NOT a dotted-importable package — its
folder name is kebab-case specifically so it can't be (see that folder's
`_pathsetup.py` docstring). `data/pipelines/telemetry_kpi_daily/` is the
one exception: its reference entry point is
`python -m data.pipelines.telemetry_kpi_daily.run`, which requires `data`,
`data.pipelines`, and `data.pipelines.telemetry_kpi_daily` to all be real
packages. This file (and its sibling `data/pipelines/__init__.py`) exist
only to make that one dotted import work — they add no behavior.
"""
