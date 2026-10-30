"""A party's declared assets: reading the rows, what counts, what is left out."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.groups import get_group_assets, list_groups_assets
from app.core.config import Settings
from app.db.base import Base
from app.ingest.congreso import assets
from app.models import (
    AssetDeclaration,
    AssetIncomeSource,
    Chamber,
    GroupMembership,
    Legislature,
    LegislatureStatus,
    Mandate,
    ParliamentaryGroup,
    Person,
)
from app.services.asset_summary import (
    PropertyCounts,
    comparable_income,
    group_assets,
    income_source,
    normalise_concept,
    property_counts,
)


@pytest.mark.parametrize(
    ("description", "kind", "expected"),
    [
        ("VIVIENDA", "urban", PropertyCounts(homes=1)),
        ("Piso.", "urban", PropertyCounts(homes=1)),
        ("VIVIENDA, GARAJE Y TRASTERO", "urban", PropertyCounts(homes=1, storage=1)),
        ("PISO/TRASTERO/PLAZA", "urban", PropertyCounts(homes=1, storage=1)),
        ("Plaza de garaje", "urban", PropertyCounts(storage=1)),
        ("PLAZA", "urban", PropertyCounts(storage=1)),
        # A square in an address is not a parking space.
        ("Vivienda en plaza Mayor", "urban", PropertyCounts(homes=1)),
        ("2 VIVIENDAS", "urban", PropertyCounts(homes=2)),
        ("DOS PISOS", "urban", PropertyCounts(homes=2)),
        # A share is not a count.
        ("1/2 VIVIENDA", "urban", PropertyCounts(homes=1)),
        ("50% VIVIENDA", "urban", PropertyCounts(homes=1)),
        ("Solar 2.231m2", "urban", PropertyCounts(land=1)),
        ("FINCA RÚSTICA", "rustic", PropertyCounts(land=1)),
        ("Partida Pla del Mas", "rustic", PropertyCounts(land=1)),
        ("4 FINCAS URBANAS", "urban", PropertyCounts(other=4)),
        ("LOCAL COMERCIAL", "urban", PropertyCounts(commercial=1)),
        ("JAMONES SL", "company", PropertyCounts(company=1)),
        ("Vivienda (piso)", "company", PropertyCounts(company=1)),
        ("1/2 caserío", "urban", PropertyCounts(homes=1)),
        ("BIEN", "urban", PropertyCounts(other=1)),
    ],
)
def test_property_rows(description: str, kind: str, expected: PropertyCounts) -> None:
    assert property_counts([{"description": description, "kind": kind}]) == expected


def _row(
    amount: float | None, as_written: str | None = None, concept: str = "Sueldo"
) -> dict[str, Any]:
    return {"kind": "salary", "concept": concept, "amount": amount, "as_written": as_written}


def test_comparable_income_adds_a_persons_rows() -> None:
    assert comparable_income([_row(50_000.0), _row(1_000.5, "1.000,50 (neto)")]) == 51_000.5


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [_row(None, "54.565200.000")],
        [_row(1100.0, "1.100 MENSUAL")],
        [_row(1571.98, "1.571,98 €/mes")],
        [_row(2558.25, "2558,25 (14 PAGAS)")],
        [_row(50_000.0), _row(900.0, concept="ACTIVIDADES PROFESIONALES 2º TRIMESTRE")],
    ],
)
def test_income_that_cannot_be_compared(rows: list[dict[str, Any]]) -> None:
    assert comparable_income(rows) is None


def test_a_word_with_mes_inside_is_not_a_period() -> None:
    assert comparable_income([_row(9000.0, concept="Mesa del Parlament")]) == 9000.0


def test_income_source_from_the_form_or_the_label() -> None:
    labels = {"XUNTA DE GALICIA": "public"}
    assert income_source({"kind": "salary", "concept": "Xunta  de galicia"}, labels) == "public"
    assert income_source({"kind": "dividends", "concept": "Repsol"}, labels) == "capital"
    assert income_source({"kind": "salary", "concept": None}, labels) == "unspecified"
    assert income_source({"kind": "other", "concept": "No vista"}, labels) == "unspecified"


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


def _data(income: float | None, **rest: Any) -> dict[str, Any]:
    return {
        "income": [_row(income, concept="Xunta de Galicia")] if income is not None else [],
        "properties": [],
        "securities": [],
        "loans": [],
        "other_debts": None,
        **rest,
    }


async def _group(
    session: AsyncSession, people: list[tuple[str, dict[str, Any] | None, str]]
) -> ParliamentaryGroup:
    chamber = Chamber(slug="congreso", name_ca="C", name_es="C", name_en="C", level="national")
    session.add(chamber)
    await session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="15",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status=LegislatureStatus.ACTIVE,
    )
    session.add(leg)
    await session.flush()
    group = ParliamentaryGroup(
        legislature_id=leg.id, slug="gp-test", name_short="Test", name_long="Grupo Test"
    )
    session.add(group)
    await session.flush()
    for i, (name, data, status) in enumerate(people):
        person = Person(full_name=name, family_names=name)
        session.add(person)
        await session.flush()
        mandate = Mandate(
            person_id=person.id,
            chamber_id=chamber.id,
            legislature_id=leg.id,
            start_date=date(2023, 8, 17),
        )
        session.add(mandate)
        await session.flush()
        session.add(
            GroupMembership(mandate_id=mandate.id, group_id=group.id, start_date=date(2023, 8, 17))
        )
        if status:
            session.add(
                AssetDeclaration(
                    person_id=person.id,
                    legislature=15,
                    sequence=0,
                    declared_on=date(2023, 8, 8),
                    pdf_url=f"https://example.test/{i}.pdf",
                    parse_status=status,
                    data=data,
                )
            )
    await session.commit()
    return group


async def test_group_figures_never_order_people_by_money(db_session: AsyncSession) -> None:
    group = await _group(
        db_session,
        [
            ("Zeta", _data(200_000.0), "ok"),
            ("Alfa", _data(30_000.0, loans=[{"description": "Hipoteca"}]), "ok"),
            ("Beta", _data(40_000.0), "ok"),
            ("Gamma", _data(50_000.0), "ok"),
            ("Delta", _data(60_000.0), "ok"),
            ("Held", _data(999_999.0), "needs_review"),
            ("Nobody", None, ""),
        ],
    )
    db_session.add(
        AssetIncomeSource(concept="XUNTA DE GALICIA", source="public", classified_by="human")
    )
    await db_session.commit()

    detail = (await group_assets(db_session, [group]))[0]

    assert [p.full_name for p in detail.people] == [
        "Alfa",
        "Beta",
        "Delta",
        "Gamma",
        "Held",
        "Nobody",
        "Zeta",
    ]
    assert (detail.members, detail.read, detail.income_comparable) == (7, 5, 5)
    # The held declaration's figure counts for nothing.
    assert detail.income_median == 50_000
    assert {b.key: b.people for b in detail.income_bands}["30k_60k"] == 3
    assert {b.key: b.people for b in detail.income_bands}["over_200k"] == 1
    assert [(s.key, s.people) for s in detail.income_sources] == [("public", 5)]
    assert detail.with_loans == 1
    held = next(p for p in detail.people if p.full_name == "Held")
    assert held.declared_on is None and held.income == []


async def test_the_api_shows_groups_without_their_people(db_session: AsyncSession) -> None:
    await _group(db_session, [("Alfa", _data(30_000.0), "ok"), ("Beta", _data(40_000.0), "ok")])
    rows = await list_groups_assets(db_session)
    assert [(r.slug, r.members, r.read) for r in rows] == [("gp-test", 2, 2)]
    assert "people" not in rows[0].model_dump()
    detail = await get_group_assets("gp-test", db_session)
    assert [p.full_name for p in detail.people] == ["Alfa", "Beta"]


async def test_no_median_from_a_handful(db_session: AsyncSession) -> None:
    group = await _group(db_session, [("Alfa", _data(30_000.0), "ok"), ("Beta", _data(9e4), "ok")])
    detail = (await group_assets(db_session, [group]))[0]
    assert detail.income_median is None
    assert detail.homes_median is None


async def test_classify_labels_only_what_is_new(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _group(
        db_session,
        [
            (
                "Alfa",
                {
                    "income": [
                        {"kind": "salary", "concept": "Xunta de Galicia"},
                        {"kind": "salary", "concept": "Café SL"},
                        {"kind": "dividends", "concept": "Repsol"},
                    ]
                },
                "ok",
            ),
            ("Beta", {"income": [{"kind": "other", "concept": "Sin leer"}]}, "needs_review"),
        ],
    )
    db_session.add(
        AssetIncomeSource(concept="XUNTA DE GALICIA", source="public", classified_by="human")
    )
    await db_session.commit()
    asked: list[list[str]] = []

    async def fake_batch(settings: Settings, client: object, concepts: list[str]) -> dict[str, str]:
        asked.append(concepts)
        return dict.fromkeys(concepts, "private")

    monkeypatch.setattr(assets, "classify_batch", fake_batch)
    counts = await assets.classify_income_sources(db_session, settings=Settings())

    assert asked == [[normalise_concept("Café SL")]]
    assert counts == {"labelled": 1, "failed": 0}
    rows = {
        r.concept: r.source
        for r in (await db_session.execute(select(AssetIncomeSource))).scalars().all()
    }
    assert rows == {"XUNTA DE GALICIA": "public", "CAFÉ SL": "private"}
