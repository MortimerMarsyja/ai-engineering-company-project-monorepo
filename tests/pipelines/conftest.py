"""Shared pytest setup for tests/pipelines/.

Puts `data/pipelines/weekly-location-performance` on sys.path so this
suite can `import transform` the same way the pipeline's own modules
import each other (see that folder's `_pathsetup.py` for why a
hyphenated directory can't be a real Python package / import target).
"""

from __future__ import annotations

import sys
from pathlib import Path

_PIPELINE_DIR = Path(__file__).resolve().parents[2] / "data" / "pipelines" / "weekly-location-performance"
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))
