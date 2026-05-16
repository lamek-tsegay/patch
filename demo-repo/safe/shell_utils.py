"""Subprocess wrappers used by the SRE diagnostics endpoint.

Each helper here restricts the caller to a fixed set of subcommands and
passes args as a list with shell=False. This is the safe surface — the
admin Blueprint's ping endpoint deliberately does not go through here.
"""
from __future__ import annotations

import subprocess

ALLOWED_COMMANDS = {"status", "version", "health"}


def run_diagnostic(cmd: str) -> str:
    if cmd not in ALLOWED_COMMANDS:
        raise ValueError(f"command not allowed: {cmd!r}")
    result = subprocess.run(
        ["./bin/diag", cmd],
        shell=False,
        capture_output=True,
        text=True,
        timeout=5,
    )
    return result.stdout


def run_health_summary() -> dict[str, str]:
    return {cmd: run_diagnostic(cmd) for cmd in ("status", "health", "version")}
