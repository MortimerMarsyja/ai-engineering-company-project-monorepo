"""Shared pytest setup for tests/scripts/.

Puts `scripts/` on sys.path so this suite can `import nightly_export` as
a plain module (scripts/ is not a package) — same sys.path-by-directory
technique as tests/pipelines/conftest.py. nightly_export.py bootstraps
its own `services/api` sys.path entry for `app.*` at import time, so
nothing extra is needed here for that.
"""

from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
