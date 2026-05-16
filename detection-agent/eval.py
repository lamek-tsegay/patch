"""Evaluate persisted Findings against demo-repo/.answer-key.md.

Matching rule: a Finding matches an answer-key entry iff
  - Finding.file == entry["file"]
  - line ranges overlap (not (F.end < E.start or F.start > E.end))
  - Finding.category.value == entry["category"]
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent
sys.path.insert(0, str(_REPO_ROOT))
sys.path.insert(0, str(_HERE))

from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

from shared.db import init_db, list_findings  # noqa: E402

from answer_key_parser import parse_answer_key  # noqa: E402


console = Console()


def _strip_sqlite_prefix(url: str) -> str:
    return url.removeprefix("sqlite:///")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Patch detection-agent eval")
    p.add_argument("--repo", default=os.environ.get("DEMO_REPO_PATH", "./demo-repo"))
    p.add_argument(
        "--db",
        default=_strip_sqlite_prefix(os.environ.get("DATABASE_URL", "sqlite:///patch.db")),
    )
    p.add_argument("--answer-key", default=None,
                   help="path to .answer-key.md (defaults to <repo>/.answer-key.md)")
    return p.parse_args(argv)


def _ranges_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return not (a_end < b_start or a_start > b_end)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo).resolve()
    answer_key_path = Path(args.answer_key) if args.answer_key else repo_root / ".answer-key.md"

    if not answer_key_path.exists():
        console.print(f"[red]answer key not found:[/red] {answer_key_path}")
        return 2

    parsed = parse_answer_key(answer_key_path)
    vulns: list[dict] = parsed["vulns"]
    total_vulns = len(vulns)

    conn = init_db(args.db)
    findings = list_findings(conn)
    conn.close()

    # Differentiator check FIRST — vendored findings are a hard fail.
    vendor_findings = [
        f for f in findings if any(p == "vendor" for p in Path(f.file).parts)
    ]
    if vendor_findings:
        console.rule("[bold red]DIFFERENTIATOR FAILURE")
        console.print(
            "[red]scanner emitted findings on vendored code "
            "(must be skipped by walker, not just unflagged)[/red]"
        )
        for f in vendor_findings:
            console.print(f"  - {f.file}:{f.line_start}-{f.line_end} "
                          f"category={f.category.value}")
        return 2

    # Matching.
    matched_entries: set[int] = set()  # indices into vulns
    matched_findings: set[str] = set()  # finding_id strings
    per_category_total: dict[str, int] = defaultdict(int)
    per_category_matched: dict[str, int] = defaultdict(int)

    for i, entry in enumerate(vulns):
        per_category_total[entry["category"]] += 1
        for f in findings:
            if str(f.finding_id) in matched_findings:
                continue
            if f.file != entry["file"]:
                continue
            if f.category.value != entry["category"]:
                continue
            if not _ranges_overlap(f.line_start, f.line_end,
                                   entry["line_start"], entry["line_end"]):
                continue
            matched_entries.add(i)
            matched_findings.add(str(f.finding_id))
            per_category_matched[entry["category"]] += 1
            break

    # False positives: anything under demo-repo/safe/...
    fp_findings = [
        f for f in findings
        if Path(f.file).parts[1:2] == ("safe",)
    ]

    recall_num = len(matched_entries)
    recall_den = total_vulns
    total_findings = len(findings)
    precision_num = len(matched_findings)
    precision_den = total_findings

    console.rule("[bold]Eval results")
    summary = Table(title="summary")
    summary.add_column("metric", style="bold")
    summary.add_column("value", justify="right")
    summary.add_row("answer-key vulns",      str(recall_den))
    summary.add_row("findings persisted",    str(total_findings))
    summary.add_row("matched vulns",         str(recall_num))
    summary.add_row("recall",                f"{recall_num}/{recall_den}"
                    + (f"  ({100*recall_num/recall_den:.1f}%)" if recall_den else ""))
    summary.add_row("precision",             f"{precision_num}/{precision_den}"
                    + (f"  ({100*precision_num/precision_den:.1f}%)" if precision_den else "  (n/a)"))
    summary.add_row("false positives on /safe/", str(len(fp_findings)))
    console.print(summary)

    # Missed vulns
    missed = [vulns[i] for i in range(total_vulns) if i not in matched_entries]
    if missed:
        t = Table(title="missed vulns")
        t.add_column("file")
        t.add_column("lines")
        t.add_column("category")
        t.add_column("severity")
        for m in missed:
            t.add_row(
                m.get("file", "?"),
                f"{m.get('line_start')}-{m.get('line_end')}",
                m.get("category", "?"),
                m.get("severity", "?"),
            )
        console.print(t)
    else:
        console.print("[green]no missed vulns[/green]")

    # FPs
    if fp_findings:
        t = Table(title="false positives on /safe/")
        t.add_column("file")
        t.add_column("lines")
        t.add_column("category")
        for f in fp_findings:
            t.add_row(f.file, f"{f.line_start}-{f.line_end}", f.category.value)
        console.print(t)

    # Per-category breakdown
    cat_t = Table(title="per-category recall")
    cat_t.add_column("category")
    cat_t.add_column("matched", justify="right")
    cat_t.add_column("total", justify="right")
    for cat in sorted(per_category_total):
        cat_t.add_row(cat, str(per_category_matched.get(cat, 0)), str(per_category_total[cat]))
    console.print(cat_t)

    # Exit code
    if recall_num > recall_den:
        console.print(f"[red]impossible recall {recall_num}/{recall_den} — eval logic bug[/red]")
        return 2
    if recall_num >= 11 and not fp_findings:
        console.print("[green]PASS: recall >= 11/13 and zero FPs on /safe/[/green]")
        return 0
    console.print("[yellow]FAIL: recall < 11/13 or FPs on /safe/[/yellow]")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
