# FixProposal — locked design decisions

This is the rationale companion to `shared/schema.py` and the `## FixProposal` section of `shared/schema.md`. Once a decision is listed here, changing it requires a heads-up in chat and a coordinated PR — detection-agent, policy-and-commit, and the dashboard all key off these shapes.

## 1. Patches are search-replace blocks, not unified diffs

`FixProposal.patches: list[SearchReplacePatch]` carries `(file, search, replace)` triples. We do **not** ship unified diff strings.

LLMs hallucinate line numbers. A unified diff with the wrong `@@ -42,3 +42,3 @@` header is silently corrupt — it applies cleanly to the wrong region or rejects entirely with no useful repair signal. Search-replace anchors the patch to verbatim source bytes, which:

- Reuses the same anti-hallucination guard the detection agent already uses for `Finding.vulnerable_code` (verbatim match against file bytes).
- Survives unrelated edits above or below the patched region. Diff line numbers don't.
- Is straightforward to verify — string-in-file lookup, no diff parser, no fuzzy hunk matching.

Trade-off accepted: search-replace can't express "delete lines 40–60 of a file you don't have local context for" as compactly as a diff. We don't need that; the proposer always has the file open when generating.

## 2. `FixStrategy` is a single flat enum, not per-category enums

One `StrEnum` with all strategy values across all categories. We considered nested enums (`SqlInjectionStrategy`, `XssStrategy`, …) for tighter typing, and rejected it:

- Serialization is simpler — one string column, one Pydantic field, no discriminated union.
- The dashboard renders strategy as a label; it doesn't need to know which category the value belongs to.
- The category → strategy-slot mapping lives in `schema.md` as a table and in the proposer's prompt templates. Enforcing it at the type level would force a Union type that fights serialization.

The cost is that nothing in the type system stops you from emitting `strategy=parameterize_query` on an `xss_reflected` finding. The proposer's slot-driven prompting structurally prevents this; if it ever leaks through, we add a runtime check at the DB write site, not a type-level constraint.

## 3. Empty `search` + non-empty `replace` = create file

No separate `CreateFile` model. A `SearchReplacePatch` with `search == ""` and a non-empty `replace` means *create the file at `file` with these contents*. Both fields empty is rejected by the model validator.

Reasoning: the apply step is the same shape in both cases (write bytes to a path). Splitting into two models doubles the surface for the policy layer to consume with no semantic gain. The convention is documented in `schema.md` and enforced by the validator.

Open follow-up: when the proposer needs to *delete* a file entirely, the current shape is `search == <entire file contents>, replace == ""`. That's serviceable for small files; revisit if we hit a case where it isn't.

## 4. Three options per finding = three rows, not one model with `list[Proposal]`

The Pydantic model represents **one** option. The "three ranked proposals per finding" invariant lives at the DB layer as `UNIQUE(finding_id, rank)` with `rank IN (1, 2, 3)` enforced by the model's `Field(ge=1, le=3)`.

Why not `FindingWithProposals { finding: Finding, proposals: list[FixProposal] }`?

- Each proposal is generated independently from a different `FixStrategy` slot, often by separate LLM calls. Treating them as independent rows means a partial generation (two slots succeeded, one failed) is recoverable — we have two valid proposals in the DB and can retry the third — instead of either having to discard all three or build a partial-aggregate model.
- The dashboard queries `WHERE finding_id = ? ORDER BY rank` and gets exactly what it renders. No client-side flattening.
- Verification, policy gating, and user picks all operate on a single proposal. Modeling the aggregate just adds a wrapper everyone has to unwrap.

The trade-off is that "exactly three" is not a type-level invariant — it's a runtime/database invariant. The proposer must enforce it; the schema by itself does not.

## 5. `patches` is a list to allow multi-file fixes

`FixProposal.patches: list[SearchReplacePatch]` with `min_length=1`. The common case is one patch per proposal, but some fixes legitimately touch multiple files in a single logical change — e.g., `env_var` strategy for a hardcoded secret typically edits the source file *and* adds an entry to `.env.example`. Modeling `patches` as a list avoids forcing those into three separate proposals or a synthetic "fix bundle" wrapper.

Apply-time atomicity (what happens if the third patch in a list fails verification after the first two succeed) is an open question — see `schema.md` open questions. Resolve with policy-and-commit before we ship multi-patch proposals in the demo.
