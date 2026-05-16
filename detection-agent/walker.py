"""Repo walker: first-party files only.

The skip rules are the LOCKED differentiator — vendored / build / cache
directories must not reach the model. Checked on every path component
(not just the top level) so deeply-buried vendor paths like
demo-repo/vendor/site-packages/flask_helper/__init__.py are skipped
because "vendor" appears anywhere in Path.parts.
"""
from __future__ import annotations

import fnmatch
import logging
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)


SKIP_DIR_NAMES: frozenset[str] = frozenset({
    "vendor",
    "node_modules",
    ".venv",
    "venv",
    "site-packages",
    "__pycache__",
    ".git",
    "dist",
    "build",
    ".pytest_cache",
    ".mypy_cache",
})

SKIP_FILE_PATTERNS: tuple[str, ...] = (
    "*.min.js",
    "*-lock.json",
    "*.lock",
    "*.pyc",
    "*.so",
    "*.dylib",
)

MAX_FILE_BYTES = 200 * 1024
BINARY_SNIFF_BYTES = 4096


def _is_skipped_dir_component(path: Path) -> str | None:
    for part in path.parts:
        if part in SKIP_DIR_NAMES:
            return part
    return None


def _matches_skip_pattern(name: str) -> str | None:
    for pat in SKIP_FILE_PATTERNS:
        if fnmatch.fnmatch(name, pat):
            return pat
    return None


def _looks_binary(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            chunk = f.read(BINARY_SNIFF_BYTES)
    except OSError:
        return True
    try:
        chunk.decode("utf-8")
    except UnicodeDecodeError:
        return True
    return False


def walk_first_party(repo_root: Path) -> Iterator[Path]:
    """Yield Paths for first-party, text, in-budget files under repo_root."""
    repo_root = Path(repo_root)
    if not repo_root.exists():
        logger.warning("repo_root does not exist: %s", repo_root)
        return

    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue

        rel = path.relative_to(repo_root)

        skipped_dir = _is_skipped_dir_component(rel)
        if skipped_dir:
            logger.debug("skip %s (dir component %r)", rel, skipped_dir)
            continue

        skipped_pat = _matches_skip_pattern(path.name)
        if skipped_pat:
            logger.debug("skip %s (file pattern %r)", rel, skipped_pat)
            continue

        try:
            size = path.stat().st_size
        except OSError:
            logger.debug("skip %s (stat failed)", rel)
            continue
        if size > MAX_FILE_BYTES:
            logger.debug("skip %s (size %d > %d)", rel, size, MAX_FILE_BYTES)
            continue

        if _looks_binary(path):
            logger.debug("skip %s (binary)", rel)
            continue

        logger.info("scan target: %s", rel)
        yield path
