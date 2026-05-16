"""Parse demo-repo/.answer-key.md into structured dicts.

Format (per vuln section):
    ## Vuln NN — title
    - file: <path>
    - line_start: <int>
    - line_end: <int>
    - severity: <enum>
    - category: <enum>
    - cwe: CWE-XX
    ...

Decoys section is a list of "- file: <path> — ..." bullets.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any


_VULN_HEADER = re.compile(r"^##\s+Vuln\s+(\d+)\b", re.IGNORECASE)
_DECOY_HEADER = re.compile(r"^##\s+Decoys\b", re.IGNORECASE)
_VENDOR_HEADER = re.compile(r"^##\s+Vendor\b", re.IGNORECASE)
_OTHER_H2 = re.compile(r"^##\s+")
_FIELD_BULLET = re.compile(r"^-\s+(\w+):\s*(.+?)\s*$")
_DECOY_FILE = re.compile(r"^-\s+file:\s*(\S+)")

_INT_FIELDS = {"line_start", "line_end"}


def _coerce(field: str, value: str) -> Any:
    if field in _INT_FIELDS:
        return int(value)
    return value


def parse_answer_key(path: Path) -> dict[str, Any]:
    text = Path(path).read_text(encoding="utf-8")
    lines = text.splitlines()

    vulns: list[dict[str, Any]] = []
    decoys: list[str] = []

    section: str | None = None
    current: dict[str, Any] | None = None

    def flush_current() -> None:
        nonlocal current
        if current is not None:
            vulns.append(current)
            current = None

    for raw in lines:
        line = raw.rstrip()

        m_v = _VULN_HEADER.match(line)
        if m_v:
            flush_current()
            section = "vuln"
            current = {"vuln_num": int(m_v.group(1))}
            continue

        if _DECOY_HEADER.match(line):
            flush_current()
            section = "decoys"
            continue

        if _VENDOR_HEADER.match(line):
            flush_current()
            section = "vendor"
            continue

        if _OTHER_H2.match(line):
            flush_current()
            section = "other"
            continue

        if section == "vuln" and current is not None:
            mf = _FIELD_BULLET.match(line)
            if mf:
                field, value = mf.group(1), mf.group(2)
                if field in {"file", "line_start", "line_end", "severity", "category", "cwe"}:
                    current[field] = _coerce(field, value)
            continue

        if section == "decoys":
            md = _DECOY_FILE.match(line)
            if md:
                decoys.append(md.group(1))
            continue

    flush_current()

    return {"vulns": vulns, "decoys": decoys}
