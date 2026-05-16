"""Pytest path setup.

`shared/` is a Python package (importable as `shared.schema`), but `fix-proposer/`
has a hyphen, so its modules can only be imported as top-level (`import proposer,
strategies`). This conftest puts both the repo root and `fix-proposer/` on
sys.path so tests can resolve both styles.

Keep minimal until the team adopts a real packaging story (pyproject.toml).
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "fix-proposer"))
