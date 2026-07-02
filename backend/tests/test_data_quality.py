"""Tests for the post-ingest data-quality invariant checks.

Each test seeds an in-memory DB with one deliberate violation and
asserts the corresponding check flags it (and that a clean DB passes).
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

import app.ingest.quality as quality
from app.ingest.quality import run_data_quality_checks
from app.models import (
    Base,
    Chamber,
    GroupMembership,
    Initiative,
    Legislature,
    Mandate,
    ParliamentaryGroup,
    Person,
    Vote,
)
from app.models import Session as SessionRow

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def _seed(session: AsyncSession) -> tuple[Chamber, Legislature, Legislature]:
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        level="national",
    )
    session.add(chamber)
    await session.flush()
    active = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status="active",
    )
    old = Legislature(
        chamber_id=chamber.id,
        number="XIV",
        name_ca="XIV",
        name_es="XIV",
        name_en="XIV",
        start_date=date(2019, 12, 3),
        end_date=date(2023, 8, 16),
        status="concluded",
    )
    session.add_all([active, old])
    await session.flush()
    return chamber, active, old


def _check(report: quality.DataQualityReport, name: str) -> quality.CheckResult:
    match = [c for c in report.checks if c.name == name]
    assert match, f"check {name!r} not in report: {[c.name for c in report.checks]}"
    return match[0]


async def test_clean_database_passes(db_session: AsyncSession) -> None:
    await _seed(db_session)
    report = await run_data_quality_checks(db_session)
    assert report.ok


async def test_too_many_open_mandates_flagged(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Chamber "capacity" of 1 for the test, then two open mandates.
    monkeypatch.setattr(quality, "CHAMBER_SEATS", 1)
    chamber, active, _ = await _seed(db_session)
    for name in ["Ana García", "Marc López"]:
        p = Person(full_name=name)
        db_session.add(p)
        await db_session.flush()
        db_session.add(
            Mandate(
                person_id=p.id,
                chamber_id=chamber.id,
                legislature_id=active.id,
                start_date=date(2023, 8, 17),
            )
        )
    await db_session.flush()

    report = await run_data_quality_checks(db_session)
    result = _check(report, "open_mandates:XV")
    assert not result.ok
    assert result.violations == 1  # one seat over capacity


async def test_cross_legislature_link_flagged(db_session: AsyncSession) -> None:
    chamber, active, old = await _seed(db_session)
    initiative = Initiative(
        chamber_id=chamber.id,
        legislature_id=old.id,
        official_id="121/000001",
        type="proyecto_ley",
        title_original="Ley antigua",
        status="submitted",
    )
    sess = SessionRow(chamber_id=chamber.id, legislature_id=active.id, date=date(2026, 6, 25))
    db_session.add_all([initiative, sess])
    await db_session.flush()
    db_session.add(
        Vote(
            session_id=sess.id,
            initiative_id=initiative.id,
            title="V1",
            voted_at=datetime(2026, 6, 25, 12, 0, tzinfo=UTC),
            result="approved",
            ayes=200,
            noes=100,
            abstentions=25,
            absent=25,
        )
    )
    await db_session.flush()

    report = await run_data_quality_checks(db_session)
    result = _check(report, "cross_legislature_links")
    assert not result.ok
    assert result.violations == 1


async def test_bogus_vote_totals_flagged(db_session: AsyncSession) -> None:
    chamber, active, _ = await _seed(db_session)
    sess = SessionRow(chamber_id=chamber.id, legislature_id=active.id, date=date(2026, 6, 25))
    db_session.add(sess)
    await db_session.flush()
    db_session.add_all(
        [
            # Over capacity.
            Vote(
                session_id=sess.id,
                title="V1",
                voted_at=datetime(2026, 6, 25, 12, 0, tzinfo=UTC),
                result="approved",
                ayes=300,
                noes=100,
                abstentions=0,
                absent=0,
            ),
            # Zero positions without assent.
            Vote(
                session_id=sess.id,
                title="V2",
                voted_at=datetime(2026, 6, 25, 12, 5, tzinfo=UTC),
                result="approved",
                ayes=0,
                noes=0,
                abstentions=0,
                absent=0,
            ),
            # Zero positions WITH assent — legitimate, must not flag.
            Vote(
                session_id=sess.id,
                title="V3",
                voted_at=datetime(2026, 6, 25, 12, 10, tzinfo=UTC),
                result="approved",
                ayes=0,
                noes=0,
                abstentions=0,
                absent=0,
                approved_by_assent=True,
            ),
        ]
    )
    await db_session.flush()

    report = await run_data_quality_checks(db_session)
    result = _check(report, "vote_totals")
    assert not result.ok
    assert result.violations == 2


async def test_duplicate_votes_flagged(db_session: AsyncSession) -> None:
    chamber, active, _ = await _seed(db_session)
    sess = SessionRow(chamber_id=chamber.id, legislature_id=active.id, date=date(2026, 6, 25))
    db_session.add(sess)
    await db_session.flush()
    for i in range(2):
        db_session.add(
            Vote(
                session_id=sess.id,
                sequence_in_session=7,
                title=f"V{i}",
                voted_at=datetime(2026, 6, 25, 12, i, tzinfo=UTC),
                result="approved",
                ayes=200,
                noes=100,
                abstentions=25,
                absent=25,
            )
        )
    await db_session.flush()

    report = await run_data_quality_checks(db_session)
    result = _check(report, "duplicate_votes")
    assert not result.ok
    assert result.violations == 1


async def test_multiple_open_memberships_flagged(db_session: AsyncSession) -> None:
    chamber, active, _ = await _seed(db_session)
    p = Person(full_name="Ana García")
    g1 = ParliamentaryGroup(legislature_id=active.id, slug="gp-a", name_short="A", name_long="A")
    g2 = ParliamentaryGroup(legislature_id=active.id, slug="gp-b", name_short="B", name_long="B")
    db_session.add_all([p, g1, g2])
    await db_session.flush()
    m = Mandate(
        person_id=p.id,
        chamber_id=chamber.id,
        legislature_id=active.id,
        start_date=date(2023, 8, 17),
    )
    db_session.add(m)
    await db_session.flush()
    db_session.add_all(
        [
            GroupMembership(mandate_id=m.id, group_id=g1.id, start_date=date(2023, 8, 17)),
            GroupMembership(mandate_id=m.id, group_id=g2.id, start_date=date(2024, 1, 1)),
        ]
    )
    await db_session.flush()

    report = await run_data_quality_checks(db_session)
    result = _check(report, "multiple_open_memberships")
    assert not result.ok
    assert result.violations == 1
