"""Tests for the filter-aware stats endpoints.

We exercise the in-memory helpers (``_compute_group_activity`` and
``_compute_topic_proposers``) directly against a per-test SQLite engine
rather than the FastAPI app, because the cache wrapper would otherwise
need an extra Redis fake. The cache layer itself is covered in
``test_cache.py``; here we only care about the SQL/business logic.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from typing import cast

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.api.stats import (
    _compute_cross_topic_group,
    _compute_group_activity,
    _compute_topic_proposers,
)
from app.db.base import Base
from app.models import (
    Chamber,
    ChamberLevel,
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    Legislature,
    LegislatureStatus,
    ParliamentaryGroup,
    Topic,
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
) -> tuple[Legislature, ParliamentaryGroup, ParliamentaryGroup, Topic, Topic]:
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
    psoe = ParliamentaryGroup(
        legislature_id=leg.id,
        slug="gp-socialista",
        name_short="GP Socialista",
        name_long="Grupo Parlamentario Socialista",
        color_hex="#dc2626",
    )
    pp = ParliamentaryGroup(
        legislature_id=leg.id,
        slug="gp-popular",
        name_short="GP Popular",
        name_long="Grupo Parlamentario Popular en el Congreso",
        color_hex="#2563eb",
    )
    session.add_all([psoe, pp])
    await session.flush()
    housing = Topic(
        slug="habitatge", name_ca="Habitatge", name_es="Vivienda", name_en="Housing"
    )
    labor = Topic(
        slug="drets-laborals",
        name_ca="Drets laborals",
        name_es="Derechos laborales",
        name_en="Labour rights",
    )
    session.add_all([housing, labor])
    await session.flush()
    return leg, psoe, pp, housing, labor


async def _seed_initiative(
    session: AsyncSession,
    *,
    leg: Legislature,
    chamber_id: int,
    official_id: str,
    title: str,
    submitted_by: str | None,
    itype: InitiativeType,
    submitted_at: date | None,
    topics: list[Topic],
    status: InitiativeStatus = InitiativeStatus.IN_DEBATE,
) -> Initiative:
    ini = Initiative(
        chamber_id=chamber_id,
        legislature_id=leg.id,
        type=itype,
        official_id=official_id,
        title_original=title,
        status=status,
        submitted_at=submitted_at,
        submitted_by=submitted_by,
    )
    session.add(ini)
    await session.flush()
    for t in topics:
        session.add(
            InitiativeTopic(
                initiative_id=ini.id,
                topic_id=t.id,
                confidence=0.9,
                classified_by="test",
                classified_at=datetime.now(UTC),
            )
        )
    await session.flush()
    return ini


# ---------------------------------------------------------------------------
# group activity
# ---------------------------------------------------------------------------


async def test_group_activity_recent_initiatives_in_submitted_at_order(
    db_session: AsyncSession,
) -> None:
    leg, psoe, _pp, housing, labor = await _seed_scaffold(db_session)
    # Older PSOE initiative
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000001",
        title="Older housing initiative",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2024, 1, 1),
        topics=[housing],
    )
    # Newer PSOE initiative
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000002",
        title="Newer labour initiative",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 6, 1),
        topics=[labor],
    )
    await db_session.commit()

    out = await _compute_group_activity(db_session, "gp-socialista", None)

    assert [i.official_id for i in out.recent_initiatives] == [
        "122/000002",
        "122/000001",
    ]
    # Topic distribution counts both topics.
    by_slug = {t.topic_slug: t.count for t in out.topic_distribution}
    assert by_slug == {"habitatge": 1, "drets-laborals": 1}


async def test_group_activity_unknown_slug_returns_empty(
    db_session: AsyncSession,
) -> None:
    await _seed_scaffold(db_session)
    await db_session.commit()
    out = await _compute_group_activity(db_session, "gp-nonexistent", None)
    assert out.recent_initiatives == []
    assert out.topic_distribution == []


async def test_group_activity_doesnt_leak_other_groups(
    db_session: AsyncSession,
) -> None:
    """A PSOE-only filter must NOT return PP initiatives even when they
    share the same topic. This protects against the substring heuristic
    accidentally matching another group's name."""
    leg, psoe, pp, housing, _labor = await _seed_scaffold(db_session)
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000010",
        title="PP housing",
        submitted_by="Grupo Parlamentario Popular en el Congreso",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 3, 1),
        topics=[housing],
    )
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000011",
        title="PSOE housing",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 3, 2),
        topics=[housing],
    )
    await db_session.commit()
    out = await _compute_group_activity(db_session, "gp-socialista", None)
    assert [i.official_id for i in out.recent_initiatives] == ["122/000011"]


# ---------------------------------------------------------------------------
# topic proposers
# ---------------------------------------------------------------------------


async def test_topic_proposers_counts_groups_and_government(
    db_session: AsyncSession,
) -> None:
    leg, psoe, pp, housing, _labor = await _seed_scaffold(db_session)
    # PSOE has 2 housing proposals
    for n, day in enumerate([1, 2], start=20):
        await _seed_initiative(
            db_session,
            leg=leg,
            chamber_id=cast(int, leg.chamber_id),
            official_id=f"122/00000{n}",
            title=f"PSOE housing {n}",
            submitted_by="Grupo Parlamentario Socialista",
            itype=InitiativeType.PROPOSICION_LEY,
            submitted_at=date(2025, 3, day),
            topics=[housing],
        )
    # PP has 1 housing proposal
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000030",
        title="PP housing",
        submitted_by="Grupo Parlamentario Popular en el Congreso",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 3, 3),
        topics=[housing],
    )
    # Government has 1 housing proyecto_ley
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="121/000001",
        title="Govt housing project",
        submitted_by="Gobierno",
        itype=InitiativeType.PROYECTO_LEY,
        submitted_at=date(2025, 3, 4),
        topics=[housing],
    )
    await db_session.commit()

    out = await _compute_topic_proposers(db_session, "habitatge", None)

    by_slug = {p.slug: p.count for p in out.top_proposers}
    assert by_slug == {
        "gp-socialista": 2,
        "gp-popular": 1,
        "government": 1,
    }
    # Recent initiatives are most-recent-first.
    assert out.recent_initiatives[0].official_id == "121/000001"


async def test_topic_proposers_unknown_topic_raises(db_session: AsyncSession) -> None:
    from fastapi import HTTPException

    await _seed_scaffold(db_session)
    await db_session.commit()
    with pytest.raises(HTTPException) as exc:
        await _compute_topic_proposers(db_session, "no-such-topic", None)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# cross topic × group
# ---------------------------------------------------------------------------


async def test_cross_topic_group_returns_all_groups_with_zero_padding(
    db_session: AsyncSession,
) -> None:
    """The per-group bar chart must include every parliamentary group so
    the frontend can render it without hiding any. Groups without any
    matching initiative get count=0 — never absent."""
    leg, psoe, pp, housing, _labor = await _seed_scaffold(db_session)
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000050",
        title="PSOE housing",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 5, 1),
        topics=[housing],
    )
    await db_session.commit()

    out = await _compute_cross_topic_group(db_session, "habitatge", "gp-popular", None)

    slugs = {row.slug for row in out.initiatives_on_topic_by_group}
    # Both seeded groups present, PP with zero, PSOE with one.
    assert {"gp-popular", "gp-socialista"} <= slugs
    by_slug = {row.slug: row.count for row in out.initiatives_on_topic_by_group}
    assert by_slug["gp-popular"] == 0
    assert by_slug["gp-socialista"] == 1


async def test_cross_topic_group_joint_initiatives_are_intersection(
    db_session: AsyncSession,
) -> None:
    leg, psoe, _pp, housing, labor = await _seed_scaffold(db_session)
    # Match BOTH filters: PSOE on housing.
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000100",
        title="PSOE housing match",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 1, 1),
        topics=[housing],
    )
    # Other-topic PSOE initiative — must NOT appear.
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000101",
        title="PSOE labour",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 2, 1),
        topics=[labor],
    )
    # Other-group, same topic — must NOT appear in the joint list.
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000102",
        title="PP housing",
        submitted_by="Grupo Parlamentario Popular en el Congreso",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 3, 1),
        topics=[housing],
    )
    await db_session.commit()

    out = await _compute_cross_topic_group(
        db_session, "habitatge", "gp-socialista", None
    )
    assert out.joint_initiatives_total == 1
    assert [i.official_id for i in out.joint_initiatives] == ["122/000100"]


async def test_cross_topic_group_topic_distribution_includes_focal(
    db_session: AsyncSession,
) -> None:
    """When the focal topic is outside the top-N for a group, we still
    append it so the frontend can render the highlighted bar."""
    leg, psoe, _pp, housing, labor = await _seed_scaffold(db_session)
    # PSOE has lots of labour proposals (top topic) but only one housing.
    for n in range(1, 6):
        await _seed_initiative(
            db_session,
            leg=leg,
            chamber_id=cast(int, leg.chamber_id),
            official_id=f"122/0002{n:02d}",
            title=f"PSOE labour {n}",
            submitted_by="Grupo Parlamentario Socialista",
            itype=InitiativeType.PROPOSICION_LEY,
            submitted_at=date(2025, 4, n),
            topics=[labor],
        )
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000299",
        title="PSOE housing",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 4, 30),
        topics=[housing],
    )
    await db_session.commit()

    out = await _compute_cross_topic_group(
        db_session, "habitatge", "gp-socialista", None
    )
    slugs = [r.topic_slug for r in out.topic_distribution_for_group]
    assert "habitatge" in slugs
    assert "drets-laborals" in slugs


async def test_cross_topic_group_unknown_topic_raises(
    db_session: AsyncSession,
) -> None:
    from fastapi import HTTPException

    await _seed_scaffold(db_session)
    await db_session.commit()
    with pytest.raises(HTTPException) as exc:
        await _compute_cross_topic_group(
            db_session, "no-such-topic", "gp-popular", None
        )
    assert exc.value.status_code == 404


async def test_cross_topic_group_unknown_group_returns_empty_joint(
    db_session: AsyncSession,
) -> None:
    """Unknown group slug must not 404 — the page sends user input
    straight from URL params and we degrade gracefully."""
    leg, psoe, _pp, housing, _labor = await _seed_scaffold(db_session)
    await _seed_initiative(
        db_session,
        leg=leg,
        chamber_id=cast(int, leg.chamber_id),
        official_id="122/000300",
        title="PSOE housing",
        submitted_by="Grupo Parlamentario Socialista",
        itype=InitiativeType.PROPOSICION_LEY,
        submitted_at=date(2025, 5, 1),
        topics=[housing],
    )
    await db_session.commit()

    out = await _compute_cross_topic_group(
        db_session, "habitatge", "gp-nonexistent", None
    )
    assert out.joint_initiatives == []
    assert out.joint_initiatives_total == 0
    # Bar chart still includes every real group with their counts.
    assert any(r.slug == "gp-socialista" and r.count == 1 for r in out.initiatives_on_topic_by_group)
