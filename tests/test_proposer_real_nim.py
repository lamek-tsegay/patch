"""Real-NIM integration test for the SQL injection slots.

Gated two ways: opt in with --run-integration (registered in conftest.py)
AND set NIM_API_KEY / NIM_ENDPOINT / NIM_MODEL_SUPER in the environment.

Run manually with:
    pytest tests/test_proposer_real_nim.py --run-integration -s -v
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from proposer import propose_fixes
from shared.nemotron_client import NIMNemotronClient
from shared.schema import Finding

FIXTURE = Path(__file__).parent / "fixtures" / "example_sql_injection_finding.json"
OUTPUT_DIR = Path(__file__).parent / "outputs"


@pytest.mark.integration
@pytest.mark.skipif(
    not os.environ.get("NIM_API_KEY"),
    reason="NIM_API_KEY not set; cannot reach NIM",
)
def test_real_nim_sql_injection_three_proposals():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    finding = Finding.model_validate_json(FIXTURE.read_text())

    proposals = propose_fixes(finding, NIMNemotronClient())

    # Dump for QA BEFORE assertions so the artifact exists even on failure.
    output_path = OUTPUT_DIR / f"real_nim_run_{int(time.time())}.json"
    output_path.write_text(
        json.dumps(
            [p.model_dump(mode="json") for p in proposals],
            indent=2,
        )
    )
    print(f"\n=== proposals dumped to {output_path} ===")

    assert len(proposals) == 3
    assert [p.rank for p in proposals] == [1, 2, 3]
    assert len({p.strategy for p in proposals}) == 3

    # Anti-hallucination: every search_block must be a verbatim substring of
    # the finding's vulnerable_code. The demo signal we'll watch on real files.
    for p in proposals:
        assert p.patches[0].search in finding.vulnerable_code, (
            f"rank {p.rank} ({p.strategy.value}): search_block is not a "
            f"verbatim substring of vulnerable_code\n"
            f"  got:      {p.patches[0].search!r}\n"
            f"  expected substring of: {finding.vulnerable_code!r}"
        )

    print("\n=== real NIM proposals ===")
    for p in proposals:
        print(
            f"\nrank {p.rank}  strategy={p.strategy.value}  "
            f"risk={p.breaking_change_risk.value}"
        )
        print(f"  title:     {p.title}")
        print(f"  rationale: {p.rationale}")
        print(f"  tradeoffs: {p.tradeoffs}")
