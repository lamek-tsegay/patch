"""Nemotron NIM client + mock for testing.

Single wrapper for NIM API access — do not scatter base URLs across components.
NVIDIA endpoints are OpenAI-compatible (see docs/nemotron.md).
"""

from __future__ import annotations

import json
import os
from typing import Any, Protocol

from openai import OpenAI


class NemotronClient(Protocol):
    def generate_json(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...


class NIMNemotronClient:
    """Real NIM client. Scaffolded here, not exercised by the H1-3 mock tests."""

    def __init__(self, endpoint: str | None = None, api_key: str | None = None) -> None:
        self._client = OpenAI(
            base_url=endpoint or os.environ["NIM_ENDPOINT"],
            api_key=api_key or os.environ["NIM_API_KEY"],
        )

    def generate_json(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # "detailed thinking on" is Nemotron Super's reasoning toggle (docs/nemotron.md).
        # Fix-gen wants ON — false patches that don't apply waste user trust.
        system_prefixed = f"detailed thinking on\n\n{system}"
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prefixed},
            {"role": "user", "content": user},
        ]
        raw = self._call(model, messages)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # One repair retry per docs/nemotron.md. Nemotron's JSON adherence
            # is not Claude-tier; one nudge usually fixes it.
            repair = (
                "Your previous response was not valid JSON. "
                "Return only a single JSON object"
                + (f" matching this schema:\n{json.dumps(schema)}" if schema else "")
                + f"\n\nOriginal response:\n{raw}"
            )
            messages.append({"role": "assistant", "content": raw})
            messages.append({"role": "user", "content": repair})
            return json.loads(self._call(model, messages))

    def _call(self, model: str, messages: list[dict[str, str]]) -> str:
        resp = self._client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""


class MockNemotronClient:
    """Deterministic stand-in for tests.

    Keyed by substring of the user prompt — the first marker found wins.
    Missing matches raise KeyError loudly so a misconfigured test fails fast
    instead of silently returning a generic canned response.
    """

    def __init__(self, responses: dict[str, dict[str, Any]]) -> None:
        self._responses = responses

    def generate_json(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        for marker, response in self._responses.items():
            if marker in user:
                return response
        raise KeyError(
            "MockNemotronClient: no marker matched user prompt. "
            f"Configured markers: {list(self._responses)}"
        )
