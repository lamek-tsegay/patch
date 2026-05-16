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
            "Use the DB driver's prepared-statement API explicitly: introduce "
            "a stmt = db.prepare(query) call with the parameterized SQL string "
            "as input, then execute the prepared statement via "
            "row = stmt.execute((email,)).fetchone(). This MUST be "
            "structurally distinct from rank 1's db.execute(query, (email,)) "
            "pattern — the demo needs three visibly different fixes. If the "
            "finding doesn't show a db.prepare API in scope, your replace_block "
            "should still introduce the prepare pattern and call out in "
            "tradeoffs that the project's db object will need a .prepare() "
            "method added (breaking_change_risk: medium)."
        ),
    ),
)


_WEAK_CRYPTO_SLOTS: tuple[StrategySlot, StrategySlot, StrategySlot] = (
    StrategySlot(
        strategy=FixStrategy.UPGRADE_ALGORITHM,
        description="Replace the weak hashing algorithm with a modern password-hashing function (bcrypt for passwords, sha256/blake2b for integrity).",
        prompt_hint=(
            "Replace the weak hashing algorithm with a modern password-hashing "
            "function. For password storage, use bcrypt via the `bcrypt` library "
            "(already in many Python projects) — generate a salt and use "
            "bcrypt.hashpw. For non-password integrity hashing, use hashlib.sha256 "
            "or hashlib.blake2b. Do not preserve the weak algorithm anywhere in "
            "the replace_block. If bcrypt or argon2 isn't already imported, "
            "include the import in replace_block and call out the new dependency "
            "in tradeoffs."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.USE_KDF,
        description="Replace direct hashing with a proper key derivation function (PBKDF2 with high iteration count and per-record salt).",
        prompt_hint=(
            "Replace direct hashing with a proper key derivation function. Use "
            "hashlib.pbkdf2_hmac with sha256, a per-record salt of 16+ bytes, "
            "and at least 600000 iterations (OWASP 2024 recommendation). The "
            "replace_block must produce a stored value that includes the salt "
            "alongside the derived key so verification is possible. If the "
            "original code stored only the hash, this is a schema-level change "
            "— flag it in tradeoffs."
        ),
    ),
    StrategySlot(
        strategy=FixStrategy.OTHER,
        description="Delegate password handling to a vetted library (passlib's CryptContext with bcrypt scheme).",
        prompt_hint=(
            "Delegate password handling entirely to a vetted library: replace "
            "the custom hashing with passlib's CryptContext using 'bcrypt' as "
            "the scheme. The replace_block should construct a CryptContext at "
            "module scope and use ctx.hash() / ctx.verify() in place of the "
            "original calls. Note in tradeoffs that this introduces passlib as "
            "a dependency and is the most idiomatic option for production Flask "
            "apps."
        ),
    ),
)


STRATEGY_SLOTS: dict[Category, tuple[StrategySlot, ...]] = {
    Category.SQL_INJECTION: _SQL_INJECTION_SLOTS,
    Category.WEAK_CRYPTO: _WEAK_CRYPTO_SLOTS,
}


def get_slots(category: Category) -> tuple[StrategySlot, ...]:
    if category not in STRATEGY_SLOTS:
        raise NotImplementedError(
            f"strategy slots for {category.value} are not implemented yet"
        )
    return STRATEGY_SLOTS[category]
