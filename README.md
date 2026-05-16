# Patch

Patch is an autonomous security agent that scans a codebase for vulnerabilities, classifies them, proposes ranked fix options, and commits approved fixes with human review. Every action is governed by a NemoClaw YAML policy, and the dashboard surfaces the agent's reasoning, live policy events, and a full audit trail.

## Differentiation (locked design decisions)

1. Scan first-party code ONLY. Not third-party dependency source.
2. Single-agent loop with three ranked fix options. NOT a hunter/verifier two-agent architecture.
3. NemoClaw policy is the centerpiece — visible YAML, live events, blocked actions on screen.
4. Demo on a pre-built fake-startup repo with seeded vulns. NOT a real OSS library.

## Data flow

`detection-agent` emits `Finding`s → `fix-proposer` reads `Finding`s and writes `FixProposal`s → `policy-and-commit` gates `FixProposal`s via NemoClaw policy → `dashboard` reads everything from the SQLite store in [`shared/db.py`](shared/db.py).

## Folder map

```
/detection-agent/      Lam     — scans first-party code, emits Findings
/fix-proposer/         Law     — consumes Findings, proposes three ranked fixes
/dashboard/            BK      — reasoning trace, policy events, audit trail UI
/policy-and-commit/    Zablon  — NemoClaw policy engine + git commit pipeline
/shared/               schema, db, prompts, common types (the contract)
/demo-repo/            fake startup with seeded vulns (Phase 1)
```

## Before you start

- Read [`shared/schema.md`](shared/schema.md) first. It defines the `Finding` contract that all four components depend on — anything you build downstream is anchored to it.
- Read your own component's README (e.g. [`detection-agent/README.md`](detection-agent/README.md)) for component-specific setup and ownership.
- `cp .env.example .env` only works if `.env.example` is in the repo. It is — fill in `NIM_ENDPOINT` and `NIM_API_KEY` after Brev is up. If for some reason it's missing, create one with empty `NIM_ENDPOINT=` and `NIM_API_KEY=` keys before copying.

## Stack

- Python 3.11+
- Pydantic (schema contract)
- SQLite (findings store)
- Nemotron-super-120b (deep reasoning) and Nemotron-nano-30b (fast triage) via NIM on Brev

## Getting started

```bash
cp .env.example .env
pip install -r requirements.txt
```

Fill in `NIM_ENDPOINT` and `NIM_API_KEY` in `.env` once Brev is provisioned.

## Branching

`main` is the trunk. Work happens on `feature/<name>/<thing>` branches and lands via PR. No release process — this is a hackathon.

## Conventions

- **Virtualenv required** before installing:
  ```bash
  python3.11 -m venv .venv
  source .venv/bin/activate
  ```
- **Pin new dependencies** in `requirements.txt`. Use `pip freeze | grep <package>` to get the exact version after installing.
- **PRs need one approval** before merging into `main`.
- **Squash-merge PRs** to keep `main` history clean.
- **Commit messages: short and imperative** — `add finding schema`, not `added finding schema`.
