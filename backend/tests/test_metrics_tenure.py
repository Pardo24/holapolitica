"""Tests for tenure-aware and role-excluding metric computations.

Covers the two changes documented in ``app/metrics/calc.py``:

1. ``compute_person_kpis`` restricts the attendance / dissidence
   denominator to votes whose ``voted_at`` falls inside the union of the
   deputy's mandate intervals, and exposes ``mandate_total_votes`` plus
   ``legislature_total_votes`` so the frontend can render a "X de Y
   votacions del seu mandat (legislatura: Z)" caveat.

2. ``compute_group_summary`` excludes role-holders
   (``Person.role_kind IS NOT NULL``) from the cohesion and attendance
   averages, while still counting them in ``members_active`` so the
   transparency floor is preserved.

Tests use a per-test in-memory SQLite engine, mirroring the pattern in
``test_groups_composition.py``.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.metrics.calc import compute_group_summary, compute_person_kpis
from app.models import (
    Chamber,
    ChamberLevel,
    GroupMembership,
    Legislature,
    LegislatureStatus,
    Mandate,
    ParliamentaryGroup,
    Person,
    Vote,
    VoteChoice,
    VoteRecord,
    VoteResult,
)
from app.models import (
    Session as SessionRow,
)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


async def _seed_scaffold(
    session: AsyncSession,
) -> tuple[Chamber, Legislature, ParliamentaryGroup]:
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        country="ES",
        level=ChamberLevel.NATIONAL,
    )
    session.add(chamber)
    await session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status=LegislatureStatus.ACTIVE,
    )
    session.add(leg)
    await session.flush()
    group = ParliamentaryGroup(
        legislature_id=leg.id,
        slug="gp-socialista",
        name_short="GP Socialista",
        name_long="Grupo Parlamentario Socialista",
        color_hex="#dc2626",
    )
    session.add(group)
    await session.flush()
    return chamber, leg, group


async def _add_vote(
    session: AsyncSession,
    *,
    chamber: Chamber,
    leg: Legislature,
    voted_at: datetime,
) -> Vote:
    """Create a Session + Vote pair on the given date and return the Vote."""
    sess = SessionRow(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        date=voted_at.date(),
    )
    session.add(sess)
    await session.flush()
    vote = Vote(
        session_id=sess.id,
        title="Test vote",
        voted_at=voted_at,
        result=VoteResult.APPROVED,
    )
    session.add(vote)
    await session.flush()
    return vote


async def _add_deputy(
    session: AsyncSession,
    *,
    chamber: Chamber,
    leg: Legislature,
    group: ParliamentaryGroup,
    full_name: str,
    mandate_start: date,
    mandate_end: date | None = None,
    role_kind: str | None = None,
) -> Mandate:
    """Create a Person + Mandate + open GroupMembership."""
    person = Person(full_name=full_name, role_kind=role_kind)
    session.add(person)
    await session.flush()
    mandate = Mandate(
        person_id=person.id,
        chamber_id=chamber.id,
        legislature_id=leg.id,
        start_date=mandate_start,
        end_date=mandate_end,
    )
    session.add(mandate)
    await session.flush()
    session.add(
        GroupMembership(
            mandate_id=mandate.id,
            group_id=group.id,
            start_date=mandate_start,
            end_date=mandate_end,
        )
    )
    await session.flush()
    return mandate


# SQLite (used by these tests) does not auto-increment ``BigInteger``
# primary keys the way Postgres does. We hand-roll an id sequence so the
# tests can ``session.add(VoteRecord(...))`` without hitting NOT NULL.
_NEXT_RECORD_ID = {"value": 1}


async def _cast(
    session: AsyncSession,
    *,
    vote: Vote,
    mandate: Mandate,
    group: ParliamentaryGroup,
    choice: VoteChoice,
) -> None:
    record_id = _NEXT_RECORD_ID["value"]
    _NEXT_RECORD_ID["value"] += 1
    session.add(
        VoteRecord(
            id=record_id,
            vote_id=vote.id,
            mandate_id=mandate.id,
            choice=choice,
            group_id_at_time=group.id,
        )
    )
    await session.flush()


# ---------------------------------------------------------------------------
# Task 1 — tenure-aware compute_person_kpis
# ---------------------------------------------------------------------------


async def test_person_kpis_denominator_is_mandate_interval_not_legislature(
    db_session: AsyncSession,
) -> None:
    """A substitute deputy who entered mid-legislature is measured against
    the votes during their tenure, not the full legislature.

    Setup: 4 votes total in the legislature. Substitute's mandate starts
    on vote #3, so only votes 3+4 are in their window. They cast both.
    Attendance must be 2/2 = 100%, and ``mandate_total_votes`` = 2 while
    ``legislature_total_votes`` = 4.
    """
    chamber, leg, group = await _seed_scaffold(db_session)
    # Four votes spread across the legislature.
    v1 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 1, 10, 12, tzinfo=UTC)
    )
    v2 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 2, 10, 12, tzinfo=UTC)
    )
    v3 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 6, 10, 12, tzinfo=UTC)
    )
    v4 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 7, 10, 12, tzinfo=UTC)
    )

    # Substitute joined on 2024-05-01 — only v3, v4 in window.
    substitute = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Substitute Member",
        mandate_start=date(2024, 5, 1),
    )
    # A regular full-term member, so the group has a majority on every vote.
    full_term = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Full Term Member",
        mandate_start=date(2023, 8, 17),
    )

    # Substitute casts on v3 and v4.
    await _cast(db_session, vote=v3, mandate=substitute, group=group, choice=VoteChoice.AYE)
    await _cast(db_session, vote=v4, mandate=substitute, group=group, choice=VoteChoice.AYE)
    # Full-term member casts on all four to anchor a group majority.
    for v in (v1, v2, v3, v4):
        await _cast(db_session, vote=v, mandate=full_term, group=group, choice=VoteChoice.AYE)
    await db_session.commit()

    kpis = await compute_person_kpis(db_session, person_id=substitute.person_id)

    assert kpis.mandate_total_votes == 2, "Only votes inside the mandate window count"
    assert kpis.legislature_total_votes == 4, "Context is the full legislature"
    assert kpis.votes_cast == 2
    assert kpis.attendance_pct == 1.0, "100% — substitute attended every vote since joining"
    # Both their votes matched the (Aye) majority → 0 dissents.
    assert kpis.dissents == 0
    assert kpis.dissidence_pct == 0.0


async def test_person_kpis_handles_open_ended_mandate(
    db_session: AsyncSession,
) -> None:
    """A mandate with NULL ``end_date`` is treated as still active —
    every vote from ``start_date`` onward counts. Defensive test against
    a regression where ``end_date IS NULL`` would short-circuit the
    interval check.
    """
    chamber, leg, group = await _seed_scaffold(db_session)
    v1 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 1, 10, 12, tzinfo=UTC)
    )
    v2 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2025, 1, 10, 12, tzinfo=UTC)
    )

    member = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Active Member",
        mandate_start=date(2023, 8, 17),
        mandate_end=None,  # still active
    )
    await _cast(db_session, vote=v1, mandate=member, group=group, choice=VoteChoice.AYE)
    await _cast(db_session, vote=v2, mandate=member, group=group, choice=VoteChoice.NO)
    await db_session.commit()

    kpis = await compute_person_kpis(db_session, person_id=member.person_id)
    assert kpis.mandate_total_votes == 2
    assert kpis.legislature_total_votes == 2
    assert kpis.votes_cast == 2
    assert kpis.attendance_pct == 1.0


async def test_person_kpis_excludes_votes_after_resignation(
    db_session: AsyncSession,
) -> None:
    """A deputy who resigned mid-term doesn't get penalised for the votes
    that happened after their mandate ended.

    Setup: 3 votes, deputy resigned on 2024-05-01, so only v1 is in
    their window. They cast v1 but the system also (incorrectly, per
    real ingest behaviour) recorded an absent row for v3. Tenure
    filter must drop the post-end-date row from the denominator.
    """
    chamber, leg, group = await _seed_scaffold(db_session)
    v1 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 1, 10, 12, tzinfo=UTC)
    )
    # v2 happens after the mandate ends — created only to inflate the
    # legislature total, never linked to ``resigned``.
    await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 6, 10, 12, tzinfo=UTC)
    )
    v3 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 7, 10, 12, tzinfo=UTC)
    )

    resigned = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Resigned Member",
        mandate_start=date(2023, 8, 17),
        mandate_end=date(2024, 5, 1),
    )
    await _cast(db_session, vote=v1, mandate=resigned, group=group, choice=VoteChoice.AYE)
    # A stale absent row for a vote AFTER the mandate ended — must be ignored.
    await _cast(db_session, vote=v3, mandate=resigned, group=group, choice=VoteChoice.ABSENT)
    await db_session.commit()

    kpis = await compute_person_kpis(db_session, person_id=resigned.person_id)
    # Only v1 is inside [2023-08-17, 2024-05-01].
    assert kpis.mandate_total_votes == 1
    assert kpis.legislature_total_votes == 3
    # ``votes_total`` is the vote_record rows that fall in the window —
    # the stale v3 row is excluded by the tenure filter.
    assert kpis.votes_total == 1
    assert kpis.votes_cast == 1
    assert kpis.attendance_pct == 1.0


# ---------------------------------------------------------------------------
# Task 2 — compute_group_summary excludes role-holders from metric averages
# ---------------------------------------------------------------------------


async def test_group_summary_excludes_role_holders_from_attendance(
    db_session: AsyncSession,
) -> None:
    """A cabinet member (``role_kind = 'govern'``) is counted in
    ``members_active`` but excluded from the attendance + cohesion
    averages. The frontend can then surface "calculat sobre M dels N
    actius".
    """
    chamber, leg, group = await _seed_scaffold(db_session)
    v1 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 1, 10, 12, tzinfo=UTC)
    )
    v2 = await _add_vote(
        db_session, chamber=chamber, leg=leg, voted_at=datetime(2024, 2, 10, 12, tzinfo=UTC)
    )

    # Regular deputy attends both votes.
    regular = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Regular Diputat",
        mandate_start=date(2023, 8, 17),
    )
    # President of Govern: skipped both votes (ritual abstention).
    president = await _add_deputy(
        db_session,
        chamber=chamber,
        leg=leg,
        group=group,
        full_name="Pedro Sánchez",
        mandate_start=date(2023, 8, 17),
        role_kind="govern",
    )

    for v in (v1, v2):
        await _cast(db_session, vote=v, mandate=regular, group=group, choice=VoteChoice.AYE)
        # The president has rows but they're NO_VOTE_RECORDED — would
        # normally drag the group's attendance to 50%.
        await _cast(
            db_session, vote=v, mandate=president, group=group, choice=VoteChoice.NO_VOTE_RECORDED
        )
    await db_session.commit()

    summary = await compute_group_summary(db_session, legislature_id=leg.id)
    assert len(summary) == 1
    row = summary[0]
    assert row.group_slug == "gp-socialista"
    # Transparency: every open mandate is in ``members_active``.
    assert row.members_active == 2
    # Metric subset: the president is excluded.
    assert row.members_in_metric == 1
    # Without the exclusion, attendance would be 2 / 4 = 50%. With the
    # exclusion, only the regular deputy's 2 / 2 = 100% counts.
    assert row.avg_attendance == 1.0
    # Cohesion is undefined when only one member is left contributing →
    # 1.0 (single voter = perfect unanimity by definition).
    assert row.avg_cohesion == 1.0
