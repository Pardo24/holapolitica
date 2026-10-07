"""A law's verdict is what its latest vote means for it, not the raw result.

Two procedural votes invert or overstate the raw result: rejecting the
amendments to the whole text (debate de totalidad) lets the bill go on,
approving them ends it; approving a toma en consideración only admits the
bill for passage. Both "go on" cases are in progress, not approved or
rejected, in the list's verdict and in its filters.
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

        cases = (
            # (id, subject line, raw result)
            (1, "Debate de totalidad. Proyecto de Ley X", "rejected"),  # goes on
            (2, "Debates de totalidad. Proyecto de Ley Y", "approved"),  # sent back
            (3, "Toma en consideración de Proposiciones de Ley", "approved"),  # admitted
            (4, "Toma en consideración de Proposiciones de Ley", "rejected"),  # not admitted
            (5, "Dictámenes de Comisiones sobre iniciativas legislativas", "approved"),
        )
        for iid, title, result in cases:
            s.add(
                Initiative(
                    id=iid,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id=f"122/00000{iid}/0000",
                    title_original=f"Ley {iid}",
                    status="in_debate",
                )
            )
            s.add(
                Vote(
                    id=iid,
                    session_id=1,
                    initiative_id=iid,
                    title=title,
                    voted_at=datetime(2026, 1, 1, 12, tzinfo=UTC),
                    result=result,
                    ayes=10,
                    noes=5,
                    abstentions=0,
                    absent=0,
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


async def _page(session: AsyncSession, result: str | None) -> dict[int, str | None]:
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
        ids=None,
        sort="recent",
        page=1,
        page_size=50,
        session=session,
    )
    return {item["id"]: item["latest_vote_result"] for item in page["items"]}


async def test_verdict_reads_the_stage(session: AsyncSession) -> None:
    assert await _page(session, None) == {
        1: None,
        2: "rejected",
        3: None,
        4: "rejected",
        5: "approved",
    }


async def test_filters_follow_the_verdict(session: AsyncSession) -> None:
    assert set(await _page(session, "pending")) == {1, 3}
    assert set(await _page(session, "rejected")) == {2, 4}
    assert set(await _page(session, "approved")) == {5}
