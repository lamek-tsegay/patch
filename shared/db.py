"""SQLite store for Findings and FixProposals. No ORM."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import UUID

from .schema import (
    BreakingChangeRisk,
    Category,
    Finding,
    FixProposal,
    FixStrategy,
    SearchReplacePatch,
    Severity,
)

_SCHEMA = """
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

# Foreign key is declared on finding_id but PRAGMA foreign_keys=ON is
# intentionally NOT enabled in init_db — it would interact with
# clear_findings() in surprising ways (cascading deletes vs. preserved
# proposals).
# TODO: enable PRAGMA foreign_keys=ON once clear_findings cascades or we
# add coordinated clear_proposals calls everywhere.
_SCHEMA_PROPOSALS = """
CREATE TABLE IF NOT EXISTS fix_proposals (
    proposal_id          TEXT PRIMARY KEY,
    finding_id           TEXT NOT NULL,
    rank                 INTEGER NOT NULL CHECK (rank IN (1, 2, 3)),
    strategy             TEXT NOT NULL,
    title                TEXT NOT NULL,
    rationale            TEXT NOT NULL,
    tradeoffs            TEXT NOT NULL,
    breaking_change_risk TEXT NOT NULL,
    patches_json         TEXT NOT NULL,
    created_at           TEXT,
    UNIQUE(finding_id, rank),
    FOREIGN KEY (finding_id) REFERENCES findings(finding_id)
);
"""


def init_db(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute(_SCHEMA)
    conn.execute(_SCHEMA_PROPOSALS)
    conn.commit()
    return conn


def insert_finding(conn: sqlite3.Connection, finding: Finding) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO findings (
            finding_id, severity, category, file, line_start, line_end,
            vulnerable_code, description, exploit_path, cwe, confidence, detected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(finding.finding_id),
            finding.severity.value,
            finding.category.value,
            finding.file,
            finding.line_start,
            finding.line_end,
            finding.vulnerable_code,
            finding.description,
            finding.exploit_path,
            finding.cwe,
            finding.confidence,
            finding.detected_at.isoformat() if finding.detected_at else None,
        ),
    )
    conn.commit()


def list_findings(conn: sqlite3.Connection) -> list[Finding]:
    rows = conn.execute(
        """
        SELECT finding_id, severity, category, file, line_start, line_end,
               vulnerable_code, description, exploit_path, cwe, confidence, detected_at
        FROM findings
        """
    ).fetchall()
    return [
        Finding(
            finding_id=UUID(r[0]),
            severity=Severity(r[1]),
            category=Category(r[2]),
            file=r[3],
            line_start=r[4],
            line_end=r[5],
            vulnerable_code=r[6],
            description=r[7],
            exploit_path=r[8],
            cwe=r[9],
            confidence=r[10],
            detected_at=datetime.fromisoformat(r[11]) if r[11] else None,
        )
        for r in rows
    ]


def clear_findings(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM findings")
    conn.commit()


def _insert_proposal_row(conn: sqlite3.Connection, proposal: FixProposal) -> None:
    """Insert one proposal without committing. Shared by insert_proposal
    (commits per call) and insert_proposals (commits once at end of batch)."""
    conn.execute(
        """
        INSERT OR REPLACE INTO fix_proposals (
            proposal_id, finding_id, rank, strategy, title, rationale,
            tradeoffs, breaking_change_risk, patches_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(proposal.proposal_id),
            str(proposal.finding_id),
            proposal.rank,
            proposal.strategy.value,
            proposal.title,
            proposal.rationale,
            proposal.tradeoffs,
            proposal.breaking_change_risk.value,
            json.dumps([p.model_dump(mode="json") for p in proposal.patches]),
            proposal.created_at.isoformat() if proposal.created_at else None,
        ),
    )


def insert_proposal(conn: sqlite3.Connection, proposal: FixProposal) -> None:
    _insert_proposal_row(conn, proposal)
    conn.commit()


def insert_proposals(conn: sqlite3.Connection, proposals: list[FixProposal]) -> None:
    for proposal in proposals:
        _insert_proposal_row(conn, proposal)
    conn.commit()


def _row_to_proposal(row: tuple) -> FixProposal:
    patches = [SearchReplacePatch.model_validate(d) for d in json.loads(row[8])]
    return FixProposal(
        proposal_id=UUID(row[0]),
        finding_id=UUID(row[1]),
        rank=row[2],
        strategy=FixStrategy(row[3]),
        title=row[4],
        rationale=row[5],
        tradeoffs=row[6],
        breaking_change_risk=BreakingChangeRisk(row[7]),
        patches=patches,
        created_at=datetime.fromisoformat(row[9]) if row[9] else None,
    )


def list_proposals_for_finding(
    conn: sqlite3.Connection, finding_id: UUID
) -> list[FixProposal]:
    rows = conn.execute(
        """
        SELECT proposal_id, finding_id, rank, strategy, title, rationale,
               tradeoffs, breaking_change_risk, patches_json, created_at
        FROM fix_proposals
        WHERE finding_id = ?
        ORDER BY rank ASC
        """,
        (str(finding_id),),
    ).fetchall()
    return [_row_to_proposal(r) for r in rows]


def list_proposals(conn: sqlite3.Connection) -> list[FixProposal]:
    rows = conn.execute(
        """
        SELECT proposal_id, finding_id, rank, strategy, title, rationale,
               tradeoffs, breaking_change_risk, patches_json, created_at
        FROM fix_proposals
        ORDER BY finding_id, rank
        """
    ).fetchall()
    return [_row_to_proposal(r) for r in rows]


def clear_proposals(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM fix_proposals")
    conn.commit()
