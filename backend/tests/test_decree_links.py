"""A decree-law and the bill it became point at each other.

After validation a Real Decreto-ley can also be processed as a bill
("procedente del Real Decreto-ley 14/2026"). Two real initiatives, one law;
without the link a reader took them for a duplicate with contradictory
outcomes (one in force, one in progress).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import _load_decree_links
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
            ]
        )
        await s.flush()
        s.add_all(
            [
                Initiative(
                    id=1,
                    chamber_id=1,
                    legislature_id=1,
                    type="real_decreto_ley",
                    official_id="130/000045",
                    title_original="Real Decreto-ley 14/2026, de 9 de junio, de medidas de transporte.",
                    status="approved",
                ),
                Initiative(
                    id=2,
                    chamber_id=1,
                    legislature_id=1,
                    type="proyecto_ley",
                    official_id="121/000102/0000",
                    title_original=(
                        "Proyecto de Ley de medidas de transporte (procedente del Real "
                        "Decreto-ley 14/2026, de 9 de junio)."
                    ),
                    status="in_debate",
                ),
                Initiative(
                    id=3,
                    chamber_id=1,
                    legislature_id=1,
                    type="proyecto_ley",
                    official_id="121/000200/0000",
                    title_original="Proyecto de Ley de otra cosa.",
                    status="in_debate",
                ),
            ]
        )
        await s.commit()
        yield s
    await engine.dispose()


async def test_decree_and_bill_point_at_each_other(session: AsyncSession) -> None:
    items = [await session.get(Initiative, i) for i in (1, 2, 3)]
    links = await _load_decree_links(session, [i for i in items if i is not None])
    assert links[2]["kind"] == "from_decree" and links[2]["id"] == 1
    assert links[1]["kind"] == "as_bill" and links[1]["id"] == 2
    assert 3 not in links
