"""Strategy slots — three remediation slots per Finding.category.

Per CLAUDE.md: do not freestyle three fixes. For each category, pre-define
three strategy slots and prompt for one fix per slot. Only sql_injection is
wired up in this PR; other categories raise NotImplementedError on lookup.
"""

from __future__ import annotations

from dataclasses import dataclass

from shared.schema import Category, FixStrategy


@dataclass(frozen=True)
class StrategySlot:
    strategy: FixStrategy
    description: str   # one-sentence definition Nemotron sees in the prompt
    prompt_hint: str   # slot-specific instruction appended to the user prompt


_SQL_INJECTION_SLOTS: tuple[StrategySlot, StrategySlot, StrategySlot] = (
    StrategySlot(
        strategy=FixStrategy.PARAMETERIZE_QUERY,
        description="Replace string interpolation with a parameterized query so the driver handles escaping.",
        prompt_hint=(
            "Rewrite the vulnerable SQL call to use a parameterized query. "
            "The replace_block must use placeholders (e.g. '?' or ':name') "
            "and pass user input as a separate argument tuple or dict. Do not "
            "concatenate or f-string user input into the SQL text."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.INPUT_ALLOWLIST,
        description="Reject the request before the SQL call unless input matches an allowlist.",
        prompt_hint=(
            "Insert an explicit allowlist check (regex or set membership) on "
            "the user-supplied value immediately before the SQL call. On "
            "mismatch, return an error response. Leave the original SQL alone."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.ORM_MIGRATION,
        description="Replace the raw SQL with an ORM call that emits parameterized SQL.",
        prompt_hint=(
            "Replace the raw SQL with an equivalent ORM call (e.g. SQLAlchemy "
            "session.query / select with bound params). Preserve return "
            "semantics so callers do not need to change."
        ),
    ),
)


STRATEGY_SLOTS: dict[Category, tuple[StrategySlot, ...]] = {
    Category.SQL_INJECTION: _SQL_INJECTION_SLOTS,
}


def get_slots(category: Category) -> tuple[StrategySlot, ...]:
    if category not in STRATEGY_SLOTS:
        raise NotImplementedError(
            f"strategy slots for {category.value} are not implemented yet"
        )
    return STRATEGY_SLOTS[category]
