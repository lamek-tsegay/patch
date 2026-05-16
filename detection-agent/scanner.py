"""detection-agent CLI: scan a repo, persist Findings to SQLite.

Invocation:
    python detection-agent/scanner.py --repo ./demo-repo --db ./patch.db

The directory name has a hyphen so `python -m` is not viable; we call
scanner.py directly and prepend its parent (detection-agent/) to
sys.path so its sibling modules import as top-level — matching the
fix-proposer / policy-and-commit convention enforced by conftest.py.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent
sys.path.insert(0, str(_REPO_ROOT))  # shared.*
sys.path.insert(0, str(_HERE))       # sibling modules (walker, prompt, ...)

from dotenv import load_dotenv  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

from shared.db import clear_findings, init_db, insert_finding  # noqa: E402

from client_factory import make_client  # noqa: E402
from pipeline import scan_file  # noqa: E402
from walker import walk_first_party  # noqa: E402


load_dotenv(_REPO_ROOT / ".env")

console = Console()


def _strip_sqlite_prefix(url: str) -> str:
    return url.removeprefix("sqlite:///")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Patch detection-agent CLI")
    p.add_argument(
        "--repo",
        default=os.environ.get("DEMO_REPO_PATH", "./demo-repo"),
        help="path to the repo to scan",
    )
    p.add_argument(
        "--db",
        default=_strip_sqlite_prefix(os.environ.get("DATABASE_URL", "sqlite:///patch.db")),
        help="path to the SQLite findings DB",
    )
    p.add_argument(
        "--model",
        default=os.environ.get("NIM_MODEL_SUPER", "nvidia/nemotron-3-super-120b-a12b"),
        help="NIM model ID",
    )
    group = p.add_mutually_exclusive_group()
    group.add_argument(
        "--limit",
        type=int,
        default=None,
        help="stop after N scanned files (default: no limit)",
    )
    group.add_argument(
        "--files",
        default=None,
        help=(
            "comma-separated relative paths to scan instead of walking the "
            "repo. Paths can be display-style (e.g. demo-repo/auth/login.py) "
            "or repo-relative (auth/login.py). Skips the walker entirely; "
            "mutually exclusive with --limit."
        ),
    )
    return p.parse_args(argv)


def _resolve_target_files(repo_root: Path, files_arg: str) -> list[Path]:
    """Map user-supplied paths to filesystem paths under repo_root."""
    resolved: list[Path] = []
    prefix = repo_root.name + "/"
    for raw in files_arg.split(","):
        rel = raw.strip()
        if not rel:
            continue
        # Accept both "demo-repo/auth/login.py" and "auth/login.py"
        if rel.startswith(prefix):
            rel = rel[len(prefix):]
        candidate = (repo_root / rel).resolve()
        if not candidate.exists():
            raise SystemExit(f"--files: not found under {repo_root}: {raw}")
        resolved.append(candidate)
    return resolved


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    repo_root = Path(args.repo).resolve()
    if not repo_root.exists():
        console.print(f"[red]repo not found:[/red] {repo_root}")
        return 1

    console.rule(f"[bold]Patch scan[/bold] {repo_root}")
    console.print(f"db    = {args.db}")
    console.print(f"model = {args.model}")
    if args.limit is not None:
        console.print(f"limit = {args.limit}")
    if args.files is not None:
        console.print(f"files = {args.files}")

    client = make_client()
    conn = init_db(args.db)
    clear_findings(conn)

    totals = {
        "files_scanned": 0,
        "emitted": 0,
        "dropped_validation": 0,
        "dropped_guard": 0,
        "persisted": 0,
    }

    if args.files is not None:
        targets = iter(_resolve_target_files(repo_root, args.files))
    else:
        targets = walk_first_party(repo_root)

    for path in targets:
        if args.limit is not None and totals["files_scanned"] >= args.limit:
            console.print(f"[yellow]limit reached ({args.limit}); stopping[/yellow]")
            break

        rel = path.relative_to(repo_root)
        console.print(f"[cyan]scanning[/cyan] {rel}")
        findings, counts = scan_file(path, repo_root, client, args.model)

        for f in findings:
            insert_finding(conn, f)
            totals["persisted"] += 1

        totals["files_scanned"] += 1
        totals["emitted"] += counts["emitted"]
        totals["dropped_validation"] += counts["dropped_validation"]
        totals["dropped_guard"] += counts["dropped_guard"]

        console.print(
            f"  -> emitted={counts['emitted']} "
            f"dropped_validation={counts['dropped_validation']} "
            f"dropped_guard={counts['dropped_guard']} "
            f"persisted={len(findings)}"
        )

    conn.close()

    table = Table(title="scan summary")
    table.add_column("metric", style="bold")
    table.add_column("value", justify="right")
    table.add_row("files scanned", str(totals["files_scanned"]))
    table.add_row("findings emitted by model", str(totals["emitted"]))
    table.add_row("findings dropped (ValidationError)", str(totals["dropped_validation"]))
    table.add_row("findings dropped (verbatim guard)", str(totals["dropped_guard"]))
    table.add_row("findings persisted", str(totals["persisted"]))
    console.print(table)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
