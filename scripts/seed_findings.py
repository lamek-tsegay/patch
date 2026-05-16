"""Seed Findings into the SQLite store directly from demo-repo/.answer-key.md.

Invocation:
    python scripts/seed_findings.py --db ./patch.db [--repo ./demo-repo] [--clear]

This bypasses detection-agent for the demo path. When detection's recall is
unreliable, this script writes ground-truth Findings (sourced from the
answer key) so the downstream pipeline (run_proposer.py, dashboard) has
data to operate on.

Only vulnerabilities whose category is supported by fix-proposer
(i.e. in STRATEGY_SLOTS) are seeded; others are logged and skipped.
No LLM is involved — descriptions and exploit_paths are synthesized
from per-category templates below.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent
sys.path.insert(0, str(_REPO_ROOT))                       # shared.*
sys.path.insert(0, str(_REPO_ROOT / "fix-proposer"))      # strategies
sys.path.insert(0, str(_REPO_ROOT / "detection-agent"))   # answer_key_parser

from dotenv import load_dotenv  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

from shared.db import clear_findings, init_db, insert_finding  # noqa: E402
from shared.schema import Category, Finding, Severity  # noqa: E402

from answer_key_parser import parse_answer_key  # noqa: E402
from strategies import STRATEGY_SLOTS  # noqa: E402


load_dotenv(_REPO_ROOT / ".env")

log = logging.getLogger(__name__)
console = Console()


# Per-category templates for the two fields the answer key doesn't provide
# (description and exploit_path). Edit here when adding a new category to
# STRATEGY_SLOTS — no LLM, fully deterministic.
_DESCRIPTION_TEMPLATES: dict[Category, str] = {
    Category.COMMAND_INJECTION: (
        "User-controlled input is passed to subprocess with shell=True, "
        "allowing command injection."
    ),
    Category.SQL_INJECTION: (
        "User-controlled input is concatenated or interpolated into a SQL "
        "query without parameterization, allowing SQL injection."
    ),
    Category.WEAK_CRYPTO: (
        "A cryptographically weak algorithm (e.g. MD5 or SHA-1) is used for "
        "a security-sensitive operation that requires a modern alternative."
    ),
}

_EXPLOIT_PATH_TEMPLATES: dict[Category, str] = {
    Category.COMMAND_INJECTION: (
        "An attacker supplies a value containing shell metacharacters "
        "(e.g. '; rm -rf /') which the shell will execute as separate commands."
    ),
    Category.SQL_INJECTION: (
        "An attacker supplies a value containing SQL syntax (e.g. \"' OR "
        "'1'='1' --\") that alters the query semantics to bypass auth or "
        "exfiltrate data."
    ),
    Category.WEAK_CRYPTO: (
        "An attacker who obtains the stored hash recovers the underlying "
        "secret via rainbow tables or fast brute force on commodity hardware."
    ),
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Seed Findings directly from demo-repo/.answer-key.md",
    )
    p.add_argument(
        "--db",
        required=True,
        help="path to the SQLite findings/proposals store",
    )
    p.add_argument(
        "--repo",
        default=str(_REPO_ROOT / "demo-repo"),
        help="path to the demo repo (default: ./demo-repo)",
    )
    p.add_argument(
        "--clear",
        action="store_true",
        default=False,
        help="clear all existing findings before seeding",
    )
    return p.parse_args(argv)


def _read_vulnerable_code(
    repo_root: Path,
    file_field: str,
    line_start: int,
    line_end: int,
) -> str | None:
    """Extract lines [line_start - 1 : line_end] from the source file.

    file_field is the answer-key path (e.g. "demo-repo/admin/diagnostics.py").
    We strip the repo-dir prefix if present so it resolves under repo_root —
    mirrors scanner.py's resolution convention.
    """
    prefix = repo_root.name + "/"
    rel = file_field[len(prefix):] if file_field.startswith(prefix) else file_field
    path = repo_root / rel
    try:
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    except OSError as e:
        log.warning("cannot read %s: %s", path, e)
        return None
    sliced = "".join(lines[line_start - 1 : line_end])
    # Match the fixture convention: no trailing newline.
    return sliced.rstrip("\n")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    repo_root = Path(args.repo).resolve()
    answer_key_path = repo_root / ".answer-key.md"
    if not answer_key_path.exists():
        console.print(f"[red]answer key not found:[/red] {answer_key_path}")
        return 1

    console.rule(f"[bold]Patch seed[/bold] db={args.db} repo={repo_root}")

    conn = init_db(args.db)
    if args.clear:
        console.print("[yellow]--clear:[/yellow] dropping all existing findings")
        clear_findings(conn)

    parsed = parse_answer_key(answer_key_path)
    vulns = parsed["vulns"]

    totals = {
        "vulns_parsed": len(vulns),
        "supported": 0,
        "seeded": 0,
        "skipped_unsupported": 0,
    }

    now = datetime.now(UTC)

    for vuln in vulns:
        file_field = vuln.get("file", "<missing>")
        rel = f"{file_field}:{vuln.get('line_start', '?')}"

        # Coerce the parser's raw category string into the enum. If the
        # answer key drifts (typo, new category not yet in shared.schema),
        # skip cleanly rather than crashing.
        try:
            category = Category(vuln["category"])
        except (KeyError, ValueError):
            console.print(
                f"[yellow]skip[/yellow] {rel} category={vuln.get('category')!r} "
                f"reason=not_a_known_category"
            )
            totals["skipped_unsupported"] += 1
            continue

        if category not in STRATEGY_SLOTS:
            console.print(
                f"[yellow]skip[/yellow] {rel} category={category.value} "
                f"reason=no_strategy_slots_wired"
            )
            totals["skipped_unsupported"] += 1
            continue

        totals["supported"] += 1

        try:
            severity = Severity(vuln["severity"])
        except (KeyError, ValueError) as e:
            log.warning("invalid severity for %s: %r", rel, e)
            continue

        vulnerable_code = _read_vulnerable_code(
            repo_root, file_field, vuln["line_start"], vuln["line_end"]
        )
        if vulnerable_code is None:
            log.warning("could not extract vulnerable_code for %s", rel)
            continue

        description = _DESCRIPTION_TEMPLATES.get(
            category,
            f"A {category.value} vulnerability in {file_field}.",
        )
        exploit_path = _EXPLOIT_PATH_TEMPLATES.get(
            category,
            "An attacker exploits this code path.",
        )

        finding = Finding(
            finding_id=uuid4(),
            severity=severity,
            category=category,
            file=file_field,
            line_start=vuln["line_start"],
            line_end=vuln["line_end"],
            vulnerable_code=vulnerable_code,
            description=description,
            exploit_path=exploit_path,
            cwe=vuln["cwe"],
            confidence=1.0,
            detected_at=now,
        )
        insert_finding(conn, finding)
        totals["seeded"] += 1

        console.print(
            f"[cyan]seed[/cyan] {rel} category={category.value} "
            f"severity={severity.value}"
        )

    conn.close()

    table = Table(title="seed summary")
    table.add_column("metric", style="bold")
    table.add_column("value", justify="right")
    table.add_row("vulns parsed", str(totals["vulns_parsed"]))
    table.add_row("supported", str(totals["supported"]))
    table.add_row("seeded", str(totals["seeded"]))
    table.add_row("skipped (unsupported category)", str(totals["skipped_unsupported"]))
    console.print(table)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
