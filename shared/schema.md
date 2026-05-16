# Finding — the contract between detection-agent and fix-proposer

The detection agent emits `Finding` objects. The fix proposer consumes them. This document is the human-readable spec; `schema.py` is the executable contract. **If you change one, change the other in the same PR and ping the group chat.**

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `finding_id` | UUID | yes | Stable identifier for this finding (see open questions). |
| `severity` | enum | yes | `critical` \| `high` \| `medium` \| `low` |
| `category` | enum | yes | See category list below. Use `other` only if nothing fits. |
| `file` | string | yes | Repo-relative POSIX path. **No leading slash.** |
| `line_start` | int | yes | 1-indexed first line of the vulnerable region. |
| `line_end` | int | yes | 1-indexed last line. Must be `>= line_start`. |
| `vulnerable_code` | string | yes | **EXACT verbatim source lines** from the file, character-for-character. This is the anti-hallucination guard — if the string does not appear in the file, the finding is rejected. |
| `description` | string | yes | One to three sentences explaining what's wrong. |
| `exploit_path` | string | yes | How an attacker reaches and triggers this code. |
| `cwe` | string | yes | `CWE-XX` format (e.g. `CWE-89`). |
| `confidence` | float | no | 0.0–1.0. Default `0.8`. |
| `detected_at` | string | no | ISO 8601 timestamp. |

## Severity rubric

- **critical** — RCE, auth bypass, secret leak, SQLi in auth/admin path
- **high** — SQLi on user data, stored XSS, SSRF to internal, insecure deserialization with attacker input, hardcoded prod secret
- **medium** — reflected XSS, path traversal read-only, weak crypto (MD5 for passwords, ECB), command injection requiring authed admin
- **low** — info disclosure, missing security headers, best-practice violations

## Categories (closed set)

```
sql_injection
nosql_injection
command_injection
xss_reflected
xss_stored
xss_dom
ssrf
path_traversal
insecure_deserialization
hardcoded_secret
weak_crypto
broken_auth
broken_access_control
open_redirect
xxe
insecure_random
missing_rate_limit
race_condition
information_disclosure
other
```

Use `other` only when nothing above fits. If you find yourself reaching for `other` more than once, that's a signal to add a category — flag it in chat.

## Anti-hallucination guard

`vulnerable_code` must match the file's bytes exactly between `line_start` and `line_end`. The fix proposer (and the policy layer) will call `verify_against_file()` before acting on a finding. A finding that fails verification is dropped on the floor, not surfaced to the user.

This catches the most common LLM failure: confidently citing line numbers and code that don't exist. If the detection agent paraphrases, the guard fails. Verbatim or nothing.

## Example finding

```json
{
  "finding_id": "f3a9c1b2-7d4e-4a2f-9c81-1e6b5a4d3c20",
  "severity": "critical",
  "category": "sql_injection",
  "file": "demo-repo/auth/login.py",
  "line_start": 42,
  "line_end": 44,
  "vulnerable_code": "    query = f\"SELECT id, password_hash FROM users WHERE email = '{email}'\"\n    row = db.execute(query).fetchone()\n    if not row:",
  "description": "User-supplied email is interpolated directly into a SQL string with no parameterization. An attacker can bypass authentication or exfiltrate the users table.",
  "exploit_path": "POST /api/login with body {\"email\": \"' OR '1'='1' --\", \"password\": \"anything\"} returns the first row from the users table, granting login as that user.",
  "cwe": "CWE-89",
  "confidence": 0.95,
  "detected_at": "2026-05-15T22:30:00Z"
}
```

## Open questions (resolve by hour 4–6)

1. **`finding_id` stability across re-scans.** Should the ID be deterministic (hash of `file` + `line_start` + `vulnerable_code`) so re-running the scanner doesn't produce duplicate "new" findings, or random UUID per scan with a separate dedupe step? Stable IDs make the dashboard cleaner; random IDs are simpler to emit. Decision blocks the dashboard's "previously seen / new" UI.
2. **Multi-location vulnerabilities.** If the same bug pattern appears in five files (e.g. five places concatenating user input into SQL), do we emit one `Finding` with N locations, or N `Finding` objects sharing a `category`? Affects how the fix proposer batches its three ranked options — one logical fix that touches five files, or five independent fix tracks.

---

## FixProposal — the contract between fix-proposer and policy-and-commit

The fix proposer emits exactly **three** `FixProposal` objects per `Finding`. Each represents a distinct remediation strategy. The dashboard shows all three; the user picks one; the policy layer applies it. Locked design rationale lives in `fix-proposer/SCHEMA_NOTES.md`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `proposal_id` | UUID | yes | Stable identifier for this proposal. |
| `finding_id` | UUID | yes | The `Finding` this proposal addresses. |
| `strategy` | enum | yes | A value from the flat `FixStrategy` enum. See strategy slots below. |
| `rank` | int | yes | `1`, `2`, or `3`. Each Finding gets exactly three proposals; uniqueness is enforced at the DB layer as `UNIQUE(finding_id, rank)`. |
| `title` | string | yes | Short, dashboard-visible label (one line). |
| `rationale` | string | yes | One to three sentences on why this strategy. |
| `tradeoffs` | string | yes | What the user gives up by picking this fix. |
| `breaking_change_risk` | enum | yes | `low` \| `medium` \| `high`. See rubric. |
| `patches` | list | yes | One or more `SearchReplacePatch` objects. Multi-file fixes are allowed. |
| `created_at` | string | no | ISO 8601 timestamp. |

### SearchReplacePatch fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | yes | Repo-relative POSIX path. **No leading slash.** |
| `search` | string | yes | **EXACT verbatim bytes** to locate in the file. Empty string is the file-creation marker — see "File creation" below. |
| `replace` | string | yes | New bytes to substitute. May be empty (delete the matched region). |

### Breaking change rubric

- **low** — purely internal change. Same call signatures, same behavior on valid inputs.
- **medium** — changes a call signature, error type, or behavior on edge cases. Callers in the same repo may need light updates.
- **high** — schema migration, API contract change, dependency bump, or change visible to external consumers.

### Strategy slots (closed set)

`FixStrategy` is a single flat enum across all categories. Each `Finding.category` maps to exactly three slots; the fix proposer fills one strategy per slot, per finding.

| Category | Slot 1 | Slot 2 | Slot 3 |
|---|---|---|---|
| `sql_injection` | `parameterize_query` | `input_allowlist` | `prepared_statement` |
| `xss_reflected` | `output_escape` | `csp_header` | `input_sanitize` |
| `command_injection` | `subprocess_array_args` | `shell_escape` | `command_whitelist` |
| `hardcoded_secret` | `env_var` | `secrets_manager` | `scrub_and_rotate` |
| `weak_crypto` | `upgrade_algorithm` | `use_kdf` | *(TBD)* |
| `path_traversal` | `path_canonicalize` | `path_allowlist` | *(TBD)* |

`other` is the escape hatch — mirrors `Category.other`. Use only when no slot fits; flag in chat if you reach for it.

### Anti-hallucination guard

Every `SearchReplacePatch.search` must match the target file's bytes exactly. The policy layer (and fix-proposer itself, before persisting) calls a `verify_patch_against_file()` helper that returns false unless `search` is found verbatim. Proposals that fail verification are dropped, not surfaced. This mirrors the `Finding.vulnerable_code` guard — verbatim or nothing.

### File creation

A patch with empty `search` and non-empty `replace` means *create this file with these contents*. Both fields empty is rejected by the model validator.

### Example proposal

For the SQL injection example finding above, the rank-1 (`parameterize_query`) proposal looks like:

```json
{
  "proposal_id": "8b2e7d10-3f56-4c11-b9a2-0c4e9d7a1f30",
  "finding_id": "f3a9c1b2-7d4e-4a2f-9c81-1e6b5a4d3c20",
  "strategy": "parameterize_query",
  "rank": 1,
  "title": "Use a parameterized query for the users lookup",
  "rationale": "Bind the email value as a SQL parameter so the database driver handles escaping. This is the canonical fix for SQLi and works without changing the schema or surrounding control flow.",
  "tradeoffs": "Slightly more verbose than the f-string, but every supported driver accepts placeholders. Does not address other SQLi sites elsewhere in the codebase — those need their own findings.",
  "breaking_change_risk": "low",
  "patches": [
    {
      "file": "demo-repo/auth/login.py",
      "search": "    query = f\"SELECT id, password_hash FROM users WHERE email = '{email}'\"\n    row = db.execute(query).fetchone()\n    if not row:",
      "replace": "    query = \"SELECT id, password_hash FROM users WHERE email = ?\"\n    row = db.execute(query, (email,)).fetchone()\n    if not row:"
    }
  ],
  "created_at": "2026-05-15T22:35:00Z"
}
```

### Open questions (resolve as we integrate)

1. **Re-verification after sibling patches.** If proposal A and proposal B both touch `auth/login.py` but the user picks A, B's `search` blocks may no longer match. Do we re-verify B at apply-time, or invalidate all sibling proposals once one is applied? Affects whether stale proposals linger in the DB.
2. **Multi-file patch atomicity.** If a `FixProposal.patches` list has three entries and the second fails verification at apply-time, do we roll back the first, or commit a partial fix? Coordinate with policy-and-commit before locking.
