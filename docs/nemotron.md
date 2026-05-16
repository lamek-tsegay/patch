# Nemotron Models — Usage Guide for Patch

## TL;DR — which model when
- **Detection agent (Lamek)** → Nemotron 3 Super (120B-a12b), reasoning ON
- **Fix proposer (me, Law)** → Nemotron 3 Super, reasoning ON
- **Dedup, summaries, policy event narration (Zablon/BK)** → Nemotron 3 Nano, reasoning OFF

Two distinct model sizes for distinct roles = free points on "Use of Nemotron Models"
criterion. Reasoning-heavy tasks (vuln detection, fix synthesis) need Super.
Triage/classification/summarization (dedup, narration) is what Nano is built for.

## Why this split
NVIDIA explicitly markets Super for "cybersecurity triaging" and "multi-agent
applications requiring high-accuracy reasoning." Nano is for "summarization,
retrieval, classification, general assistant workflows."

For fix proposal specifically: I'm asking the model to read a vulnerability,
reason about three distinct remediation strategies, produce a verbatim search-
replace patch, and articulate tradeoffs. This is reasoning-heavy. Super. Pay
the latency.

## The dynamic reasoning toggle

**Update (May 2026):** NVIDIA's API now exposes reasoning in dedicated `message.reasoning` and `message.reasoning_content` fields, so the `detailed thinking on` system-prompt prefix is **no longer required** for the model to reason. The prefix is now opt-in — and on long prompts it can crowd out output tokens, producing empty `{"":""}` responses when the input is large. In `NIMNemotronClient.generate_json`, the default is `detailed_thinking=False`; pass `detailed_thinking=True` only when you specifically want the legacy prefix behavior.

Nemotron 3 Super supports a "detailed thinking on/off" switch via system prompt.
- **Detection agent**: detailed thinking ON. We want the model to deliberate
  before claiming a finding.
- **Fix proposer**: detailed thinking ON. We want it to deliberate before
  proposing a patch — false patches that don't apply waste user trust.
- **Nano (dedup, narration)**: leave OFF. Speed matters more than depth.

To enable, prepend system prompt: `detailed thinking on`
To disable: `detailed thinking off`

## API access — NIM via build.nvidia.com
NVIDIA endpoints are OpenAI-compatible. Use any OpenAI SDK:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["NIM_API_KEY"],
)

resp = client.chat.completions.create(
    model=os.environ["NIM_MODEL_SUPER"],  # e.g. "nvidia/nemotron-3-super-120b-a12b"
    messages=[
        {"role": "system", "content": "detailed thinking on\n\n<system prompt>"},
        {"role": "user", "content": "<finding + context + strategy slot>"},
    ],
    response_format={"type": "json_object"},  # JSON mode if supported, else parse manually
    temperature=0.2,  # low temp for code generation
)
```

Note: `NIMNemotronClient.generate_json` defaults to `temperature=0.2` but accepts a per-call `temperature` parameter — pass `0.0` for deterministic or reproducible output.

## Env vars (already in .env.example)
- `NIM_ENDPOINT` — base URL (https://integrate.api.nvidia.com/v1)
- `NIM_API_KEY` — auth, fill in after Brev is up
- `NIM_MODEL_SUPER` — full model string for Super
- `NIM_MODEL_NANO` — full model string for Nano

Do NOT hardcode model strings in component code. Always read from env. This lets
us swap models per call site without touching code.

## JSON mode caveats
Nemotron's JSON adherence is not Claude-tier. Build a repair-on-malformed loop:
1. Try once with `response_format={"type": "json_object"}`.
2. If JSON parse fails, send a follow-up: "Your previous response was not valid
   JSON. Return only valid JSON matching this schema: <schema>. Original
   response: <previous>"
3. After 2 retries, log and surface as a failed proposal — don't crash the
   pipeline.

## Latency budget
Super 120B inference on a single response typically takes 30-90 seconds for
substantive reasoning tasks. Budget accordingly:
- 3 strategy slots × 30-90s per call = 1.5-4.5 minutes per finding
- For a demo with 3 findings, that's 5-15 minutes of total inference

Mitigation: kick off the three strategy slots in parallel per finding. Use
`asyncio.gather()` with the async OpenAI client. This is critical — without
parallelism the demo waits too long.

## Rate limits
NVIDIA build.nvidia.com is free with rate limits. Check the dashboard before
the demo. If we hit limits, the dashboard should show a degraded state, not
crash.