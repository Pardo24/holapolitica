"""Tests for the active-deputies importer's departure handling.

Covers the ``close_missing`` path of :class:`DeputyImporter`: a deputy
present in yesterday's roster but absent from today's must have their
open Mandate (and GroupMembership) closed — otherwise the chamber count
drifts above 350 with every substitution. Also covers the truncated-
payload guard: a suspiciously small roster must never mass-close seats.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.ingest.congreso.deputies as deputies_mod
from app.ingest.congreso.deputies import DeputyImporter
from app.models import Base, Chamber, GroupMembership, Legislature, Mandate, Person

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


def _record(name: str, group: str = "Grupo Parlamentario Socialista") -> dict[str, str]:
    return {
        "NOMBRE": name,
        "CIRCUNSCRIPCION": "Madrid",
        "FORMACIONELECTORAL": "PSOE",
        "FECHACONDICIONPLENA": "17/08/2023",
        "GRUPOPARLAMENTARIO": group,
        "FECHAALTAENGRUPOPARLAMENTARIO": "17/08/2023",
    }


async def _seed_context(session: AsyncSession) -> tuple[Chamber, Legislature]:
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        level="national",
    )
    session.add(chamber)
    await session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status="active",
    )
    session.add(leg)
    await session.flush()
    return chamber, leg


async def _import(
    session: AsyncSession,
    chamber: Chamber,
    leg: Legislature,
    names: list[str],
    *,
    close_missing: bool,
) -> deputies_mod.ImportStats:
    payload = json.dumps([_record(n) for n in names]).encode()
    importer = DeputyImporter(session, chamber, leg)
    return await importer.import_payload(payload, close_missing=close_missing)


async def test_departed_deputy_mandate_is_closed(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Small fixtures — lower the roster-size guard for the test.
    monkeypatch.setattr(deputies_mod, "_CLOSE_MISSING_MIN_ROSTER", 1)
    chamber, leg = await _seed_context(db_session)

    await _import(
        db_session, chamber, leg, ["García Pérez, Ana", "López Ruiz, Marc"], close_missing=True
    )

    # Next day: Marc left, a substitute entered.
    stats = await _import(
        db_session,
        chamber,
        leg,
        ["García Pérez, Ana", "Nova Substituta, Berta"],
        close_missing=True,
    )
    assert stats.mandates_closed == 1
    assert stats.mandates_created == 1

    rows = (
        await db_session.execute(
            select(Person.full_name, Mandate.end_date).join(Mandate, Mandate.person_id == Person.id)
        )
    ).all()
    by_name = dict(rows)
    assert by_name["Ana García Pérez"] is None
    assert by_name["Berta Nova Substituta"] is None
    assert by_name["Marc López Ruiz"] == date.today()

    # The departed deputy's group membership is closed too.
    open_memberships = (
        (
            await db_session.execute(
                select(GroupMembership)
                .join(Mandate, Mandate.id == GroupMembership.mandate_id)
                .join(Person, Person.id == Mandate.person_id)
                .where(Person.full_name == "Marc López Ruiz")
                .where(GroupMembership.end_date.is_(None))
            )
        )
        .scalars()
        .all()
    )
    assert open_memberships == []


async def test_small_roster_never_mass_closes(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(deputies_mod, "_CLOSE_MISSING_MIN_ROSTER", 2)
    chamber, leg = await _seed_context(db_session)

    await _import(
        db_session, chamber, leg, ["García Pérez, Ana", "López Ruiz, Marc"], close_missing=True
    )

    # A truncated download with a single row: guard must refuse to close.
    stats = await _import(db_session, chamber, leg, ["García Pérez, Ana"], close_missing=True)
    assert stats.mandates_closed == 0

    still_open = (
        (await db_session.execute(select(Mandate).where(Mandate.end_date.is_(None))))
        .scalars()
        .all()
    )
    assert len(still_open) == 2


async def test_historical_import_never_closes(db_session: AsyncSession) -> None:
    chamber, leg = await _seed_context(db_session)
    await _import(
        db_session, chamber, leg, ["García Pérez, Ana", "López Ruiz, Marc"], close_missing=False
    )
    stats = await _import(db_session, chamber, leg, ["García Pérez, Ana"], close_missing=False)
    assert stats.mandates_closed == 0
