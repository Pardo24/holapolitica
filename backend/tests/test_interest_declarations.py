"""Deputies' economic interests and activities register: links, reading, the API.

The OCR and the model are faked: what is tested is what we do with their
output (sectors, empty answers, checks, statuses) and what the API lets
through.
"""

from __future__ import annotations

import hashlib
from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.persons import get_person_interests
from app.core.config import Settings
from app.db.base import Base
from app.ingest.congreso import interests
from app.ingest.congreso.interests import (
    ACTIVITIES,
    INTERESTS,
    extract_interest_links,
    normalise_activities,
    normalise_interests,
)
from app.models import InterestDeclaration, Person

# As the ficha of codParlamentario 208 renders them (2026-11-03).
FICHA = """
<a href="/docbienes/leg15/000193/000193_000_e_0000833_20230809.pdf">Declaració de Béns i Rendes</a>
<a href="/docacteco/leg15/000196/000196_001_e_0000840_20230809.pdf" target="_blank">
   Declaració d´ntereses Econòmics (Wed Aug 09 00:00:00 CEST 2023)</a>
<a href="/docacteco/leg15/000196/000196_002_e_0051234_20250110.pdf">again, later</a>
<a href="/docinte/registro_intereses_diputado_208.pdf" target="_blank">Declaració d`Activitats</a>
<a href="/docacteco/leg15/000196/000196_001_e_0000840_20230809.pdf">same one twice</a>
"""


def test_links_are_the_interests_and_the_register() -> None:
    links = extract_interest_links(FICHA, 15)
    assert [(link.kind, link.sequence, link.declared_on) for link in links] == [
        (ACTIVITIES, None, None),
        (INTERESTS, 1, date(2023, 8, 9)),
        (INTERESTS, 2, date(2025, 1, 10)),
    ]
    assert links[0].url == "https://www.congreso.es/docinte/registro_intereses_diputado_208.pdf"


INTERESTS_RAW: dict[str, Any] = {
    "name": "ELISA GARRIDO JIMÉNEZ",
    "initial": True,
    "activities": [
        {
            "period": "2019-2023",
            "employer": "Ayuntamiento",
            "sector": "Publico",
            "description": "Alcaldesa",
        },
        {
            "period": "2015-2019",
            "employer": "Sedena S.L.",
            "sector": "PRIVADO",
            "description": "Psicóloga",
        },
        {
            "period": "2019-2022",
            "employer": "Cuenta propia",
            "sector": "Profesión liberal",
            "description": "Abogado",
        },
        {
            "period": "2018",
            "employer": "Xunta",
            "sector": "Administración pública. CARGO PÚBLICO",
            "description": None,
        },
        {"period": "2015", "employer": "PSOE", "sector": "politica", "description": "Coordinadora"},
        {"period": None, "employer": None, "sector": None, "description": None},
    ],
    "gifts": [
        {"benefactor": None, "description": "NINGUNO"},
        {"benefactor": "Familia", "description": "De poco valor"},
    ],
    "contributions": [{"recipient": "PSOE", "description": "Cuota de afiliada"}],
    "other": "Nada reseñable",
}


def test_interests_keep_what_is_written_and_name_the_sector() -> None:
    data, problems = normalise_interests(INTERESTS_RAW, "Elisa Garrido Jiménez")
    assert problems == []
    assert [(a["sector"], a["sector_as_written"]) for a in data["activities"]] == [
        ("public", "Publico"),
        ("private", "PRIVADO"),
        ("private", "Profesión liberal"),
        ("public", "Administración pública. CARGO PÚBLICO"),
        ("other", "politica"),
    ]
    # "Ninguno" and "Nada reseñable" say there is nothing: not a gift, not a note.
    assert data["gifts"] == [{"benefactor": "Familia", "description": "De poco valor"}]
    assert data["other"] is None
    assert data["initial"] is True


def test_interests_from_someone_else_need_review() -> None:
    _, problems = normalise_interests(INTERESTS_RAW, "Alberto Rojo Blas")
    assert problems and "name" in problems[0]


ACTIVITIES_RAW: dict[str, Any] = {
    "name": "Pérez Ortiz, Isabel María",
    "group": "G.P. Socialista (GS)",
    "registered_on": "1 de agosto de 2023",
    "sections": {
        "A": [{"text": "Concejal del Ayuntamiento de Marbella", "approved_on": "19.12.2023"}],
        "G": [{"text": "Actividad como arquitecta", "approved_on": "19.12.2023"}],
        "E": [],
    },
    "declarations": ["Declaración de Actividades, de 1 de agosto de 2023", None],
}


def test_activities_by_section() -> None:
    data, problems = normalise_activities(ACTIVITIES_RAW, "Isabel María Pérez Ortiz")
    assert problems == []
    assert data["sections"]["public_posts"][0]["approved_on"] == "19.12.2023"
    assert data["sections"]["private_authorised"][0]["text"] == "Actividad como arquitecta"
    assert data["sections"]["party_posts"] == []
    assert set(data["sections"]) == set(interests.ACTIVITY_SECTIONS.values())
    assert data["declarations"] == ["Declaración de Actividades, de 1 de agosto de 2023"]


def test_a_section_the_register_does_not_have_needs_review() -> None:
    raw = {**ACTIVITIES_RAW, "sections": {**ACTIVITIES_RAW["sections"], "Z": [{"text": "?"}]}}
    _, problems = normalise_activities(raw, "Isabel María Pérez Ortiz")
    assert problems == ["sections not on the register: ['Z']"]


# ---------------------------------------------------------------------------
# Reading pending rows, and the API
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


REGISTER = "https://www.congreso.es/docinte/registro_intereses_diputado_208.pdf"
AWAITING = "https://www.congreso.es/docinte/registro_intereses_diputado_383.pdf"
FIRST = "https://www.congreso.es/docacteco/leg15/000196/000196_001_e_1_20230809.pdf"
LATER = "https://www.congreso.es/docacteco/leg15/000196/000196_002_e_2_20250110.pdf"


async def test_parse_pending_reads_each_kind(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    person = Person(full_name="Isabel María Pérez Ortiz", cod_parlamentario=208)
    db_session.add(person)
    await db_session.flush()
    db_session.add_all(
        [
            InterestDeclaration(
                person_id=person.id, kind=ACTIVITIES, legislature=15, pdf_url=REGISTER
            ),
            InterestDeclaration(
                person_id=person.id, kind=ACTIVITIES, legislature=15, pdf_url=AWAITING
            ),
            InterestDeclaration(
                person_id=person.id,
                kind=INTERESTS,
                legislature=15,
                sequence=1,
                declared_on=date(2023, 8, 9),
                pdf_url=FIRST,
            ),
            InterestDeclaration(
                person_id=person.id,
                kind=INTERESTS,
                legislature=15,
                sequence=2,
                declared_on=date(2025, 1, 10),
                pdf_url=LATER,
            ),
        ]
    )
    await db_session.commit()

    async def fake_fetch(_client: Any, url: str) -> bytes:
        return url.encode()

    async def fake_ocr(_s: Any, _client: Any, pdf: bytes) -> str:
        if pdf.decode() == AWAITING:
            return "Actividades\nPendiente de acuerdo definitivo del Pleno sobre la compatibilidad"
        return pdf.decode()

    calls: list[str] = []

    async def fake_structure(_s: Any, _client: Any, kind: str, text: str) -> dict[str, Any]:
        calls.append(text)
        if kind == ACTIVITIES:
            return ACTIVITIES_RAW
        return (
            {**INTERESTS_RAW, "name": "Otra Persona"}
            if text == LATER
            else {**INTERESTS_RAW, "name": "ISABEL MARÍA PÉREZ ORTIZ"}
        )

    monkeypatch.setattr(interests, "fetch_pdf", fake_fetch)
    monkeypatch.setattr(interests, "ocr_pdf", fake_ocr)
    monkeypatch.setattr(interests, "structure", fake_structure)

    counts = await interests.parse_pending(db_session, settings=Settings(mistral_api_key="x"))
    assert counts == {"ok": 3, "needs_review": 1, "failed": 0}
    # The placeholder page costs no model call.
    assert AWAITING not in calls

    rows = {
        d.pdf_url: d
        for d in (await db_session.execute(select(InterestDeclaration))).scalars().all()
    }
    assert rows[AWAITING].data == {"awaiting_plenary": True}
    assert rows[REGISTER].pdf_sha256 == hashlib.sha256(REGISTER.encode()).hexdigest()

    api_rows = await get_person_interests(person.id, db_session)
    assert [(r.kind, r.sequence, r.status) for r in api_rows] == [
        (ACTIVITIES, None, "ok"),
        (ACTIVITIES, None, "ok"),
        (INTERESTS, 2, "needs_review"),
        (INTERESTS, 1, "ok"),
    ]
    assert api_rows[2].data is None and api_rows[3].data is not None
