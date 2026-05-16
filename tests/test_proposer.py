"""Mock-pipeline test for propose_fixes() on a SQL injection Finding."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest

from proposer import propose_fixes
from shared.db import init_db, list_proposals_for_finding
from shared.nemotron_client import MockNemotronClient
from shared.schema import Category, Finding, FixStrategy, Severity

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
            "prepared_statement": {
                "title": "Use the DB driver's prepared-statement API",
                "rationale": "Pre-compile the SQL once with db.prepare() and bind the email value at execute time.",
                "tradeoffs": "Requires that the db object exposes .prepare(); the slot falls back to parameterize_query semantics if not.",
                "breaking_change_risk": "low",
                "search_block": _VULN,
                "replace_block": (
                    "    stmt = db.prepare(\"SELECT id, password_hash FROM users WHERE email = ?\")\n"
                    "    row = stmt.execute((email,)).fetchone()\n"
                    "    if not row:"
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
        FixStrategy.PREPARED_STATEMENT,
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


def test_propose_fixes_writes_to_db_when_conn_provided(monkeypatch):
    monkeypatch.setenv("NIM_MODEL_SUPER", "mock-nemotron-super")
    finding = _load_finding()
    conn = init_db(":memory:")

    proposals = propose_fixes(finding, _mock_client_for_sqli(), db_conn=conn)

    assert len(proposals) == 3
    stored = list_proposals_for_finding(conn, finding.finding_id)
    assert [p.rank for p in stored] == [1, 2, 3]
    assert {p.strategy for p in stored} == {
        FixStrategy.PARAMETERIZE_QUERY,
        FixStrategy.INPUT_ALLOWLIST,
        FixStrategy.PREPARED_STATEMENT,
    }
    assert all(p.finding_id == finding.finding_id for p in stored)


_VULN_CRYPTO = "    hash = hashlib.md5(password.encode()).hexdigest()"


def _weak_crypto_finding() -> Finding:
    return Finding(
        finding_id=uuid4(),
        severity=Severity.HIGH,
        category=Category.WEAK_CRYPTO,
        file="demo-repo/auth/login.py",
        line_start=53,
        line_end=53,
        vulnerable_code=_VULN_CRYPTO,
        description="Password is hashed with MD5, which is cryptographically broken for password storage and trivially reversible via precomputed tables.",
        exploit_path="An attacker who obtains the password store can recover plaintext passwords via rainbow tables or fast brute force on commodity GPUs.",
        cwe="CWE-327",
        confidence=0.92,
    )


def _mock_client_for_weak_crypto() -> MockNemotronClient:
    # Keyed by the full "Strategy: <value>" prompt fragment so the OTHER
    # slot's marker doesn't collide with stray "other" occurrences elsewhere.
    return MockNemotronClient(
        responses={
            "Strategy: upgrade_algorithm": {
                "title": "Replace MD5 with bcrypt for password hashing",
                "rationale": "MD5 is cryptographically broken for password storage; bcrypt provides per-row salting and adaptive cost.",
                "tradeoffs": "Introduces bcrypt as a new dependency. Existing MD5 hashes cannot be verified — needs a migration step.",
                "breaking_change_risk": "medium",
                "search_block": _VULN_CRYPTO,
                "replace_block": (
                    "    import bcrypt\n"
                    "    hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())"
                ),
            },
            "Strategy: use_kdf": {
                "title": "Switch to PBKDF2 with a per-record salt",
                "rationale": "PBKDF2-HMAC-SHA256 with 600000 iterations is FIPS-approved and ships in the stdlib.",
                "tradeoffs": "Stored value must now include the salt alongside the derived key — schema migration required.",
                "breaking_change_risk": "high",
                "search_block": _VULN_CRYPTO,
                "replace_block": (
                    "    salt = secrets.token_bytes(16)\n"
                    "    hash = hashlib.pbkdf2_hmac(\"sha256\", password.encode(), salt, 600000)"
                ),
            },
            "Strategy: other": {
                "title": "Delegate password handling to passlib's CryptContext",
                "rationale": "passlib selects the algorithm, formats the stored hash, and handles verification consistently.",
                "tradeoffs": "Introduces passlib as a dependency. Most idiomatic option for production Flask apps.",
                "breaking_change_risk": "medium",
                "search_block": _VULN_CRYPTO,
                "replace_block": (
                    "    from passlib.context import CryptContext\n"
                    "    pwd_ctx = CryptContext(schemes=[\"bcrypt\"])\n"
                    "    hash = pwd_ctx.hash(password)"
                ),
            },
        }
    )


def test_propose_fixes_weak_crypto(monkeypatch):
    monkeypatch.setenv("NIM_MODEL_SUPER", "mock-nemotron-super")
    finding = _weak_crypto_finding()

    proposals = propose_fixes(finding, _mock_client_for_weak_crypto())

    assert len(proposals) == 3
    assert [p.rank for p in proposals] == [1, 2, 3]

    strategies = {p.strategy for p in proposals}
    assert len(strategies) == 3
    assert strategies == {
        FixStrategy.UPGRADE_ALGORITHM,
        FixStrategy.USE_KDF,
        FixStrategy.OTHER,
    }

    assert all(p.finding_id == finding.finding_id for p in proposals)


_VULN_CMDI = (
    "    result = subprocess.run(\n"
    "        f\"ping -c 2 {hostname}\",\n"
    "        shell=True,\n"
    "        capture_output=True,\n"
    "        text=True,\n"
    "        timeout=10,\n"
    "    )"
)


def _command_injection_finding() -> Finding:
    return Finding(
        finding_id=uuid4(),
        severity=Severity.CRITICAL,
        category=Category.COMMAND_INJECTION,
        file="demo-repo/admin/diagnostics.py",
        line_start=28,
        line_end=34,
        vulnerable_code=_VULN_CMDI,
        description="User-supplied hostname is interpolated into a shell command run with shell=True, allowing arbitrary command chaining via ';', '&&', or backticks.",
        exploit_path="POST /admin/diagnostics/ping with {\"hostname\": \"; rm -rf /\"} runs the appended command in the shell as the application user.",
        cwe="CWE-78",
        confidence=0.94,
    )


def _mock_client_for_command_injection() -> MockNemotronClient:
    return MockNemotronClient(
        responses={
            "Strategy: subprocess_array_args": {
                "title": "Pass the command as a list and disable shell",
                "rationale": "Array-args form bypasses shell interpretation entirely, so metacharacters in hostname can't escape into a new command.",
                "tradeoffs": "Requires splitting the command into tokens. Equivalent behavior on normal inputs; no shell features (pipes, redirects) — flag if the call site relied on them.",
                "breaking_change_risk": "low",
                "search_block": _VULN_CMDI,
                "replace_block": (
                    "    result = subprocess.run(\n"
                    "        [\"ping\", \"-c\", \"2\", hostname],\n"
                    "        shell=False,\n"
                    "        capture_output=True,\n"
                    "        text=True,\n"
                    "        timeout=10,\n"
                    "    )"
                ),
            },
            "Strategy: shell_escape": {
                "title": "Quote the hostname via shlex.quote before interpolation",
                "rationale": "shlex.quote wraps the value safely for shell syntax, so injected metacharacters become literal.",
                "tradeoffs": "Adds shlex import. Keeps shell=True so any future kwargs that depend on shell behavior keep working; correctness depends on shlex.quote handling the platform's shell.",
                "breaking_change_risk": "low",
                "search_block": _VULN_CMDI,
                "replace_block": (
                    "    import shlex\n"
                    "    result = subprocess.run(\n"
                    "        f\"ping -c 2 {shlex.quote(hostname)}\",\n"
                    "        shell=True,\n"
                    "        capture_output=True,\n"
                    "        text=True,\n"
                    "        timeout=10,\n"
                    "    )"
                ),
            },
            "Strategy: command_whitelist": {
                "title": "Validate hostname against a strict pattern before subprocess",
                "rationale": "An allowlist regex matching only RFC-1123 hostname characters rejects shell metacharacters before they ever reach the command.",
                "tradeoffs": "Restricts hostnames to the regex grammar. Legitimate inputs outside the pattern (IDN, exotic formats) will be rejected.",
                "breaking_change_risk": "medium",
                "search_block": _VULN_CMDI,
                "replace_block": (
                    "    if not re.fullmatch(r\"[a-zA-Z0-9.-]{1,253}\", hostname):\n"
                    "        raise ValueError(\"hostname must match [a-zA-Z0-9.-]{1,253}\")\n"
                    "    result = subprocess.run(\n"
                    "        f\"ping -c 2 {hostname}\",\n"
                    "        shell=True,\n"
                    "        capture_output=True,\n"
                    "        text=True,\n"
                    "        timeout=10,\n"
                    "    )"
                ),
            },
        }
    )


def test_propose_fixes_command_injection(monkeypatch):
    monkeypatch.setenv("NIM_MODEL_SUPER", "mock-nemotron-super")
    finding = _command_injection_finding()

    proposals = propose_fixes(finding, _mock_client_for_command_injection())

    assert len(proposals) == 3
    assert [p.rank for p in proposals] == [1, 2, 3]

    strategies = {p.strategy for p in proposals}
    assert len(strategies) == 3
    assert strategies == {
        FixStrategy.SUBPROCESS_ARRAY_ARGS,
        FixStrategy.SHELL_ESCAPE,
        FixStrategy.COMMAND_WHITELIST,
    }

    assert all(p.finding_id == finding.finding_id for p in proposals)
