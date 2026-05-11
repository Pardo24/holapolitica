"""Tests for the ``/groups/{slug}/composition`` endpoint.

Strategy mirrors ``test_stats_filters.py``: hit the in-memory helper
``_compute_group_composition`` directly against a per-test SQLite
engine. The cache wrapper is covered separately in ``test_cache.py``
so we don't need a Redis fake here.

What we assert:

- Gender histogram is symmetric — every bucket (F/M/X/unknown) is
  always present, even when zero.
- Age buckets are calculated against the reference date, and all six
  buckets are always present.
- Coalition party labels are split into their constituent parties and
  de-duplicated case-insensitively.
- Unknown slugs raise 404, matching the rest of the groups router.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.api.groups import _compute_group_composition
from app.db.base import Base
from app.models import (
    Chamber,
    ChamberLevel,
    GroupMembership,
    Legislature,
    LegislatureStatus,
    Mandate,
    ParliamentaryGroup,
    Person,
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
        slug="gp-popular",
        name_short="GP Popular",
        name_long="Grupo Parlamentario Popular en el Congreso",
        color_hex="#2563eb",
    )
    session.add(group)
    await session.flush()
    return chamber, leg, group


async def _add_member(
    session: AsyncSession,
    *,
    chamber: Chamber,
    legislature: Legislature,
    group: ParliamentaryGroup,
    full_name: str,
    gender: str | None,
    birth_year: int | None,
    electoral_list_party: str | None,
    membership_end: date | None = None,
) -> None:
    person = Person(
        full_name=full_name,
        gender=gender,
        birth_year=birth_year,
    )
    session.add(person)
    await session.flush()
    mandate = Mandate(
        person_id=person.id,
        chamber_id=chamber.id,
        legislature_id=legislature.id,
        start_date=date(2023, 8, 17),
        electoral_list_party=electoral_list_party,
    )
    session.add(mandate)
    await session.flush()
    session.add(
        GroupMembership(
            mandate_id=mandate.id,
            group_id=group.id,
            start_date=date(2023, 8, 17),
            end_date=membership_end,
        )
    )
    await session.flush()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_composition_keeps_all_buckets_even_when_zero(
    db_session: AsyncSession,
) -> None:
    """Symmetry rule: every gender + age bucket must be present in the
    response, defaulting to 0. Hiding empty buckets would be editorial."""
    chamber, leg, group = await _seed_scaffold(db_session)
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Alice Example",
        gender="F",
        birth_year=1980,
        electoral_list_party="PP",
    )
    await db_session.commit()

    out = await _compute_group_composition(db_session, "gp-popular", date(2026, 5, 11))

    # All four gender buckets present, only F populated.
    assert out.gender_distribution == {"F": 1, "M": 0, "X": 0, "unknown": 0}
    # All six age buckets present, only 40-49 populated (1980 → 46 in 2026).
    assert set(out.age_buckets) == {"<30", "30-39", "40-49", "50-59", "60+", "unknown"}
    assert out.age_buckets["40-49"] == 1
    assert sum(out.age_buckets.values()) == 1
    assert out.members_total == 1


async def test_composition_buckets_ages_correctly(db_session: AsyncSession) -> None:
    chamber, leg, group = await _seed_scaffold(db_session)
    # Reference date: 2026-05-11. Birth years chosen for one per bucket.
    fixtures = [
        ("Y20s", "F", 2000),  # 26 → <30
        ("Y30s", "M", 1990),  # 36 → 30-39
        ("Y40s", "F", 1980),  # 46 → 40-49
        ("Y50s", "M", 1970),  # 56 → 50-59
        ("Y60s", "F", 1960),  # 66 → 60+
        ("Yunk", "X", None),  # unknown
    ]
    for name, gender, year in fixtures:
        await _add_member(
            db_session,
            chamber=chamber,
            legislature=leg,
            group=group,
            full_name=name,
            gender=gender,
            birth_year=year,
            electoral_list_party=None,
        )
    await db_session.commit()

    out = await _compute_group_composition(db_session, "gp-popular", date(2026, 5, 11))

    assert out.age_buckets == {
        "<30": 1,
        "30-39": 1,
        "40-49": 1,
        "50-59": 1,
        "60+": 1,
        "unknown": 1,
    }
    assert out.gender_distribution == {"F": 3, "M": 2, "X": 1, "unknown": 0}
    assert out.members_total == 6


async def test_composition_splits_coalition_party_strings(
    db_session: AsyncSession,
) -> None:
    """A coalition like ``SUMAR-IU-MÁS MADRID`` contributes 1 to each
    component. De-dup is case-insensitive."""
    chamber, leg, group = await _seed_scaffold(db_session)
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Coalition Person",
        gender="F",
        birth_year=1985,
        electoral_list_party="SUMAR-IU-MÁS MADRID",
    )
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Plain PP Person",
        gender="M",
        birth_year=1975,
        electoral_list_party="PP",
    )
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Same Coalition",
        gender="M",
        birth_year=1965,
        electoral_list_party="Sumar-IU-Más Madrid",  # different case
    )
    await db_session.commit()

    out = await _compute_group_composition(db_session, "gp-popular", date(2026, 5, 11))

    by_name = {p.name: p.count for p in out.member_parties}
    # 2 members contributed to each of the three coalition parties; PP
    # only counts once. Case-insensitive de-dup keeps "SUMAR" as the
    # first-seen casing.
    assert by_name == {"SUMAR": 2, "IU": 2, "MÁS MADRID": 2, "PP": 1}
    # Sort: count desc, name asc — so SUMAR/IU/MÁS MADRID precede PP.
    assert [p.name for p in out.member_parties][-1] == "PP"


async def test_composition_ignores_closed_memberships(
    db_session: AsyncSession,
) -> None:
    """A deputy who switched groups (membership has end_date) must not
    be counted in the current group's composition."""
    chamber, leg, group = await _seed_scaffold(db_session)
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Stayed",
        gender="F",
        birth_year=1980,
        electoral_list_party="PP",
    )
    await _add_member(
        db_session,
        chamber=chamber,
        legislature=leg,
        group=group,
        full_name="Left the group",
        gender="M",
        birth_year=1970,
        electoral_list_party="PP",
        membership_end=date(2024, 6, 1),
    )
    await db_session.commit()

    out = await _compute_group_composition(db_session, "gp-popular", date(2026, 5, 11))

    assert out.members_total == 1
    assert out.gender_distribution == {"F": 1, "M": 0, "X": 0, "unknown": 0}


async def test_composition_unknown_slug_raises_404(
    db_session: AsyncSession,
) -> None:
    await _seed_scaffold(db_session)
    await db_session.commit()
    with pytest.raises(HTTPException) as exc:
        await _compute_group_composition(db_session, "gp-nonexistent", date(2026, 5, 11))
    assert exc.value.status_code == 404
