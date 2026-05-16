"""Tests for fix_proposals storage in shared/db.py.

Uses in-memory SQLite per test for isolation. FK enforcement is intentionally
off in init_db, so proposals can reference finding_ids that don't exist in
the findings table — that's expected and matches the test setup.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from shared.db import (
    clear_proposals,
    init_db,
    insert_proposal,
    insert_proposals,
    list_proposals,
    list_proposals_for_finding,
)
from shared.schema import (
    BreakingChangeRisk,
    FixProposal,
    FixStrategy,
    SearchReplacePatch,
)


def _make_proposal(
    *,
    proposal_id: UUID | None = None,
    finding_id: UUID,
    rank: int,
    strategy: FixStrategy = FixStrategy.PARAMETERIZE_QUERY,
    title: str = "test title",
    rationale: str = "test rationale",
    tradeoffs: str = "test tradeoffs",
    breaking_change_risk: BreakingChangeRisk = BreakingChangeRisk.LOW,
    patches: list[SearchReplacePatch] | None = None,
    created_at: datetime | None = None,
) -> FixProposal:
    return FixProposal(
        proposal_id=proposal_id or uuid4(),
        finding_id=finding_id,
        rank=rank,
        strategy=strategy,
        title=title,
        rationale=rationale,
        tradeoffs=tradeoffs,
        breaking_change_risk=breaking_change_risk,
        patches=patches or [SearchReplacePatch(file="x.py", search="bad()", replace="good()")],
        created_at=created_at,
    )


def test_insert_and_retrieve_single_proposal():
    conn = init_db(":memory:")
    finding_id = uuid4()
    proposal_id = uuid4()
    created_at = datetime(2026, 5, 16, 10, 0, 0, tzinfo=UTC)
    multiline_search = (
        "    query = f\"SELECT id FROM users WHERE email = '{email}'\"\n"
        "    row = db.execute(query).fetchone()"
    )
    multiline_replace = (
        "    query = \"SELECT id FROM users WHERE email = ?\"\n"
        "    row = db.execute(query, (email,)).fetchone()"
    )
    proposal = _make_proposal(
        proposal_id=proposal_id,
        finding_id=finding_id,
        rank=1,
        strategy=FixStrategy.PARAMETERIZE_QUERY,
        title="Use parameterized query",
        rationale="Bind email as parameter.",
        tradeoffs="No new imports.",
        breaking_change_risk=BreakingChangeRisk.MEDIUM,
        patches=[SearchReplacePatch(file="auth/login.py", search=multiline_search, replace=multiline_replace)],
        created_at=created_at,
    )

    insert_proposal(conn, proposal)
    retrieved = list_proposals_for_finding(conn, finding_id)

    assert len(retrieved) == 1
    r = retrieved[0]
    assert r.proposal_id == proposal_id
    assert r.finding_id == finding_id
    assert r.rank == 1
    assert r.strategy == FixStrategy.PARAMETERIZE_QUERY
    assert r.title == "Use parameterized query"
    assert r.rationale == "Bind email as parameter."
    assert r.tradeoffs == "No new imports."
    assert r.breaking_change_risk == BreakingChangeRisk.MEDIUM
    assert len(r.patches) == 1
    assert r.patches[0].file == "auth/login.py"
    assert r.patches[0].search == multiline_search
    assert r.patches[0].replace == multiline_replace
    assert r.created_at == created_at


def test_insert_proposals_batch_then_list_ordered_by_rank():
    conn = init_db(":memory:")
    finding_id = uuid4()
    # Insert ranks out of order to confirm ORDER BY is doing real work.
    proposals = [
        _make_proposal(finding_id=finding_id, rank=3, strategy=FixStrategy.PREPARED_STATEMENT),
        _make_proposal(finding_id=finding_id, rank=1, strategy=FixStrategy.PARAMETERIZE_QUERY),
        _make_proposal(finding_id=finding_id, rank=2, strategy=FixStrategy.INPUT_ALLOWLIST),
    ]

    insert_proposals(conn, proposals)
    retrieved = list_proposals_for_finding(conn, finding_id)

    assert [p.rank for p in retrieved] == [1, 2, 3]
    assert [p.strategy for p in retrieved] == [
        FixStrategy.PARAMETERIZE_QUERY,
        FixStrategy.INPUT_ALLOWLIST,
        FixStrategy.PREPARED_STATEMENT,
    ]


def test_insert_or_replace_overrides_on_finding_id_rank_conflict():
    conn = init_db(":memory:")
    finding_id = uuid4()
    initial = [
        _make_proposal(finding_id=finding_id, rank=1, strategy=FixStrategy.PARAMETERIZE_QUERY),
        _make_proposal(finding_id=finding_id, rank=2, strategy=FixStrategy.INPUT_ALLOWLIST),
        _make_proposal(finding_id=finding_id, rank=3, strategy=FixStrategy.PREPARED_STATEMENT),
    ]
    insert_proposals(conn, initial)

    # A "fourth" proposal at rank=1 — different proposal_id, same (finding_id, rank).
    # INSERT OR REPLACE upserts on the UNIQUE constraint: the original rank=1
    # row is deleted and replaced by this one. Total count remains 3.
    replacement = _make_proposal(
        finding_id=finding_id,
        rank=1,
        strategy=FixStrategy.OTHER,
        title="replacement at rank 1",
    )
    insert_proposal(conn, replacement)

    retrieved = list_proposals_for_finding(conn, finding_id)
    assert len(retrieved) == 3
    assert [p.rank for p in retrieved] == [1, 2, 3]
    rank_1 = next(p for p in retrieved if p.rank == 1)
    assert rank_1.proposal_id == replacement.proposal_id
    assert rank_1.strategy == FixStrategy.OTHER
    assert rank_1.title == "replacement at rank 1"


def test_clear_proposals_empties_table():
    conn = init_db(":memory:")
    finding_id = uuid4()
    insert_proposals(conn, [
        _make_proposal(finding_id=finding_id, rank=1),
        _make_proposal(finding_id=finding_id, rank=2),
    ])
    assert len(list_proposals(conn)) == 2

    clear_proposals(conn)
    assert list_proposals(conn) == []


def test_list_proposals_for_finding_empty():
    conn = init_db(":memory:")
    assert list_proposals_for_finding(conn, uuid4()) == []


def test_list_proposals_orders_by_finding_then_rank():
    conn = init_db(":memory:")
    # Construct UUIDs that lex-sort deterministically: A < B.
    finding_a = UUID("00000000-0000-0000-0000-000000000001")
    finding_b = UUID("00000000-0000-0000-0000-000000000002")
    # Insert mixed order: B-rank3, A-rank2, B-rank1, A-rank3, A-rank1, B-rank2
    insert_proposals(conn, [
        _make_proposal(finding_id=finding_b, rank=3, strategy=FixStrategy.PREPARED_STATEMENT),
        _make_proposal(finding_id=finding_a, rank=2, strategy=FixStrategy.INPUT_ALLOWLIST),
        _make_proposal(finding_id=finding_b, rank=1, strategy=FixStrategy.PARAMETERIZE_QUERY),
        _make_proposal(finding_id=finding_a, rank=3, strategy=FixStrategy.PREPARED_STATEMENT),
        _make_proposal(finding_id=finding_a, rank=1, strategy=FixStrategy.PARAMETERIZE_QUERY),
        _make_proposal(finding_id=finding_b, rank=2, strategy=FixStrategy.INPUT_ALLOWLIST),
    ])

    retrieved = list_proposals(conn)

    assert len(retrieved) == 6
    assert [(p.finding_id, p.rank) for p in retrieved] == [
        (finding_a, 1),
        (finding_a, 2),
        (finding_a, 3),
        (finding_b, 1),
        (finding_b, 2),
        (finding_b, 3),
    ]
