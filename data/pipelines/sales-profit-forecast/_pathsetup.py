"""sys.path shim so sibling modules in this folder can import each other.

The folder name (`sales-profit-forecast`) has hyphens, so it cannot be a
regular Python package (`import sales-profit-forecast` is a syntax error).
Every entry-point script in this folder starts with `import _pathsetup`
before importing a sibling module, exactly like
`data/pipelines/weekly-location-performance/_pathsetup.py`.
"""

import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))
