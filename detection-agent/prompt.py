"""Detection prompt builder.

ONE prompt to ONE model — precision comes from the verbatim guard
downstream (verify_against_source), not a second model. The prompt
must (a) describe the closed Finding schema, (b) enumerate the closed
Category set, (c) lock the severity rubric, and (d) make verbatim
quoting + the safe-pattern list non-negotiable.
"""
from __future__ import annotations

import json
from pathlib import Path

# Resolve fixture relative to this file so the prompt is reproducible
# regardless of cwd.
_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "tests" / "fixtures" / "example_sql_injection_finding.json"
)

SYSTEM_PROMPT = (
    "You are a senior application security engineer auditing first-party "
    "code for vulnerabilities. You output ONLY a JSON object with a single "
    "key 'findings' containing a JSON array. No prose, no markdown fences, "
    "no explanation."
)

SEVERITY_RUBRIC = """\
Severity rubric (use exactly these strings):
- critical: RCE, auth bypass, secret leak, SQLi in auth/admin path
- high: SQLi on user data, stored XSS, SSRF to internal, insecure deserialization with attacker input, hardcoded prod secret
- medium: reflected XSS, path traversal read-only, weak crypto (MD5 for passwords, ECB), command injection requiring authed admin
- low: info disclosure, missing security headers, best-practice violations"""

# Mirrors shared.schema.Category exactly. Kept inline (not imported) so
# changes to the prompt are reviewable as a single artifact.
CATEGORY_LIST = """\
Closed category set (use exactly one of these strings; do not invent new categories):
- sql_injection
- nosql_injection
- command_injection
- xss_reflected
- xss_stored
- xss_dom
- ssrf
- path_traversal
- insecure_deserialization
- hardcoded_secret
- weak_crypto
- broken_auth
- broken_access_control
- open_redirect
- xxe
- insecure_random
- missing_rate_limit
- race_condition
- information_disclosure
- other"""

HARD_RULES = """\
Hard rules:
- Quote vulnerable_code character-for-character from the input. Do not paraphrase, retype, add, or remove whitespace. If you cannot copy real lines exactly, do not emit the finding.
- If the file has no vulnerabilities, return {"findings": []}.
- Do NOT flag code that is correctly using parameterized queries (cursor.execute(sql, params) with sql as a constant), shell=False with arg lists, allowlisted inputs, or other safe patterns — even if they superficially resemble dangerous ones.
- Use only the closed category set. Use "other" if nothing fits. Do not invent category strings.
- cwe must be a string in the format "CWE-NNN" (e.g. "CWE-89" for SQL injection). Use "CWE-0" if genuinely unknown."""


# File-specific values in the shared fixture are literal ground truth
# for Vuln 01 (demo-repo/auth/login.py:42-44). Sending them verbatim as
# the "schema example" leaked the answer for that file and — by
# template-overlap aversion — caused the model to emit `{"":""}`
# placeholders on every other vuln file too. We keep the schema shape
# but swap the answer-key fields for synthetic placeholders that don't
# match anything in demo-repo.
_SYNTHETIC_OVERRIDES = {
    "file": "example-app/billing/charges.py",
    "line_start": 17,
    "line_end": 19,
    "vulnerable_code": (
        '    sql = f"SELECT * FROM orders WHERE user_id = {user_id}"\n'
        "    rows = db.execute(sql).fetchall()\n"
        "    return rows"
    ),
    "finding_id": "00000000-0000-0000-0000-000000000000",
    "detected_at": "1970-01-01T00:00:00Z",
    # description and exploit_path in the source fixture name email /
    # /api/login / users table — the literal answer-key prose for
    # Vuln 01 in demo-repo/auth/login.py. Rewrite them to match the
    # synthetic billing/charges example so the model can't pattern-
    # match the example onto any real file under scan.
    "description": (
        "User-supplied user_id is interpolated directly into a SQL "
        "string with no parameterization. An attacker can read or "
        "modify arbitrary rows in the orders table."
    ),
    "exploit_path": (
        "GET /api/orders?user_id=1+OR+1=1 returns all orders for all "
        "users instead of just the authenticated user's, exposing "
        "order history across the customer base."
    ),
}


def _load_example_finding() -> str:
    raw = json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))
    for key, value in _SYNTHETIC_OVERRIDES.items():
        raw[key] = value
    return json.dumps(raw, indent=2)


def _number_lines(text: str) -> str:
    # Separator is U+2502 (box-drawing vertical bar) flanked by spaces.
    # A colon-space separator leaked into the model's vulnerable_code
    # (the model treated the trailing space as part of the line's
    # indentation, breaking the verbatim guard by one space). The
    # vertical bar is visually unambiguous as a column boundary.
    lines = text.splitlines()
    width = 4
    return "\n".join(f"{i:>{width}} │ {line}" for i, line in enumerate(lines, start=1))


def build_prompt(file_path: str, file_text: str) -> tuple[str, str]:
    """Return (system, user) for NIMNemotronClient.generate_json."""
    example_json = _load_example_finding()
    numbered = _number_lines(file_text)

    user = (
        "Output schema (one element of the findings array):\n"
        f"{example_json}\n\n"
        f"{SEVERITY_RUBRIC}\n\n"
        f"{CATEGORY_LIST}\n\n"
        f"{HARD_RULES}\n\n"
        f"File: {file_path}\n"
        "```\n"
        f"{numbered}\n"
        "```\n"
    )
    return SYSTEM_PROMPT, user
