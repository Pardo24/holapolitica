"""Regression test for the per-vote hemicycle computation.

The endpoint 500'd in production because ``VoteRecord.choice`` comes back
from a Core SELECT as a plain ``str`` (the column is a String holding
VoteChoice values), and the code called ``.value`` on it. This test runs
the real computation against an in-memory DB so the str-vs-enum shape is
exactly what production sees.
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

from app.api.votes import _compute_vote_hemicycle
from app.models import (
    Base,
    Chamber,
    Legislature,
    Mandate,
    Person,
    Session,
    Vote,
    VoteRecord,
)

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


async def test_vote_hemicycle_resolves_string_choices(db_session: AsyncSession) -> None:
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        level="national",
    )
    db_session.add(chamber)
    await db_session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status="active",
    )
    db_session.add(leg)
    await db_session.flush()

    voter = Person(full_name="Ana García Pérez", seat_x=100, seat_y=100)
    absentee = Person(full_name="Marc López Ruiz", seat_x=200, seat_y=200)
    db_session.add_all([voter, absentee])
    await db_session.flush()
    m1 = Mandate(
        person_id=voter.id,
        chamber_id=chamber.id,
        legislature_id=leg.id,
        start_date=date(2023, 8, 17),
    )
    m2 = Mandate(
        person_id=absentee.id,
        chamber_id=chamber.id,
        legislature_id=leg.id,
        start_date=date(2023, 8, 17),
    )
    db_session.add_all([m1, m2])
    await db_session.flush()

    sess = Session(chamber_id=chamber.id, legislature_id=leg.id, date=date(2026, 6, 25))
    db_session.add(sess)
    await db_session.flush()
    vote = Vote(
        session_id=sess.id,
        title="Votación 1",
        voted_at=datetime(2026, 6, 25, 12, 0, tzinfo=UTC),
        result="approved",
        ayes=1,
        noes=0,
        abstentions=0,
        absent=1,
    )
    db_session.add(vote)
    await db_session.flush()
    # Explicit id: BigInteger PKs don't autoincrement on SQLite.
    db_session.add(VoteRecord(id=1, vote_id=vote.id, mandate_id=m1.id, choice="aye"))
    await db_session.commit()

    layout = await _compute_vote_hemicycle(db_session, vote.id)

    choices = {s.full_name: s.vote_choice for s in layout.seats}
    assert choices["Ana García Pérez"] == "aye"
    # No VoteRecord row → folded into "absent", never a crash.
    assert choices["Marc López Ruiz"] == "absent"
