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
            "Convert the f-string SQL into a parameterized query using the "
            "DB-API '?' placeholder style. The replace_block must call "
            "db.execute(query, (email,)) with the query as a constant string "
            "containing a '?' placeholder where {email} was. Preserve the "
            ".fetchone() result bound to row and the following if not row: "
            "branch exactly. Do not introduce new imports — the existing db "
            "object already supports parameter binding."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.INPUT_ALLOWLIST,
        description="Reject the request before the SQL call unless input matches an allowlist.",
        prompt_hint=(
            "Insert an email-format validation step immediately before the SQL "
            "call. Use re.fullmatch() against a strict pattern (letters, "
            "digits, dots, hyphens, plus, underscore in the local part; "
            "dotted domain, 2+ char TLD). On mismatch, raise "
            "ValueError('invalid email') so the caller's existing error path "
            "handles it. Leave the original f-string SQL line and .fetchone() "
            "call unchanged after the check. If re is not visible in the file "
            "context shown, include import re at the top of the replace_block "
            "and call out the import addition in tradeoffs."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.PREPARED_STATEMENT,
        description="Use the DB driver's prepared-statement API to pre-compile the query and bind parameters at execute time.",
        prompt_hint=(
            "Use the DB driver's prepared-statement API: call db.prepare("
            "query) with the parameterized SQL string, then execute the "
            "prepared statement with (email,) as the parameter tuple. Bind "
            "the result to row and preserve the if not row: branch exactly. "
            "If the existing db object does not expose .prepare(), call this "
            "limitation out in tradeoffs and fall back to the "
            "parameterize_query pattern's db.execute(query, (email,)) form — "
            "pick whichever maps cleanly to the visible db object."
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
