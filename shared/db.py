"""SQLite store for Findings. Single table, no ORM."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import UUID

from .schema import Category, Finding, Severity

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


def init_db(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute(_SCHEMA)
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
