"""One card per proposal: the same proposal tabled several times is one card.

A bill withdrawn and filed again, or re-registered after it lapsed, shows up
as two or three initiatives with the same plain title and different
statuses. The furthest-along one keeps the card; the others are named on it.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import _load_same_title, _one_card_per_proposal
from app.ingest.congreso.parse import classify_initiative_status
from app.models import Base, Chamber, Initiative, Legislature

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
                    name_ca="C",
                    name_es="C",
                    name_en="C",
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
            ]
        )
        await s.flush()
        title = "Reconeixement dels funcionaris de presons com a agents de l'autoritat"
        s.add_all(
            [
                Initiative(
                    id=1,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id="122/000076/0000",
                    title_original="a",
                    plain_title_ca=title,
                    status="withdrawn",
                    submitted_at=date(2024, 3, 1),
                ),
                Initiative(
                    id=2,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id="122/000078/0000",
                    title_original="b",
                    plain_title_ca=title,
                    status="in_debate",
                    submitted_at=date(2024, 3, 10),
                ),
                Initiative(
                    id=3,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id="122/000081/0000",
                    title_original="c",
                    plain_title_ca=title,
                    status="expired",
                    submitted_at=date(2024, 3, 21),
                ),
                Initiative(
                    id=4,
                    chamber_id=1,
                    legislature_id=1,
                    type="proposicion_ley",
                    official_id="122/000090/0000",
                    title_original="d",
                    plain_title_ca="Una altra cosa",
                    status="submitted",
                ),
            ]
        )
        await s.commit()
        yield s
    await engine.dispose()


async def test_furthest_along_keeps_the_card(session: AsyncSession) -> None:
    items = [await session.get(Initiative, i) for i in (3, 2, 1, 4)]
    kept = _one_card_per_proposal([i for i in items if i is not None], {}, {})
    assert [i.id for i in kept] == [2, 4]


async def test_the_others_are_named_on_it(session: AsyncSession) -> None:
    item = await session.get(Initiative, 2)
    assert item is not None
    same = await _load_same_title(session, [item])
    assert [s["id"] for s in same[2]] == [1, 3]
    assert [s["status"] for s in same[2]] == ["withdrawn", "expired"]


def test_status_from_the_portal() -> None:
    assert classify_initiative_status("Concluido - (Caducado)", None) == "expired"
    assert classify_initiative_status("Senado", None) == "in_debate"
    assert classify_initiative_status("Cerrado", "Decaído \n13/05/2026") == "expired"
