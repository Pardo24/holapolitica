"""Deputies' asset declarations: links on the ficha, reading the scan, the API.

The OCR and the model are faked: what is tested is what we do with their
output (amounts, checks, statuses) and what the API lets through.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.persons import get_person_assets, list_asset_declarants
from app.core.config import Settings
from app.db.base import Base
from app.ingest.congreso import assets
from app.ingest.congreso.assets import (
    SeveralAmountsError,
    extract_declaration_links,
    name_matches,
    normalise_declaration,
    parse_amount,
)
from app.models import AssetDeclaration, Person

# As the ficha of codParlamentario 353 renders them (2026-10-27).
FICHA = """
<a href="/docbienes/leg15/000353/000353_000_e_0004931_20231128.pdf" target="_blank" rel="noopener noreferrer">
   Declaraci&oacute;n de Bienes y Rentas (Tue Nov 28 00:00:00 CET 2023)</a>
<a href="/docbienes/leg15/000353/000353_001_e_0054218_20250122.pdf" target="_blank">
   Declaraci&oacute;n de Bienes y Rentas (Wed Jan 22 00:00:00 CET 2025)</a>
<a href="/docbienes/leg15/000353/000353_001_e_0120996_20260625.pdf" target="_blank">
   Declaraci&oacute;n de Bienes y Rentas (Thu Jun 25 00:00:00 CEST 2026)</a>
<a href="/docacteco/leg15/000353/000353_001_e_0004932_20231128.pdf" target="_blank">
   Declaraci&oacute;n de Intereses Econ&oacute;micos (Tue Nov 28 00:00:00 CET 2023)</a>
<a href="/docinte/registro_intereses_diputado_353.pdf">Registro</a>
<a href="/docbienes/leg15/000353/000353_000_e_0004931_20231128.pdf">again</a>
"""


def test_links_are_the_asset_pdfs_only_oldest_first() -> None:
    links = extract_declaration_links(FICHA)
    assert [(link.sequence, link.declared_on) for link in links] == [
        (0, date(2023, 11, 28)),
        (1, date(2025, 1, 22)),
        (1, date(2026, 6, 25)),
    ]
    assert links[0].url == (
        "https://www.congreso.es/docbienes/leg15/000353/000353_000_e_0004931_20231128.pdf"
    )
    assert {link.legislature for link in links} == {15}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("10.803,87€", 10803.87),
        ("5.201,89", 5201.89),
        ("36.000 €", 36000.0),
        ("11 .037 ,82 EUROS", 11037.82),
        ("1.234.567", 1234567.0),
        ("12,5", 12.5),
        ("1,250,000.50", 1250000.5),
        (3000, 3000.0),
        (None, None),
        ("", None),
        ("-", None),
        ("sin datos", None),
        # From the first production run (2026-10-29).
        ("28.300.-", 28300.0),
        ("29.218,-", 29218.0),
        ("15.200 .-", 15200.0),
        ("€3.122.070,00.-", 3122070.0),
        ("35.659,03.- €", 35659.03),
        ("62.857.92", 62857.92),
        ("105.272.10€", 105272.1),
        ("33,170,34€ €", 33170.34),
        ("4,035,00", 4035.0),
        ("107.849,07 € (31-7-2023)", 107849.07),
        ("3.876,50 € (valor a 15-10-2023)", 3876.5),
        ("20.000 E.", 20000.0),
        ("1591.68 anuales", 1591.68),
        ("-91,32 €", -91.32),
        # A date beside the amount is not a second figure (2026-10-29 re-read).
        ("A fecha 2.09.26 la cantidad de 7.172,07 euros.", 7172.07),
        ("50.000 a fecha 15/12/2023", 50000.0),
        ("26.773,75 (saldo cuentas a 08/12/2023)", 26773.75),
    ],
)
def test_amounts_read_as_written_on_the_form(raw: Any, expected: float | None) -> None:
    assert parse_amount(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "1.2.3,4.5",
        # Two figures run together by the OCR or the model.
        "46.256,5910.647,34",
        "1.086,8628.330,35",
        "9.0004.000",
        "14.30015.700",
        "10391.5872409.66",
        "5.692,34422,2411.939,95",
    ],
)
def test_an_amount_that_is_not_one_raises(raw: str) -> None:
    with pytest.raises(ValueError) as err:
        parse_amount(raw)
    assert not isinstance(err.value, SeveralAmountsError)


@pytest.mark.parametrize(
    "raw",
    [
        "15.000€ 1.500€",
        "62.613 + 87.142",
        "22.776 1.221.158",
        "50% 14.095,76  50% 11.024,92",
        "553,16 €\n1612,21 €\n1292,27 €",
        "2.524 NETOS 43.624,78 NETOS",
        "76.052,42, a 31 Diciembre",
        "6.297'68 111.630'12",
    ],
)
def test_several_figures_in_one_box(raw: str) -> None:
    with pytest.raises(SeveralAmountsError):
        parse_amount(raw)


def test_name_check() -> None:
    assert name_matches("GALA PIN FERRANDO", "Gala Pin Ferrando")
    assert name_matches("JOSÉ LOSADA FERNÁNDEZ", "José Losada Fernández")
    # The OCR may lose one word of three.
    assert name_matches("JOS LOSADA FERNANDEZ", "José Losada Fernández")
    # Spelling variants of the same name.
    assert name_matches(
        "Idoya Sagastizabal Uncetabarrenechea", "Idoia Sagastizabal Unzetabarrenetxea"
    )
    assert not name_matches("ANA LÓPEZ GARCÍA", "José Losada Fernández")
    assert not name_matches("PEDRO PIN FERRANDO", "Gala Pan Ferreira")
    assert not name_matches(None, "José Losada Fernández")


# Shaped like the model's reply for the declaration of 13/02/2025 of Gala Pin.
RAW: dict[str, Any] = {
    "name": "GALA PIN FERRANDO",
    "income": [],
    "income_tax_paid": "5.201,89",
    "properties": [
        {
            "kind": "urban",
            "description": "Residencial",
            "location": "Ávila",
            "acquired": "2006",
            "right": "Propietario (100%) Compraventa",
        },
        {"kind": "palace", "description": "", "location": None},
    ],
    "deposits": [{"description": "Cuentas corrientes", "amount": "36.000 €"}],
    "securities": [],
    "vehicles": [{"acquired": "", "description": ""}],
    "other_assets": [],
    "loans": [
        {
            "description": "Hipoteca Banco X",
            "granted_on": "2019",
            "amount": "150.000",
            "outstanding": "98.512,10",
        }
    ],
    "other_debts": None,
    "observations": "Sin cambios en lo no especificado respecto de la modificación de la declaración inicial.",
}


def test_normalise_keeps_what_is_written_and_parses_amounts() -> None:
    data, problems = normalise_declaration(RAW, "Gala Pin Ferrando")
    assert problems == []
    assert data["income_tax_paid"] == 5201.89
    assert data["deposits"] == [
        {"description": "Cuentas corrientes", "amount": 36000.0, "as_written": None}
    ]
    # The empty rows are dropped.
    assert data["properties"] == [
        {
            "kind": "urban",
            "description": "Residencial",
            "location": "Ávila",
            "acquired": "2006",
            "right": "Propietario (100%) Compraventa",
        }
    ]
    assert data["vehicles"] == []
    assert data["loans"] == [
        {
            "description": "Hipoteca Banco X",
            "granted_on": "2019",
            "amount": 150000.0,
            "amount_as_written": None,
            "outstanding": 98512.1,
            "outstanding_as_written": None,
        }
    ]
    assert data["observations"].startswith("Sin cambios")


def test_normalise_flags_what_fails_a_check() -> None:
    raw = {
        **RAW,
        "name": "OTRA PERSONA DISTINTA",
        "deposits": [{"description": "Cuenta", "amount": "1.2.3,4.5"}],
        "income": [{"kind": "salary", "concept": "Nómina", "amount": "900.000.000"}],
    }
    _, problems = normalise_declaration(raw, "Gala Pin Ferrando")
    assert len(problems) == 3
    assert any("name on the form" in p for p in problems)
    assert any("unreadable amount in deposits" in p for p in problems)
    assert any("implausible amount" in p for p in problems)


def test_normalise_keeps_an_amount_that_says_more_than_a_number() -> None:
    # As in María Elena Bondía's declaration of 05/10/2026: monthly pay
    # must not read as the year's income. The vehicle row also had a plate.
    raw = {
        **RAW,
        "income": [
            {"kind": "salary", "concept": "Salario alcaldesa", "amount": "1.100 MENSUAL"},
            {"kind": "salary", "concept": "Nómina", "amount": "19.526,68 €"},
        ],
        "securities": [{"kind": "shares", "description": "Acciones", "value": "1.062,72 EUROS"}],
        "vehicles": [
            {"acquired": "AGOSTO 2022", "description": "VOLVO XC60 con matrícula 8793LTC"},
            {"acquired": "2011", "description": "PEUGEOT 308, matrícula 1234 BCD. Diésel"},
            {"acquired": "2019", "description": "2019 BMW X3"},
        ],
    }
    data, problems = normalise_declaration(raw, "Gala Pin Ferrando")
    assert problems == []
    assert [(r["amount"], r["as_written"]) for r in data["income"]] == [
        (1100.0, "1.100 MENSUAL"),
        (19526.68, None),
    ]
    assert data["securities"][0]["as_written"] is None
    assert [v["description"] for v in data["vehicles"]] == [
        "VOLVO XC60",
        "PEUGEOT 308. Diésel",
        "2019 BMW X3",
    ]


def test_normalise_shows_several_figures_as_written() -> None:
    raw = {
        **RAW,
        "deposits": [{"description": "Cuentas", "amount": "62.613 + 87.142"}],
        # A refund, written as such.
        "income_tax_paid": "-91,32 €",
    }
    data, problems = normalise_declaration(raw, "Gala Pin Ferrando")
    assert problems == []
    assert data["deposits"] == [
        {"description": "Cuentas", "amount": None, "as_written": "62.613 + 87.142"}
    ]
    assert data["income_tax_paid"] == -91.32 and data["income_tax_as_written"] is None


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


async def _seed(session: AsyncSession) -> Person:
    person = Person(full_name="Gala Pin Ferrando", cod_parlamentario=326)
    session.add(person)
    await session.flush()
    for seq, day in ((0, date(2023, 8, 16)), (1, date(2024, 2, 6)), (2, date(2025, 2, 13))):
        session.add(
            AssetDeclaration(
                person_id=person.id,
                legislature=15,
                sequence=seq,
                declared_on=day,
                pdf_url=f"https://www.congreso.es/docbienes/leg15/000326/000326_00{seq}_e_1_{day:%Y%m%d}.pdf",
                parse_status="pending",
            )
        )
    await session.commit()
    return person


async def test_parse_pending_sets_status_from_the_checks(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    person = await _seed(db_session)
    replies = {
        "20250213": RAW,
        "20240206": {**RAW, "name": "NO ES ELLA"},
    }

    async def fake_fetch(_client: Any, url: str) -> bytes:
        if "20230816" in url:
            raise ValueError("not a PDF")
        return url.encode()

    async def fake_ocr(_s: Any, _client: Any, pdf: bytes) -> str:
        return pdf.decode()

    async def fake_structure(_s: Any, _client: Any, text: str) -> dict[str, Any]:
        return next(v for k, v in replies.items() if k in text)

    monkeypatch.setattr(assets, "fetch_pdf", fake_fetch)
    monkeypatch.setattr(assets, "ocr_pdf", fake_ocr)
    monkeypatch.setattr(assets, "structure", fake_structure)

    counts = await assets.parse_pending(db_session, settings=Settings(mistral_api_key="x"))
    assert counts == {"ok": 1, "needs_review": 1, "failed": 1}

    rows = {
        d.sequence: d for d in (await db_session.execute(select(AssetDeclaration))).scalars().all()
    }
    assert rows[2].parse_status == "ok" and rows[2].data["deposits"][0]["amount"] == 36000.0
    assert rows[1].parse_status == "needs_review" and rows[1].problems
    assert rows[0].parse_status == "failed"

    api_rows = await get_person_assets(person.id, db_session)
    assert [(r.sequence, r.status) for r in api_rows] == [
        (2, "ok"),
        (1, "needs_review"),
        (0, "failed"),
    ]
    # Only what passed the checks reaches the page.
    assert api_rows[0].data is not None
    assert api_rows[1].data is None and api_rows[2].data is None


async def test_redo_reads_again_from_the_stored_ocr(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _seed(db_session)
    for d in (await db_session.execute(select(AssetDeclaration))).scalars().all():
        d.parse_status = "ok"
        d.ocr_text = f"texto {d.declared_on:%Y%m%d}"
    await db_session.commit()

    async def no_fetch(*_a: Any) -> bytes:
        raise AssertionError("the stored OCR text should be reused")

    async def fake_structure(_s: Any, _client: Any, text: str) -> dict[str, Any]:
        return RAW

    monkeypatch.setattr(assets, "fetch_pdf", no_fetch)
    monkeypatch.setattr(assets, "structure", fake_structure)
    settings = Settings(mistral_api_key="x")

    assert await assets.parse_pending(db_session, settings=settings) == {
        "ok": 0,
        "needs_review": 0,
        "failed": 0,
    }
    counts = await assets.parse_pending(db_session, redo=True, settings=settings)
    assert counts == {"ok": 3, "needs_review": 0, "failed": 0}


async def test_declarants_index_lists_each_person_once(db_session: AsyncSession) -> None:
    person = await _seed(db_session)
    db_session.add(Person(full_name="Sin Declaración"))
    await db_session.commit()

    rows = await list_asset_declarants(db_session)
    assert [(r.person_id, r.declarations, r.latest_declared_on) for r in rows] == [
        (person.id, 3, date(2025, 2, 13))
    ]
    assert rows[0].group_slug is None
