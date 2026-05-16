# detection-agent

Owner: **Lam**

Scans first-party code in the target repo and emits `Finding` objects
describing vulnerabilities it has identified. Single-agent loop, no
hunter/verifier split. See
[/shared/schema.md](../shared/schema.md) for the Finding contract —
import from `shared.schema`, do not redefine it.

## Run

From the patch repo root, with `.venv` activated and `.env` populated
(`NIM_ENDPOINT`, `NIM_API_KEY`, `NIM_MODEL_SUPER`):

```bash
python detection-agent/scanner.py --repo ./demo-repo --db ./patch.db
python detection-agent/eval.py    --repo ./demo-repo --db ./patch.db
```

Optional flags on `scanner.py`:

- `--model <id>` — override `NIM_MODEL_SUPER`
- `--limit N`   — stop after N files (useful while iterating)

> The directory is hyphenated (`detection-agent/`), matching
> `fix-proposer/` and `policy-and-commit/`. That means `python -m
> detection_agent.scanner` is not valid — invoke `scanner.py` directly.
> The scripts prepend `detection-agent/` and the repo root to
> `sys.path` at startup so sibling modules and `shared.*` import
> cleanly.

## Files

- `walker.py` — first-party walker. **Skips** any path whose components
  include `vendor`, `node_modules`, `.venv`, `venv`, `site-packages`,
  `__pycache__`, `.git`, `dist`, `build`, `.pytest_cache`,
  `.mypy_cache` (checked on every `Path.parts` element, not just the
  top level). Also skips `*.min.js`, `*-lock.json`, `*.lock`, `*.pyc`,
  `*.so`, `*.dylib`, files > 200 KB, and binary files (first 4096
  bytes fail UTF-8 decode).
- `prompt.py` — builds the (system, user) pair. The user message
  contains the schema example, the severity rubric, the closed
  category list, the hard rules, the file path, and the file with
  line numbers.
- `client_factory.py` — `make_client()` loads `.env` and returns a
  `NIMNemotronClient`.
- `pipeline.py` — `scan_file(...)` runs one prompt, parses
  `{"findings": [...]}`, validates each via Pydantic, applies the
  verbatim guard via `shared.schema.verify_against_source`, returns
  survivors plus a counts dict.
- `scanner.py` — CLI entry point. Walks the repo, calls `scan_file`
  per file, persists with `shared.db.insert_finding`, prints a rich
  summary table.
- `answer_key_parser.py` — parses `demo-repo/.answer-key.md`.
- `eval.py` — compares persisted findings against the answer key and
  prints recall / precision / missed vulns / per-category breakdown.

## Differentiator

Three locked properties that make Patch different from a generic LLM
scanner:

1. **First-party code only.** The walker skips vendored / build /
   cache directories on every path component, so vendored
   vuln-shaped patterns never reach the model.
2. **Single agent, single call.** One prompt to one model per file —
   no verifier agent. Precision comes from the verbatim guard, not a
   second model.
3. **Anti-hallucination guard.** Every `Finding.vulnerable_code`
   must appear character-for-character in the source file. Findings
   that fail the guard are dropped before persistence.

## Eval interpretation

`eval.py` checks three things in order:

1. **Differentiator failure.** Any persisted finding whose path
   contains a `vendor` component is a hard fail (exit 2).
2. **Recall ≥ 11/13.** A finding matches an answer-key entry when
   the file matches, the line ranges overlap (no gap), and the
   category matches.
3. **Zero false positives on `demo-repo/safe/*`.** The decoys are
   parameterized SQL and allowlisted subprocess. Flagging them is a
   precision failure.

Exit codes: `0` = pass, `1` = recall or FP failure, `2` = vendor
leak or eval logic bug (recall > total).
