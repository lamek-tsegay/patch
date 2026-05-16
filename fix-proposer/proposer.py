"""propose_fixes — orchestrator for the fix-proposer mock pipeline.

Loops the three strategy slots for a Finding's category, calls Nemotron once
per slot, parses each response into a FixProposal. Synchronous; the asyncio
fan-out lives in the real-NIM PR (see docs/nemotron.md latency budget).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from shared.nemotron_client import NemotronClient
from shared.schema import (
    BreakingChangeRisk,
    Finding,
    FixProposal,
    SearchReplacePatch,
)
from strategies import StrategySlot, get_slots

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a code-fix proposer for a security agent. \
You receive a verified vulnerability finding and a remediation strategy slot. \
Produce one concrete patch that implements that specific strategy.

Hard requirements:
- The search_block must be a verbatim substring of the file's current bytes. \
If unsure, prefer a shorter exact match over a longer paraphrase. The patch \
is rejected if search_block does not appear in the file character-for-character.
- The replace_block must be the exact bytes that should replace the search_block.
- Return only a single JSON object matching the schema in the user prompt. \
No prose, no markdown, no code fences.
"""


_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": [
        "title",
        "rationale",
        "tradeoffs",
        "breaking_change_risk",
        "search_block",
        "replace_block",
    ],
    "properties": {
        "title": {"type": "string"},
        "rationale": {"type": "string"},
        "tradeoffs": {"type": "string"},
        "breaking_change_risk": {"enum": ["low", "medium", "high"]},
        "search_block": {"type": "string"},
        "replace_block": {"type": "string"},
    },
}


def propose_fixes(
    finding: Finding,
    client: NemotronClient,
    *,
    model: str | None = None,
    repo_root: str | Path = ".",
) -> list[FixProposal]:
    """Produce three ranked FixProposal objects for one Finding."""
    # Fail fast on unsupported category before any env/config checks.
    slots = get_slots(finding.category)

    resolved_model = model or os.environ.get("NIM_MODEL_SUPER")
    if not resolved_model:
        raise RuntimeError(
            "model not given and NIM_MODEL_SUPER not set — refusing to "
            "hardcode a model string (see docs/nemotron.md)"
        )

    proposals: list[FixProposal] = []
    for rank, slot in enumerate(slots, start=1):
        user_prompt = _build_user_prompt(finding, slot, repo_root)
        raw = client.generate_json(
            model=resolved_model,
            system=SYSTEM_PROMPT,
            user=user_prompt,
            schema=_OUTPUT_SCHEMA,
        )
        proposals.append(_parse_proposal(raw, finding, slot, rank))
    return proposals


def _build_user_prompt(
    finding: Finding,
    slot: StrategySlot,
    repo_root: str | Path,
) -> str:
    file_window = _read_file_window(finding, Path(repo_root))
    parts = [
        "## Finding",
        finding.model_dump_json(indent=2),
        "",
        "## File context (±10 lines around the vuln; may be empty if file unreadable)",
        "```",
        file_window,
        "```",
        "",
        "## Strategy slot",
        f"Strategy: {slot.strategy.value}",
        f"Definition: {slot.description}",
        f"Instruction: {slot.prompt_hint}",
        "",
        "## Output JSON schema",
        json.dumps(_OUTPUT_SCHEMA, indent=2),
    ]
    return "\n".join(parts)


def _read_file_window(finding: Finding, repo_root: Path) -> str:
    path = repo_root / finding.file
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, UnicodeDecodeError, OSError):
        # Mock-pipeline reality: demo-repo may not be seeded yet. Fall back to
        # vulnerable_code so the prompt still has something concrete.
        logger.warning(
            "could not read %s; falling back to Finding.vulnerable_code", path
        )
        return finding.vulnerable_code
    start = max(0, finding.line_start - 1 - 10)
    end = min(len(lines), finding.line_end + 10)
    return "\n".join(lines[start:end])


def _parse_proposal(
    raw: dict[str, Any],
    finding: Finding,
    slot: StrategySlot,
    rank: int,
) -> FixProposal:
    patch = SearchReplacePatch(
        file=finding.file,
        search=raw["search_block"],
        replace=raw["replace_block"],
    )
    return FixProposal(
        proposal_id=uuid4(),
        finding_id=finding.finding_id,
        strategy=slot.strategy,
        rank=rank,
        title=raw["title"],
        rationale=raw["rationale"],
        tradeoffs=raw["tradeoffs"],
        breaking_change_risk=BreakingChangeRisk(raw["breaking_change_risk"]),
        patches=[patch],
        created_at=datetime.now(UTC),
    )
