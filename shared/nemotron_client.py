"""Nemotron NIM client + mock for testing.

Single wrapper for NIM API access — do not scatter base URLs across components.
NVIDIA endpoints are OpenAI-compatible (see docs/nemotron.md).
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Protocol

from openai import OpenAI

logger = logging.getLogger(__name__)

_RAW_DUMP_DIR = Path(__file__).resolve().parent.parent / "tests" / "outputs"


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
        detailed_thinking: bool = False,
        temperature: float | None = None,
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
        detailed_thinking: bool = False,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        """Call NIM with a system+user prompt and parse the JSON response.

        The `detailed_thinking` flag is opt-in. When True, the legacy
        "detailed thinking on\\n\\n" prefix is prepended to the system
        message — this was needed when NVIDIA's API surfaced reasoning only
        inline. The API now exposes reasoning in dedicated `message.reasoning`
        and `message.reasoning_content` fields, so the prefix is no longer
        required for the model to reason. Leave it False unless you have a
        specific reason: on long prompts the prefix can crowd out output
        tokens and has been seen producing empty `{"":""}` responses.

        `temperature` defaults to 0.2 when not passed; pass 0.0 for
        deterministic output (e.g., reproducible evals or bug repros).
        """
        if max_tokens < MIN_MAX_TOKENS:
            raise ValueError(
                f"max_tokens={max_tokens} below floor {MIN_MAX_TOKENS}: "
                "Nemotron 3 reasoning models return None content below this "
                "because the reasoning trace consumes the budget first"
            )

        system_content = (
            f"detailed thinking on\n\n{system}" if detailed_thinking else system
        )
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user},
        ]
        raw = self._call(model, messages, max_tokens, temperature)
        try:
            parsed = json.loads(_strip_code_fences(raw))
            _dump_raw_response(user, raw)
            return parsed
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
            raw2 = self._call(model, messages, max_tokens, temperature)
            parsed = json.loads(_strip_code_fences(raw2))
            _dump_raw_response(user, raw2)
            return parsed

    def _call(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float | None,
    ) -> str:
        t0 = time.perf_counter()
        resp = self._client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=temperature if temperature is not None else 0.2,
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


def _slot_hint(user: str) -> str:
    """Extract the strategy value from the prompt's 'Strategy: <value>' line.

    Filename-safe slug. Falls back to 'unknown' if no Strategy line is found.
    """
    marker = "Strategy: "
    idx = user.find(marker)
    if idx == -1:
        return "unknown"
    value = user[idx + len(marker):].split("\n", 1)[0].strip()
    slug = "".join(c if c.isalnum() else "_" for c in value)
    return slug or "unknown"


def _dump_raw_response(user: str, raw: str) -> None:
    """Persist the raw NIM response to tests/outputs/ for post-mortem diagnosis."""
    try:
        _RAW_DUMP_DIR.mkdir(parents=True, exist_ok=True)
        path = _RAW_DUMP_DIR / f"last_raw_response_{_slot_hint(user)}_{int(time.time())}.json"
        path.write_text(raw)
        logger.info("nim_raw_response_dump path=%s", path)
    except OSError as e:
        logger.warning("could not dump raw response: %s", e)


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
        detailed_thinking: bool = False,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        for marker, response in self._responses.items():
            if marker in user:
                return response
        raise KeyError(
            "MockNemotronClient: no marker matched user prompt. "
            f"Configured markers: {list(self._responses)}"
        )
