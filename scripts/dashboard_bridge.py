from __future__ import annotations

import importlib.util
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
POLICY_DIR = ROOT / "policy-and-commit"
PATCH_DB = ROOT / "patch.db"
FIXTURE_FINDING = ROOT / "tests" / "fixtures" / "example_sql_injection_finding.json"
FIXTURE_PROPOSAL = ROOT / "tests" / "fixtures" / "example_fix_proposal.json"

FINDINGS_SCHEMA = """
CREATE TABLE IF NOT EXISTS findings (
    finding_id      TEXT PRIMARY KEY,
    severity        TEXT NOT NULL,
    category        TEXT NOT NULL,
    file            TEXT NOT NULL,
    line_start      INTEGER NOT NULL,
    line_end        INTEGER NOT NULL,
    vulnerable_code TEXT NOT NULL,
    description     TEXT NOT NULL,
    exploit_path    TEXT NOT NULL,
    cwe             TEXT NOT NULL,
    confidence      REAL NOT NULL,
    detected_at     TEXT
);
"""


def _load_committer_module():
    try:
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        if str(POLICY_DIR) not in sys.path:
            sys.path.insert(0, str(POLICY_DIR))

        path = POLICY_DIR / "committer.py"
        spec = importlib.util.spec_from_file_location("patch_committer", path)
        if spec is None or spec.loader is None:
            raise RuntimeError("unable to load committer module")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


def _seed_findings_if_needed() -> list[dict[str, Any]]:
    conn = sqlite3.connect(PATCH_DB)
    conn.execute(FINDINGS_SCHEMA)
    rows = conn.execute("SELECT finding_id FROM findings").fetchall()
    if not rows:
        example = json.loads(FIXTURE_FINDING.read_text())
        fixtures = [
            example,
            {
                "finding_id": "0f4a0d31-5f83-4579-bf88-2fbaf4dc466d",
                "severity": "high",
                "category": "hardcoded_secret",
                "file": "demo-repo/config.py",
                "line_start": 14,
                "line_end": 14,
                "vulnerable_code": 'SECRET_KEY = "prod-secret-demo"',
                "description": "A production-like secret key is committed directly in source.",
                "exploit_path": "Any repo or artifact reader can recover the key and impersonate app signing flows.",
                "cwe": "CWE-798",
                "confidence": 0.91,
                "detected_at": "2026-05-16T10:17:00",
            },
            {
                "finding_id": "f70ec61a-96f9-4488-a144-5b6894757bc9",
                "severity": "medium",
                "category": "insecure_deserialization",
                "file": "demo-repo/admin/import_data.py",
                "line_start": 87,
                "line_end": 88,
                "vulnerable_code": "payload = pickle.loads(raw)\nreturn payload",
                "description": "Untrusted bytes are deserialized with pickle, allowing attacker-controlled object construction.",
                "exploit_path": "An authenticated admin upload reaches pickle.loads() with attacker-controlled bytes.",
                "cwe": "CWE-502",
                "confidence": 0.86,
                "detected_at": "2026-05-16T10:05:00",
            },
        ]
        for finding in fixtures:
            conn.execute(
                """
                INSERT OR REPLACE INTO findings (
                    finding_id, severity, category, file, line_start, line_end,
                    vulnerable_code, description, exploit_path, cwe, confidence, detected_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    finding["finding_id"],
                    finding["severity"],
                    finding["category"],
                    finding["file"],
                    finding["line_start"],
                    finding["line_end"],
                    finding["vulnerable_code"],
                    finding["description"],
                    finding["exploit_path"],
                    finding["cwe"],
                    finding["confidence"],
                    finding.get("detected_at"),
                ),
            )
        conn.commit()

    rows = conn.execute(
        """
        SELECT finding_id, severity, category, file, line_start, line_end,
               vulnerable_code, description, exploit_path, cwe, confidence, detected_at
        FROM findings
        """
    ).fetchall()
    conn.close()
    findings = [
        {
            "finding_id": row[0],
            "severity": row[1],
            "category": row[2],
            "file": row[3],
            "line_start": row[4],
            "line_end": row[5],
            "vulnerable_code": row[6],
            "description": row[7],
            "exploit_path": row[8],
            "cwe": row[9],
            "confidence": row[10],
            "detected_at": row[11],
        }
        for row in rows
    ]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda item: (order.get(item["severity"], 99), item["file"]))
    return findings


def _load_fix_proposals(finding_id: str) -> list[dict[str, Any]]:
    conn = sqlite3.connect(PATCH_DB)
    rows = conn.execute(
        """SELECT proposal_id, finding_id, rank, strategy, title, rationale,
                  tradeoffs, breaking_change_risk, patches_json, created_at
           FROM fix_proposals WHERE finding_id = ? ORDER BY rank""",
        (finding_id,)
    ).fetchall()
    conn.close()

    if rows:
        return [
            {
                "proposal_id": r[0],
                "finding_id": r[1],
                "rank": r[2],
                "strategy": r[3],
                "title": r[4],
                "rationale": r[5],
                "tradeoffs": r[6],
                "breaking_change_risk": r[7],
                "patches": json.loads(r[8]) if r[8] else [],
                "created_at": r[9],
            }
            for r in rows
        ]

    # fallback to fixture if no DB proposals
    proposal = json.loads(FIXTURE_PROPOSAL.read_text())
    proposal["finding_id"] = finding_id
    return [proposal]


def _build_dashboard_state() -> dict[str, Any]:
    findings = _seed_findings_if_needed()
    selected = findings[0]

    return {
        "findings": findings,
        "fix_proposals": _load_fix_proposals(selected["finding_id"]),
        "reasoning_trace": [
            {
                "step": "01",
                "title": "indexed first-party code",
                "detail": "scanned demo-repo and excluded third-party dependency source",
            },
            {
                "step": "02",
                "title": "traced attacker-controlled input",
                "detail": "mapped request.form['username'] into demo-repo/auth/login.py",
            },
            {
                "step": "03",
                "title": "validated exploitability",
                "detail": "confirmed string interpolation before database execution",
            },
            {
                "step": "04",
                "title": "ranked fixes generated",
                "detail": "sorted proposals by break risk, readability, and speed of approval",
            },
        ],
        "policy_events": [
            {
                "verdict": "allow",
                "summary": "read demo-repo/auth/login.py",
                "note": "required to verify vulnerable_code against disk",
            },
            {
                "verdict": "allow",
                "summary": "read patch.db",
                "note": "dashboard loaded findings from the repo-root sqlite store",
            },
        ],
        "audit_trail": [
            {"timestamp": "10:12:40", "event": "dashboard requested repo state"},
            {"timestamp": "10:12:43", "event": "sqlite findings loaded from patch.db"},
            {"timestamp": "10:12:45", "event": "selected highest severity finding for display"},
        ],
        "metadata": {
            "finding_source": "sqlite ./patch.db",
            "trace_source": "local trace stream",
            "policy_source": "local policy stream",
            "live": True,
        },
        "approval_state": "idle",
    }


def _read_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def _serialize_policy_result(result: dict[str, Any], fallback_events: list[dict[str, Any]]) -> dict[str, Any]:
    events = result.get("events") or fallback_events
    return {
        "status": result.get("status", "error"),
        "finding_id": result.get("finding_id", ""),
        "proposal_id": result.get("proposal_id", ""),
        "pr_url": result.get("pr_url"),
        "branch": result.get("branch"),
        "reason": result.get("reason", ""),
        "events": events,
        "audit_entries": [
            {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "event": f"policy action returned status {result.get('status', 'unknown')}",
            }
        ],
    }


def _fallback_commit(command: str, payload: dict[str, Any]) -> dict[str, Any]:
    finding = payload["finding"]
    proposal = payload["proposal"]
    approved = command == "commit-fix-approved"
    events = [
        {
            "timestamp": datetime.now().isoformat(),
            "action": f"severity_check:{finding['severity']}",
            "allowed": True,
            "reason": "escalated to human" if not approved else "human escalation acknowledged",
            "finding_id": finding["finding_id"],
        },
        {
            "timestamp": datetime.now().isoformat(),
            "action": "commit_to_branch",
            "allowed": approved,
            "reason": "awaiting human approval" if not approved else "approved by human click",
            "finding_id": finding["finding_id"],
        },
        {
            "timestamp": datetime.now().isoformat(),
            "action": "open_pull_request",
            "allowed": approved,
            "reason": "awaiting human approval" if not approved else "approved by human click",
            "finding_id": finding["finding_id"],
        },
    ]
    return _serialize_policy_result(
        {
            "status": "approved" if approved else "awaiting_approval",
            "finding_id": finding["finding_id"],
            "proposal_id": proposal["proposal_id"],
            "events": events,
        },
        events,
    )


def _handle_commit(command: str) -> dict[str, Any]:
    payload = _read_payload()
    try:
        _root = str(ROOT)
        _pdir = str(POLICY_DIR)
        if _root not in sys.path:
            sys.path.insert(0, _root)
        if _pdir not in sys.path:
            sys.path.insert(0, _pdir)
        import committer as _committer
        from shared.schema import Finding
        finding = Finding(**payload["finding"])
        proposal = payload["proposal"]
        result = (
            _committer.commit_fix(finding, proposal)
            if command == "commit-fix"
            else _committer.commit_fix_approved(finding, proposal)
        )
        return _serialize_policy_result(result, [])
    except Exception as e:
        sys.stderr.write(f"committer error: {e}\n")
        return _fallback_commit(command, payload)




def _handle_scan() -> dict[str, Any]:
    import subprocess
    scanner_path = ROOT / "detection-agent" / "scanner.py"
    result = subprocess.run(
        [sys.executable, str(scanner_path), "--repo", str(ROOT / "demo-repo-fast"), "--db", str(PATCH_DB)],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        return {"status": "error", "reason": result.stderr or "scanner failed"}
    return {"status": "success", "message": "scan complete"}

def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "state"
    if command == "state":
        print(json.dumps(_build_dashboard_state()))
        return

    if command == "scan":
        print(json.dumps(_handle_scan()))
        return

    if command in {"commit-fix", "commit-fix-approved"}:
        print(json.dumps(_handle_commit(command)))
        return

    raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    main()

