"""The laws list filters by who SUBMITTED each initiative.

A group's amendment to the whole text of a Government bill is a vote that
group "proposed". Read through the votes, filtering by VOX listed the
Government's bills; the filter reads the initiative's own submitter now,
co-signers included, and falls back to the votes only when that is empty.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import list_initiatives
from app.models import Base, Chamber, Initiative, Legislature, ParliamentaryGroup, Vote
from app.models import Session as SessionRow

pytestmark = pytest.mark.anyio

VOX = "Grupo Parlamentario VOX"
PSOE = "Grupo Parlamentario Socialista"


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
        s.add_all(
            [
                Chamber(
                    id=1,
                    slug="es-congreso",
                    name_ca="Congrés",
                    name_es="Congreso",
                    name_en="Congress",
                    level="national",
                ),
                Legislature(
                    id=1,
                    chamber_id=1,
                    number="XV",
                    name_ca="XV",
                    name_es="XV",
                    name_en="XV",
                    start_date=date(2023, 8, 17),
                    status="active",
                ),
                SessionRow(id=1, chamber_id=1, legislature_id=1, date=date(2026, 1, 1)),
                ParliamentaryGroup(
                    id=1, legislature_id=1, slug="gp-vox", name_short="GP VOX", name_long=VOX
                ),
                ParliamentaryGroup(
                    id=2,
                    legislature_id=1,
                    slug="gp-socialista",
                    name_short="GP Socialista",
                    name_long=PSOE,
                ),
            ]
        )
        await s.flush()

        # (id, type, submitted_by, vote's proposing group, vote by government)
        rows = (
            # A Government bill VOX moved to send back: the vote is VOX's.
            (1, "proyecto_ley", "Gobierno", 1, False),
            (2, "proposicion_ley", VOX, 1, False),
            # Co-signed: belongs to both groups.
            (3, "proposicion_ley", f"{PSOE} \n{VOX}", None, False),
            # No submitter on record: the votes decide.
            (4, "proposicion_ley", None, 1, False),
            (5, "real_decreto_ley", "Gobierno", None, True),
        )
        for iid, itype, by, group_id, by_gov in rows:
            s.add(
                Initiative(
                    id=iid,
                    chamber_id=1,
                    legislature_id=1,
                    type=itype,
                    official_id=f"121/{iid:06d}/0000",
                    title_original=f"Iniciativa {iid}",
                    status="in_debate",
                    submitted_by=by,
                )
            )
            s.add(
                Vote(
                    id=iid,
                    session_id=1,
                    initiative_id=iid,
                    title=f"Votación {iid}",
                    voted_at=datetime(2026, 1, 1, 12, tzinfo=UTC),
                    result="approved",
                    ayes=1,
                    noes=0,
                    abstentions=0,
                    absent=0,
                    proposing_group_id=group_id,
                    proposed_by_government=by_gov,
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


async def _ids(session: AsyncSession, proposer: str) -> set[int]:
    # Called directly, so every parameter has to be passed: unset ones
    # would arrive as FastAPI's Query object, not as their default.
    page = await list_initiatives(
        legislature_id=1,
        chamber_id=None,
        creates_law=None,
        initiative_type=None,
        status_filter=None,
        result=None,
        topic_slug=None,
        proposing_group_slug=proposer,
        audience=None,
        q=None,
        change=None,
        profile=None,
        big_two=None,
        ids=None,
        sort="recent",
        page=1,
        page_size=50,
        session=session,
    )
    return {item["id"] for item in page["items"]}


async def test_a_group_gets_what_it_submitted_not_what_it_amended(session: AsyncSession) -> None:
    assert await _ids(session, "gp-vox") == {2, 3, 4}


async def test_co_signed_initiatives_belong_to_every_signer(session: AsyncSession) -> None:
    assert await _ids(session, "gp-socialista") == {3}


async def test_the_government_gets_its_bills_and_decrees(session: AsyncSession) -> None:
    assert await _ids(session, "govern") == {1, 5}


async def test_several_proposers_are_or_ed(session: AsyncSession) -> None:
    assert await _ids(session, "govern,gp-socialista") == {1, 3, 5}
