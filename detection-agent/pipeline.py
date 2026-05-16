"""Per-file scan orchestration.

scan_file is the unit of work: read -> build prompt -> single NIM call
-> validate -> verbatim guard -> return survivors plus a counts dict
the CLI aggregates for the summary table.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from shared.nemotron_client import NIMNemotronClient
from shared.schema import Finding, verify_against_source

from prompt import build_prompt

logger = logging.getLogger(__name__)


def _empty_counts() -> dict[str, int]:
    return {
        "emitted": 0,
        "dropped_validation": 0,
        "dropped_guard": 0,
        "persisted": 0,
    }


def scan_file(
    file_path: Path,
    repo_root: Path,
    client: NIMNemotronClient,
    model: str,
) -> tuple[list[Finding], dict[str, int]]:
    counts = _empty_counts()
    rel_posix = file_path.relative_to(repo_root).as_posix()
    # Re-attach the repo_root's directory name so eval matching lines up
    # with the answer key's "demo-repo/..." paths. The answer key uses
    # paths prefixed with the demo-repo directory name.
    display_file = f"{repo_root.name}/{rel_posix}"

    try:
        file_text = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        logger.warning("read failed for %s: %s", file_path, e)
        return [], counts

    system, user = build_prompt(display_file, file_text)

    try:
        response: dict[str, Any] = client.generate_json(
            model=model,
            system=system,
            user=user,
            max_tokens=4096,
            detailed_thinking=True,
        )
    except Exception as e:  # noqa: BLE001 — any model failure is non-fatal per file
        logger.warning("nim call failed for %s: %s", display_file, e)
        return [], counts

    raw_findings = response.get("findings")
    if not isinstance(raw_findings, list):
        logger.warning(
            "unexpected response shape for %s (no 'findings' list): keys=%s",
            display_file,
            list(response.keys()) if isinstance(response, dict) else type(response).__name__,
        )
        return [], counts

    counts["emitted"] = len(raw_findings)

    survivors: list[Finding] = []
    for raw in raw_findings:
        if not isinstance(raw, dict):
            counts["dropped_validation"] += 1
            logger.warning("dropped non-dict finding for %s: %r", display_file, raw)
            continue

        # Overwrite file path: the model may emit absolute paths, wrong
        # paths, or paraphrased paths. We know the truth — substitute it.
        raw["file"] = display_file

        # finding_id is generated downstream — model-supplied values have
        # no consumer and the model has been observed inventing UUIDs
        # with non-hex characters (e.g. ...g1h2-i3j4...) that fail the
        # Pydantic UUID validator. Always overwrite.
        raw["finding_id"] = str(uuid4())

        try:
            finding = Finding(**raw)
        except ValidationError as e:
            counts["dropped_validation"] += 1
            logger.warning(
                "validation error for %s: %s  raw=%r",
                display_file, e.errors(), raw,
            )
            continue

        if not verify_against_source(finding, file_text):
            counts["dropped_guard"] += 1
            logger.warning(
                "rejected: vulnerable_code not found verbatim in source "
                "(file=%s, category=%s, line_start=%d)",
                display_file, finding.category.value, finding.line_start,
            )
            continue

        survivors.append(finding)

    return survivors, counts
