"""The laws list can be ordered by its latest vote: newest, or closest.

"What has just been voted" and "which votes were close" are two of the
questions the phone's laws lens offers. Both read the LATEST vote of each
initiative, both keep only voted initiatives, and "close" leaves out votes
carried by assent: they have no tally, and a margin of zero would put them
first as the closest votes of all, which is the opposite of true.
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

        # (id, voted day, ayes, noes, by assent); 3 is never voted.
        rows = (
            (1, 1, 300, 20, False),
            (2, 2, 171, 169, False),
            (4, 3, 0, 0, True),
        )
        for iid in (1, 2, 3, 4):
            s.add(
                Initiative(
                    id=iid,
                    chamber_id=1,
                    legislature_id=1,
                    type="proyecto_ley",
                    official_id=f"121/00000{iid}/0000",
                    title_original=f"Proyecto de Ley {iid}",
                    status="in_debate",
                )
            )
        for iid, day, ayes, noes, assent in rows:
            s.add(
                Vote(
                    id=iid,
                    session_id=1,
                    initiative_id=iid,
                    title=f"Votación {iid}",
                    voted_at=datetime(2026, 1, day, 12, tzinfo=UTC),
                    result="approved",
                    ayes=ayes,
                    noes=noes,
                    abstentions=0,
                    absent=0,
                    approved_by_assent=assent,
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


async def _ids(session: AsyncSession, sort: str) -> list[int]:
    # Called directly, so every parameter has to be passed: unset ones would
    # arrive as FastAPI's Query object, not as None.
    page = await list_initiatives(
        legislature_id=1,
        chamber_id=None,
        creates_law=True,
        initiative_type=None,
        status_filter=None,
        result=None,
        topic_slug=None,
        proposing_group_slug=None,
        audience=None,
        q=None,
        ids=None,
        sort=sort,
        page=1,
        page_size=50,
        session=session,
    )
    return [item["id"] for item in page["items"]]


async def test_voted_is_latest_vote_first_and_voted_only(session: AsyncSession) -> None:
    assert await _ids(session, "voted") == [4, 2, 1]


async def test_close_is_narrowest_margin_first_without_assent(session: AsyncSession) -> None:
    assert await _ids(session, "close") == [2, 1]


async def test_recent_and_junk_keep_everything(session: AsyncSession) -> None:
    assert set(await _ids(session, "recent")) == {1, 2, 3, 4}
    assert set(await _ids(session, "sandwich")) == {1, 2, 3, 4}


async def test_ids_returns_just_those(session: AsyncSession) -> None:
    page = await list_initiatives(
        legislature_id=None,
        chamber_id=None,
        creates_law=None,
        initiative_type=None,
        status_filter=None,
        result=None,
        topic_slug=None,
        proposing_group_slug=None,
        audience=None,
        q=None,
        ids="2,3,x",
        sort="recent",
        page=1,
        page_size=50,
        session=session,
    )
    assert {item["id"] for item in page["items"]} == {2, 3}
    assert (
        page["items"][0]["latest_vote"] is not None or page["items"][1]["latest_vote"] is not None
    )
