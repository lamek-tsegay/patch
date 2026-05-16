"""Smoke test for NIM endpoint on Brev.

Verifies that the configured endpoint is reachable, that both required model IDs
are present in the catalog, and that each model can handle a hello-world prompt,
return valid JSON, and reason about a SQL injection snippet.

Run after Brev is up:
    python scripts/nim_smoke_test.py
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from typing import Callable

from dotenv import load_dotenv
from openai import APIStatusError, OpenAI, OpenAIError
from rich.console import Console
from rich.table import Table

console = Console()


@dataclass
class TestCase:
    name: str
    run: Callable[[OpenAI, str], None]


def _log_request(model: str, label: str) -> None:
    console.log(f"[cyan]→[/cyan] {label} | model=[bold]{model}[/bold]")


def _log_failure(model: str, exc: Exception) -> None:
    status = getattr(exc, "status_code", "n/a")
    body = ""
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            body = response.text
        except Exception:
            body = ""
    if not body:
        body = str(exc)
    console.print(
        f"[red]✗[/red] model=[bold]{model}[/bold] status={status} body={body[:200]!r}"
    )


def test_hello_world(client: OpenAI, model: str) -> None:
    _log_request(model, "hello-world")
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Say hello in one short sentence."}],
        max_tokens=800,
        temperature=0.0,
    )
    content = (resp.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError("empty completion content")
    console.print(f"  reply: {content[:120]}")


def test_json_output(client: OpenAI, model: str) -> None:
    _log_request(model, "json-output")
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "Respond with a single JSON object. No prose, no code fences.",
            },
            {
                "role": "user",
                "content": (
                    'Return JSON with keys "language" (string) and "year" (integer) '
                    "describing Python's first public release."
                ),
            },
        ],
        max_tokens=800,
        temperature=0.0,
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    data = json.loads(raw)
    if "language" not in data or "year" not in data:
        raise RuntimeError(f"missing required keys in JSON: {data!r}")
    console.print(f"  parsed: {data}")


SQLI_SNIPPET = """\
def get_user(conn, username):
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    cursor.execute(query)
    return cursor.fetchone()
"""


def test_sql_injection(client: OpenAI, model: str) -> None:
    _log_request(model, "sql-injection-reasoning")
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You are a security reviewer. Answer concisely.",
            },
            {
                "role": "user",
                "content": (
                    "Is the following Python function vulnerable to SQL injection? "
                    "Answer with one short paragraph naming the vulnerability and the fix.\n\n"
                    f"```python\n{SQLI_SNIPPET}```"
                ),
            },
        ],
        max_tokens=800,
        temperature=0.0,
    )
    content = (resp.choices[0].message.content or "").strip().lower()
    if "sql" not in content or "injection" not in content:
        raise RuntimeError(
            f"reply did not mention SQL injection: {content[:200]!r}"
        )
    console.print(f"  reply: {content[:160]}...")


TESTS: list[TestCase] = [
    TestCase("hello-world", test_hello_world),
    TestCase("json-output", test_json_output),
    TestCase("sql-injection-reasoning", test_sql_injection),
]


def check_catalog(client: OpenAI, super_id: str, nano_id: str) -> None:
    console.rule("[bold]catalog check[/bold]")
    console.log(f"GET {client.base_url}models")
    models = client.models.list()
    ids = [m.id for m in models.data]
    table = Table(title="available models")
    table.add_column("id")
    for mid in ids:
        table.add_row(mid)
    console.print(table)
    missing = [name for name, mid in (("NIM_MODEL_SUPER", super_id), ("NIM_MODEL_NANO", nano_id)) if mid not in ids]
    if missing:
        for name in missing:
            console.print(f"[red]✗ {name} not present in catalog[/red]")
        raise SystemExit(2)
    console.print("[green]✓ both required models present[/green]")


def main() -> int:
    load_dotenv()
    endpoint = os.getenv("NIM_ENDPOINT")
    api_key = os.getenv("NIM_API_KEY")
    super_id = os.getenv("NIM_MODEL_SUPER")
    nano_id = os.getenv("NIM_MODEL_NANO")

    missing_env = [
        name
        for name, value in (
            ("NIM_ENDPOINT", endpoint),
            ("NIM_API_KEY", api_key),
            ("NIM_MODEL_SUPER", super_id),
            ("NIM_MODEL_NANO", nano_id),
        )
        if not value
    ]
    if missing_env:
        console.print(f"[red]missing env vars: {', '.join(missing_env)}[/red]")
        return 2

    client = OpenAI(base_url=endpoint, api_key=api_key)

    try:
        check_catalog(client, super_id, nano_id)
    except SystemExit as exc:
        return int(exc.code or 1)
    except (APIStatusError, OpenAIError) as exc:
        _log_failure("<catalog>", exc)
        return 2
    except Exception as exc:
        console.print(f"[red]catalog check failed: {exc!r}[/red]")
        return 2

    results: list[tuple[str, str, bool]] = []
    for model in (super_id, nano_id):
        console.rule(f"[bold]{model}[/bold]")
        for case in TESTS:
            try:
                case.run(client, model)
                results.append((model, case.name, True))
                console.print(f"[green]✓ {case.name}[/green]")
            except APIStatusError as exc:
                _log_failure(model, exc)
                results.append((model, case.name, False))
            except Exception as exc:
                console.print(
                    f"[red]✗ {case.name} model={model} error={exc!r}[/red]"
                )
                results.append((model, case.name, False))

    console.rule("[bold]summary[/bold]")
    summary = Table()
    summary.add_column("model")
    summary.add_column("test")
    summary.add_column("result")
    for model, name, ok in results:
        summary.add_row(model, name, "[green]pass[/green]" if ok else "[red]fail[/red]")
    console.print(summary)

    passed = sum(1 for _, _, ok in results if ok)
    total = len(results)
    if passed == total:
        console.print(f"[green]all {total} tests passed[/green]")
        return 0
    console.print(f"[red]{total - passed}/{total} tests failed[/red]")
    return 1


if __name__ == "__main__":
    sys.exit(main())
