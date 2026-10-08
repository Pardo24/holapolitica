"""'What changes for you': facts per everyday situation, never verdicts.

The sentence under each situation is shown as what the text establishes,
so the guard is strict: an unknown situation is dropped, a sentence that
judges ("beneficia", "perjudica") is dropped, a situation with only one
language is dropped. And the list can be filtered by situation.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.initiatives import list_initiatives
from app.models import Base, Chamber, Initiative, Legislature
from app.services.law_profiles import MAX_PROFILES, PROFILES, parse_profiles, profile_input


def _raw(*items: dict[str, str]) -> str:
    return json.dumps({"profiles": list(items)}, ensure_ascii=False)


JOVE = {
    "key": "jove",
    "es": "Si tienes entre 18 y 30 años, el texto fija descuentos de hasta el 90 % en trenes.",
    "ca": "Si tens entre 18 i 30 anys, el text fixa descomptes de fins al 90 % en trens.",
}


def test_keeps_known_situations_with_both_languages() -> None:
    assert parse_profiles(_raw(JOVE)) == {"jove": {"es": JOVE["es"], "ca": JOVE["ca"]}}


def test_drops_unknown_keys_and_repeats() -> None:
    other = {**JOVE, "key": "astronauta"}
    assert list(parse_profiles(_raw(JOVE, JOVE, other))) == ["jove"]


def test_drops_verdicts() -> None:
    judged = {
        "key": "autonom",
        "es": "Si eres autónomo, esta ley te beneficia con una cuota más baja.",
        "ca": "Si ets autònom, aquesta llei et beneficia amb una quota més baixa.",
    }
    against = {
        "key": "llogater",
        "es": "Si vives de alquiler, la medida perjudica tu contrato actual.",
        "ca": "Si vius de lloguer, la mesura perjudica el teu contracte actual.",
    }
    assert parse_profiles(_raw(judged, against)) == {}


def test_drops_a_situation_missing_a_language() -> None:
    assert parse_profiles(_raw({**JOVE, "ca": ""})) == {}


def test_caps_the_number_of_situations() -> None:
    items = [{**JOVE, "key": key} for key in PROFILES]
    assert len(parse_profiles(_raw(*items))) == MAX_PROFILES


def test_garbage_raises_so_the_job_retries() -> None:
    with pytest.raises(ValueError):
        parse_profiles("no json here")


def test_input_lists_the_measures() -> None:
    text = profile_input(
        title="Ley X",
        summary="Resumen.",
        points=[{"text": "Crea una ayuda.", "ref": "Art. 1"}, {"text": "", "ref": None}],
    )
    assert text.splitlines() == [
        "TÍTULO: Ley X",
        "RESUMEN: Resumen.",
        "MEDIDAS DEL TEXTO:",
        "- Crea una ayuda.",
    ]


pytestmark_db = pytest.mark.anyio


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
        effects = {
            1: {"jove": {"es": JOVE["es"], "ca": JOVE["ca"]}},
            2: {"llogater": {"es": "Si vives de alquiler, x.", "ca": "Si vius de lloguer, x."}},
            3: {},
        }
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
                    profile_effects=effects.get(iid),
                )
            )
        await s.commit()
        yield s
    await engine.dispose()


async def _ids(session: AsyncSession, profile: str) -> list[int]:
    page = await list_initiatives(
        legislature_id=None,
        chamber_id=None,
        creates_law=True,
        initiative_type=None,
        status_filter=None,
        result=None,
        topic_slug=None,
        proposing_group_slug=None,
        audience=None,
        q=None,
        profile=profile,
        ids=None,
        sort="recent",
        page=1,
        page_size=50,
        session=session,
    )
    return sorted(int(item["id"]) for item in page["items"])


@pytestmark_db
async def test_filter_by_situation(session: AsyncSession) -> None:
    assert await _ids(session, "jove") == [1]
    assert await _ids(session, "llogater") == [2]


@pytestmark_db
async def test_unknown_situation_does_not_filter(session: AsyncSession) -> None:
    assert await _ids(session, "astronauta") == [1, 2, 3, 4]
