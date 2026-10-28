"""The laws list can ask "did PSOE and PP vote the same way?".

Each group's stance is what most of its deputies voted on the law's latest
vote (amendments aside). A group split down the middle has no stance, so
the law matches neither answer.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import list_initiatives
from app.models import (
    Base,
    Chamber,
    Initiative,
    Legislature,
    Mandate,
    ParliamentaryGroup,
    Person,
    Vote,
    VoteRecord,
)
from app.models import Session as SessionRow

pytestmark = pytest.mark.anyio

PSOE, PP = 1, 2

# initiative id -> (PSOE's records, PP's records) on its only vote.
LAWS: dict[int, tuple[list[str], list[str]]] = {
    1: (["aye", "aye", "no"], ["aye", "aye"]),  # both yes
    2: (["aye", "aye"], ["no", "no", "abstention"]),  # yes / no
    3: (["abstention", "abstention"], ["aye"]),  # abstention / yes
    4: (["aye", "no"], ["no", "no"]),  # PSOE split: no stance
    5: (["no"], ["no", "absent"]),  # both no, absences ignored
}


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
                    id=PSOE,
                    legislature_id=1,
                    slug="gp-socialista",
                    name_short="GP Socialista",
                    name_long="Grupo Parlamentario Socialista",
                ),
                ParliamentaryGroup(
                    id=PP,
                    legislature_id=1,
                    slug="gp-popular",
                    name_short="GP Popular",
                    name_long="Grupo Parlamentario Popular",
                ),
            ]
        )
        # One deputy per seat a group fills in LAWS: (group, k) -> mandate.
        for gid in (PSOE, PP):
            for k in range(3):
                mid = gid * 10 + k
                s.add(Person(id=mid, full_name=f"Diputada {mid}"))
                s.add(
                    Mandate(
                        id=mid,
                        person_id=mid,
                        chamber_id=1,
                        legislature_id=1,
                        start_date=date(2023, 8, 17),
                    )
                )
        await s.flush()
        for iid, (psoe, pp) in LAWS.items():
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
                )
            )
            for gid, choices in ((PSOE, psoe), (PP, pp)):
                for k, choice in enumerate(choices):
                    s.add(
                        VoteRecord(
                            id=iid * 100 + gid * 10 + k,
                            vote_id=iid,
                            mandate_id=gid * 10 + k,
                            choice=choice,
                            group_id_at_time=gid,
                        )
                    )
        # A law with no vote yet matches neither answer.
        s.add(
            Initiative(
                id=6,
                chamber_id=1,
                legislature_id=1,
                type="proyecto_ley",
                official_id="121/000006/0000",
                title_original="Proyecto de Ley 6",
                status="in_debate",
            )
        )
        await s.commit()
        yield s
    await engine.dispose()


async def _ids(session: AsyncSession, big_two: str | None) -> set[int]:
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
        big_two=big_two,
        page=1,
        page_size=50,
        session=session,
    )
    return {item["id"] for item in page["items"]}


async def test_agree_and_disagree(session: AsyncSession) -> None:
    assert await _ids(session, "agree") == {1, 5}
    assert await _ids(session, "disagree") == {2, 3}


async def test_no_filter_or_junk_keeps_everything(session: AsyncSession) -> None:
    assert await _ids(session, None) == {1, 2, 3, 4, 5, 6}
    assert await _ids(session, "maybe") == {1, 2, 3, 4, 5, 6}
