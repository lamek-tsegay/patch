"""Nemotron NIM client + mock for testing.

Single wrapper for NIM API access — do not scatter base URLs across components.
NVIDIA endpoints are OpenAI-compatible (see docs/nemotron.md).
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Protocol

from openai import OpenAI

logger = logging.getLogger(__name__)


# Nemotron 3 reasoning models return None content below this — the reasoning
# trace consumes the budget before any user-visible tokens are emitted.
MIN_MAX_TOKENS = 800


class NemotronClient(Protocol):
    def generate_json(
        self,
        model: str,
        system: str,
        user: str,
        schema: dict[str, Any] | None = None,
        max_tokens: int = 2048,
    ) -> dict[str, Any]: ...


class NIMNemotronClient:
    """Real NIM client via the OpenAI SDK — NVIDIA endpoints are OpenAI-compatible."""

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
        max_tokens: int = 2048,
    ) -> dict[str, Any]:
        if max_tokens < MIN_MAX_TOKENS:
            raise ValueError(
                f"max_tokens={max_tokens} below floor {MIN_MAX_TOKENS}: "
                "Nemotron 3 reasoning models return None content below this "
                "because the reasoning trace consumes the budget first"
            )

        # "detailed thinking on" is Nemotron Super's reasoning toggle (docs/nemotron.md).
        # Fix-gen wants ON — false patches that don't apply waste user trust.
        system_prefixed = f"detailed thinking on\n\n{system}"
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prefixed},
            {"role": "user", "content": user},
        ]
        raw = self._call(model, messages, max_tokens)
        try:
            return json.loads(_strip_code_fences(raw))
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
            return json.loads(_strip_code_fences(self._call(model, messages, max_tokens)))

    def _call(self, model: str, messages: list[dict[str, str]], max_tokens: int) -> str:
        t0 = time.perf_counter()
        resp = self._client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=max_tokens,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        usage = resp.usage
        logger.info(
            "nim_call model=%s latency_ms=%d prompt_tokens=%s "
            "completion_tokens=%s total_tokens=%s",
            model,
            latency_ms,
            getattr(usage, "prompt_tokens", "n/a"),
            getattr(usage, "completion_tokens", "n/a"),
            getattr(usage, "total_tokens", "n/a"),
        )
        return resp.choices[0].message.content or ""


def _strip_code_fences(raw: str) -> str:
    """Strip ``` and ```json fences if the model wraps its JSON output."""
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`").strip()
        if s.lower().startswith("json"):
            s = s[4:].strip()
    return s


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
        max_tokens: int = 2048,
    ) -> dict[str, Any]:
        for marker, response in self._responses.items():
            if marker in user:
                return response
        raise KeyError(
            "MockNemotronClient: no marker matched user prompt. "
            f"Configured markers: {list(self._responses)}"
        )
