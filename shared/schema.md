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
