"""fix-proposer driver: read Findings from SQLite, run propose_fixes,
persist FixProposals to the same SQLite store.

Invocation:
    python scripts/run_proposer.py --db ./patch.db [--clear] [--limit N]

The directory layout requires sys.path manipulation: shared/ is a package,
but fix-proposer/ has a hyphen so its modules import as top-level (matching
detection-agent/scanner.py's pattern and the conftest.py convention used
by tests).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent
sys.path.insert(0, str(_REPO_ROOT))                    # shared.*
sys.path.insert(0, str(_REPO_ROOT / "fix-proposer"))   # proposer, strategies

from dotenv import load_dotenv  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.table import Table  # noqa: E402

from shared.db import clear_proposals, init_db, list_findings  # noqa: E402
from shared.nemotron_client import NIMNemotronClient  # noqa: E402

from proposer import propose_fixes  # noqa: E402
from strategies import STRATEGY_SLOTS  # noqa: E402


load_dotenv(_REPO_ROOT / ".env")

log = logging.getLogger(__name__)
console = Console()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Patch fix-proposer driver")
    p.add_argument(
        "--db",
        required=True,
        help="path to the SQLite findings/proposals store",
    )
    p.add_argument(
        "--clear",
        action="store_true",
        default=False,
        help="clear all existing fix_proposals before generating new ones",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="process at most N findings (default: no limit)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    console.rule(f"[bold]Patch propose[/bold] db={args.db}")
    if args.clear:
        console.print("[yellow]--clear:[/yellow] dropping all existing fix_proposals")
    if args.limit is not None:
        console.print(f"limit = {args.limit}")

    conn = init_db(args.db)
    if args.clear:
        clear_proposals(conn)

    findings = list_findings(conn)
    if args.limit is not None:
        findings = findings[: args.limit]

    client = NIMNemotronClient()

    totals = {
        "findings_total": len(findings),
        "supported": 0,
        "proposed": 0,
        "failed": 0,
        "skipped_unsupported": 0,
        "total_latency_sec": 0.0,
    }

    t_loop = time.perf_counter()

    for finding in findings:
        rel = f"{finding.file}:{finding.line_start}"
        if finding.category not in STRATEGY_SLOTS:
            console.print(
                f"[yellow]skip[/yellow] {rel} "
                f"category={finding.category.value} "
                f"reason=no_strategy_slots_wired"
            )
            totals["skipped_unsupported"] += 1
            continue

        totals["supported"] += 1
        console.print(
            f"[cyan]propose[/cyan] {rel} category={finding.category.value}"
        )
        try:
            propose_fixes(finding, client, db_conn=conn)
            totals["proposed"] += 1
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 — per-finding resilience
            log.warning(
                "propose_fixes failed finding_id=%s file=%s error=%r",
                finding.finding_id,
                rel,
                e,
            )
            totals["failed"] += 1
            continue

    totals["total_latency_sec"] = round(time.perf_counter() - t_loop, 2)
    conn.close()

    table = Table(title="propose summary")
    table.add_column("metric", style="bold")
    table.add_column("value", justify="right")
    table.add_row("findings total", str(totals["findings_total"]))
    table.add_row("supported", str(totals["supported"]))
    table.add_row("proposed (success)", str(totals["proposed"]))
    table.add_row("failed (exception)", str(totals["failed"]))
    table.add_row("skipped (unsupported category)", str(totals["skipped_unsupported"]))
    table.add_row("total latency (sec)", str(totals["total_latency_sec"]))
    console.print(table)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
