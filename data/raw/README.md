# `data/raw` folder

This folder is intended for **raw data** related to the company: dumps, exports, sample files, event samples, or untransformed datasets.

- **Main purpose**: serve as a landing zone or reference for original data before pipelines process it.
- **Recommendation**: document each dataset’s origin, format, expected size, privacy/PII considerations, and how it is versioned (ideally avoiding sensitive data in the repository).

## `telemetry_<YYYY-MM-DD>.csv`

Daily backup/audit copy of `telemetry_events` for that UTC day, written
by `scripts/nightly_export.py` — never overwritten once it exists, and
never read back by any pipeline (the pipeline always queries the
database directly). Gitignored (`data/raw/telemetry_*.csv`) — these
contain real telemetry data (session_id/user_id/tags), never committed.
See `scripts/README.md`'s `nightly_export.py` section for the full
contract.

> _Spanish version: [README.es.md](./README.es.md)._
