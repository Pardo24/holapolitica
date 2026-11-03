"""What each group said on a topic: its latest quotes, this legislature only.

Expediente numbers restart every legislature, so a quote is only matched to
an item voted in the current one.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.topics import get_topic_debate_quotes
from app.models import (
    Base,
    Chamber,
    DebateQuote,
    Initiative,
    InitiativeTopic,
    Legislature,
    ParliamentaryGroup,
    Topic,
    Vote,
)
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
                Topic(
                    id=1,
                    slug="habitatge",
                    name_ca="Habitatge",
                    name_es="Vivienda",
                    name_en="Housing",
                ),
                Topic(id=2, slug="sanitat", name_ca="Sanitat", name_es="Sanidad", name_en="Health"),
                SessionRow(id=1, chamber_id=1, legislature_id=1, date=date(2026, 1, 1)),
                SessionRow(id=2, chamber_id=1, legislature_id=1, date=date(2020, 1, 1)),
                ParliamentaryGroup(
                    id=1, legislature_id=1, slug="gp-vox", name_short="VOX", name_long="VOX"
                ),
                ParliamentaryGroup(
                    id=2, legislature_id=1, slug="gp-popular", name_short="PP", name_long="PP"
                ),
            ]
        )
        await s.flush()
        # (initiative id, official id, topic, voted at)
        items = (
            (1, "122/000001/0000", 1, datetime(2026, 1, 1, tzinfo=UTC)),
            (2, "122/000002/0000", 2, datetime(2026, 1, 1, tzinfo=UTC)),
            # Housing, but voted in an older legislature: its number may be reused.
            (3, "122/000003/0000", 1, datetime(2020, 1, 1, tzinfo=UTC)),
        )
        for iid, official, topic, voted in items:
            s.add(
                Initiative(
                    id=iid,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id=official,
                    title_original=f"Iniciativa {iid}",
                    title_es=f"Ley {iid}",
                    status="in_debate",
                )
            )
            s.add(
                InitiativeTopic(
                    initiative_id=iid,
                    topic_id=topic,
                    confidence=1.0,
                    classified_by="manual",
                    classified_at=voted,
                )
            )
            s.add(
                Vote(
                    id=iid,
                    session_id=1 if voted.year == 2026 else 2,
                    initiative_id=iid,
                    title=f"Votación {iid}",
                    voted_at=voted,
                    result="approved",
                    ayes=1,
                    noes=0,
                    abstentions=0,
                    absent=0,
                )
            )
        # (expediente, date, group, speaker, quote)
        quotes = (
            ("122/000001", date(2026, 1, 1), 1, "A", "VOX, la última"),
            ("122/000001", date(2025, 6, 1), 1, "B", "VOX, la penúltima"),
            ("122/000001", date(2025, 1, 1), 1, "C", "VOX, la más vieja"),
            ("122/000001", date(2026, 1, 1), 2, "D", "PP sobre vivienda"),
            ("122/000001", date(2025, 2, 1), 2, "E", None),
            ("122/000002", date(2026, 1, 1), 2, "F", "PP sobre sanidad"),
            ("122/000003", date(2024, 1, 1), 2, "G", "Otro debate con el mismo número"),
        )
        for i, (exp, day, group, speaker, quote) in enumerate(quotes, start=1):
            s.add(
                DebateQuote(
                    id=i,
                    expediente=exp,
                    debate_date=day,
                    group_id=group,
                    speaker_name=speaker,
                    dscd_ref="DSCD-15-PL-1",
                    page=10,
                    source_url="https://www.congreso.es/x.pdf",
                    quote=quote,
                    status="ok" if quote else "none",
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


async def test_latest_quotes_per_group_on_the_topic(session: AsyncSession) -> None:
    rows = await get_topic_debate_quotes(slug="habitatge", per_group=2, session=session)
    assert [(r.group_slug, r.quote) for r in rows] == [
        ("gp-vox", "VOX, la última"),
        ("gp-popular", "PP sobre vivienda"),
        ("gp-vox", "VOX, la penúltima"),
    ]
    assert rows[0].initiative_id == 1
    assert rows[0].title_es == "Ley 1"
