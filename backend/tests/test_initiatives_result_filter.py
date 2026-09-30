"""The laws list filters by OUTCOME, and by several outcomes at once.

"Approved or rejected" is one question — what has the chamber actually
settled? — and a single-value filter could not ask it. The filter also has
to keep reading the LATEST vote of each initiative: a bill voted in parts is
judged by its final vote, not by an amendment along the way.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import list_initiatives
from app.models import Base, Chamber, Initiative, Legislature, Vote
from app.models import Session as SessionRow

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        chamber = Chamber(
            id=1,
            slug="es-congreso",
            name_ca="Congrés",
            name_es="Congreso",
            name_en="Congress",
            level="national",
        )
        leg = Legislature(
            id=1,
            chamber_id=1,
            number="XV",
            name_ca="XV",
            name_es="XV",
            name_en="XV",
            start_date=date(2023, 8, 17),
            status="active",
        )
        sess = SessionRow(id=1, chamber_id=1, legislature_id=1, date=date(2026, 1, 1))
        s.add_all([chamber, leg, sess])
        await s.flush()

        # One initiative per outcome, plus one with no vote at all.
        for iid, official, result in (
            (1, "121/000001/0000", "approved"),
            (2, "121/000002/0000", "rejected"),
        ):
            s.add(
                Initiative(
                    id=iid,
                    chamber_id=1,
                    legislature_id=1,
                    type="proyecto_ley",
                    official_id=official,
                    title_original=f"Proyecto de Ley {iid}",
                    status="in_debate",
                )
            )
            s.add(
                Vote(
                    id=iid,
                    session_id=1,
                    initiative_id=iid,
                    title=f"Votación {iid}",
                    voted_at=datetime(2026, 1, 1, 12, tzinfo=UTC),
                    result=result,
                    ayes=1,
                    noes=0,
                    abstentions=0,
                    absent=0,
                )
            )
        s.add(
            Initiative(
                id=3,
                chamber_id=1,
                legislature_id=1,
                type="proyecto_ley",
                official_id="121/000003/0000",
                title_original="Proyecto de Ley 3",
                status="in_debate",
            )
        )
        await s.commit()
        yield s
    await engine.dispose()


async def _ids(session: AsyncSession, result: str | None) -> set[int]:
    # Called directly, so every comma-separated parameter has to be passed:
    # unset ones would arrive as FastAPI's Query object, not as None.
    page = await list_initiatives(
        legislature_id=1,
        chamber_id=None,
        creates_law=True,
        initiative_type=None,
        status_filter=None,
        result=result,
        topic_slug=None,
        proposing_group_slug=None,
        audience=None,
        q=None,
        page=1,
        page_size=50,
        session=session,
    )
    return {item["id"] for item in page["items"]}


async def test_one_outcome(session: AsyncSession) -> None:
    assert await _ids(session, "approved") == {1}
    assert await _ids(session, "rejected") == {2}
    # No decisive vote yet.
    assert await _ids(session, "pending") == {3}


async def test_several_outcomes_are_or_ed(session: AsyncSession) -> None:
    assert await _ids(session, "approved,rejected") == {1, 2}
    assert await _ids(session, "approved,pending") == {1, 3}
    assert await _ids(session, "approved,rejected,pending") == {1, 2, 3}


async def test_no_filter_and_junk_values(session: AsyncSession) -> None:
    assert await _ids(session, None) == {1, 2, 3}
    # A value that is not an outcome filters nothing rather than everything.
    assert await _ids(session, "sandwich") == {1, 2, 3}
