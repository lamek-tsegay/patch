"""Mock-pipeline test for propose_fixes() on a SQL injection Finding."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from proposer import propose_fixes
from shared.nemotron_client import MockNemotronClient
from shared.schema import Finding, FixStrategy

FIXTURE = Path(__file__).parent / "fixtures" / "example_sql_injection_finding.json"

_VULN = (
    "    query = f\"SELECT id, password_hash FROM users WHERE email = '{email}'\"\n"
    "    row = db.execute(query).fetchone()\n"
    "    if not row:"
)


def _load_finding() -> Finding:
    return Finding.model_validate_json(FIXTURE.read_text())


def _mock_client_for_sqli() -> MockNemotronClient:
    # Keyed by FixStrategy.value substring in the user prompt — propose_fixes
    # always includes "Strategy: <value>" in the prompt, making this stable.
    return MockNemotronClient(
        responses={
            "parameterize_query": {
                "title": "Use a parameterized query for the users lookup",
                "rationale": "Bind the email value as a SQL parameter so the driver handles escaping.",
                "tradeoffs": "Slightly more verbose than the f-string; does not cover other SQLi sites elsewhere.",
                "breaking_change_risk": "low",
                "search_block": _VULN,
                "replace_block": (
                    "    query = \"SELECT id, password_hash FROM users WHERE email = ?\"\n"
                    "    row = db.execute(query, (email,)).fetchone()\n"
                    "    if not row:"
                ),
            },
            "input_allowlist": {
                "title": "Validate email against an allowlist before the SQL call",
                "rationale": "Reject any email that does not match a strict regex before reaching the SQL layer.",
                "tradeoffs": "Defense in depth; still leaves the unsafe SQL in place if the allowlist is bypassed.",
                "breaking_change_risk": "low",
                "search_block": _VULN,
                "replace_block": (
                    "    if not re.fullmatch(r\"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\", email or \"\"):\n"
                    "        return error_response(\"invalid email\", 400)\n"
                    "    query = f\"SELECT id, password_hash FROM users WHERE email = '{email}'\"\n"
                    "    row = db.execute(query).fetchone()\n"
                    "    if not row:"
                ),
            },
            "orm_migration": {
                "title": "Replace raw SQL with a SQLAlchemy User lookup",
                "rationale": "Use the User model so the driver emits parameterized SQL automatically.",
                "tradeoffs": "Requires a User model and an active session; larger blast radius than a one-line fix.",
                "breaking_change_risk": "medium",
                "search_block": _VULN,
                "replace_block": (
                    "    user = session.query(User).filter(User.email == email).one_or_none()\n"
                    "    if not user:"
                ),
            },
        }
    )


def test_propose_fixes_sql_injection_produces_three_ranked_proposals(monkeypatch):
    monkeypatch.setenv("NIM_MODEL_SUPER", "mock-nemotron-super")
    finding = _load_finding()

    proposals = propose_fixes(finding, _mock_client_for_sqli())

    assert len(proposals) == 3
    assert [p.rank for p in proposals] == [1, 2, 3]

    strategies = {p.strategy for p in proposals}
    assert len(strategies) == 3
    assert strategies == {
        FixStrategy.PARAMETERIZE_QUERY,
        FixStrategy.INPUT_ALLOWLIST,
        FixStrategy.ORM_MIGRATION,
    }

    assert all(p.finding_id == finding.finding_id for p in proposals)

    # Anti-hallucination invariant: at least one proposal's search_block must
    # match Finding.vulnerable_code verbatim. Once we swap in real Nemotron,
    # this is the signal of whether the LLM produces verbatim search blocks.
    assert any(
        p.patches[0].search == finding.vulnerable_code for p in proposals
    ), "no proposal's search_block matched Finding.vulnerable_code verbatim"


def test_propose_fixes_unsupported_category_raises():
    data = json.loads(FIXTURE.read_text())
    data["category"] = "xss_reflected"
    other_finding = Finding.model_validate(data)

    with pytest.raises(NotImplementedError):
        propose_fixes(other_finding, _mock_client_for_sqli())
