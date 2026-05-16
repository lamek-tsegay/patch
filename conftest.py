"""Pytest path setup + integration-marker plumbing.

`shared/` is a Python package (importable as `shared.schema`), but `fix-proposer/`
has a hyphen, so its modules can only be imported as top-level (`import proposer,
strategies`). This conftest puts both the repo root and `fix-proposer/` on
sys.path so tests can resolve both styles.

Also registers the `integration` marker and the `--run-integration` opt-in flag
so tests that hit external APIs (NIM) are skipped by default.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "fix-proposer"))


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="run integration tests that hit external APIs (e.g. NIM)",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: tests that hit external APIs; opt in with --run-integration",
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-integration"):
        return
    skip_marker = pytest.mark.skip(reason="needs --run-integration flag")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_marker)
