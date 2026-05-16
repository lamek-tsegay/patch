"""
THIS FILE IS THE CONTRACT between detection-agent and fix-proposer.

Import from it — do not redefine Finding, Severity, or Category in your own
module. Schema changes require a heads-up in the group chat and a coordinated
PR so the other side doesn't break.

Human-readable spec lives in /shared/schema.md.
"""

from __future__ import annotations

import os
from datetime import datetime
from enum import StrEnum
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Category(StrEnum):
    SQL_INJECTION = "sql_injection"
    NOSQL_INJECTION = "nosql_injection"
    COMMAND_INJECTION = "command_injection"
    XSS_REFLECTED = "xss_reflected"
    XSS_STORED = "xss_stored"
    XSS_DOM = "xss_dom"
    SSRF = "ssrf"
    PATH_TRAVERSAL = "path_traversal"
    INSECURE_DESERIALIZATION = "insecure_deserialization"
    HARDCODED_SECRET = "hardcoded_secret"
    WEAK_CRYPTO = "weak_crypto"
    BROKEN_AUTH = "broken_auth"
    BROKEN_ACCESS_CONTROL = "broken_access_control"
    OPEN_REDIRECT = "open_redirect"
    XXE = "xxe"
    INSECURE_RANDOM = "insecure_random"
    MISSING_RATE_LIMIT = "missing_rate_limit"
    RACE_CONDITION = "race_condition"
    INFORMATION_DISCLOSURE = "information_disclosure"
    OTHER = "other"


class Finding(BaseModel):
    finding_id: UUID
    severity: Severity
    category: Category
    file: str
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    vulnerable_code: str
    description: str
    exploit_path: str
    cwe: str
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    detected_at: datetime | None = None

    @field_validator("file")
    @classmethod
    def _no_leading_slash(cls, v: str) -> str:
        if v.startswith("/"):
            raise ValueError("file must be a repo-relative POSIX path, no leading slash")
        return v

    @field_validator("cwe")
    @classmethod
    def _cwe_format(cls, v: str) -> str:
        if not v.startswith("CWE-") or not v[4:].isdigit():
            raise ValueError("cwe must look like 'CWE-89'")
        return v

    @model_validator(mode="after")
    def _line_range_ordered(self) -> "Finding":
        if self.line_end < self.line_start:
            raise ValueError("line_end must be >= line_start")
        return self


def verify_against_source(finding: Finding, source_text: str) -> bool:
    """True iff finding.vulnerable_code appears verbatim in source_text."""
    return finding.vulnerable_code in source_text


def verify_against_file(finding: Finding, repo_root: str | os.PathLike) -> bool:
    """Read the file from disk and verify the vulnerable_code is present verbatim."""
    path = Path(repo_root) / finding.file
    try:
        source_text = path.read_text(encoding="utf-8")
    except (FileNotFoundError, UnicodeDecodeError):
        return False
    return verify_against_source(finding, source_text)
