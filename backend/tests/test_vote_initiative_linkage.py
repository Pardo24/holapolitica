"""Tests for the vote -> initiative linkage helpers.

Two layers:

- ``strip_zero_subindex`` — pure function that canonicalises an
  initiative expediente by dropping a trailing ``/0000`` sub-index. Three
  edge cases covered (3-part 0000, 3-part non-0000, already 2-part).
- ``backfill_vote_initiative_links`` — async end-to-end against an
  in-memory SQLite engine, mirroring the pattern used by
  ``test_stats_filters.py`` and ``test_groups_composition.py``. Seeds a
  Chamber / Legislature / Initiative with a 3-part official_id and a
  Vote whose ``expediente_raw`` is the 2-part stem; asserts the backfill
  populates ``vote.initiative_id``.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import AbstractContextManager
from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.ingest.congreso.parse import strip_zero_subindex
from app.models import (
    Chamber,
    ChamberLevel,
    Initiative,
    InitiativeStatus,
    InitiativeType,
    Legislature,
    LegislatureStatus,
    Vote,
    VoteResult,
)
from app.models import Session as SessionRow

# ---------------------------------------------------------------------------
# Pure helper
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("121/000001/0000", "121/000001"),
        ("121/000001/0001", "121/000001/0001"),  # non-0000 sub-index preserved
        ("162/000756", "162/000756"),  # already 2-part
        ("", ""),
    ],
)
def test_strip_zero_subindex(raw: str, expected: str) -> None:
    assert strip_zero_subindex(raw) == expected


# ---------------------------------------------------------------------------
# Backfill — async DB
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


async def _seed_minimal_world(
    session: AsyncSession,
    *,
    initiative_official_id: str,
    vote_expediente_raw: str | None,
) -> tuple[Initiative, Vote]:
    """Seed Chamber + Legislature + 1 Initiative + 1 Session + 1 Vote.

    The Vote starts with ``initiative_id=None``; the backfill is what
    should link it.
    """
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        country="ES",
        level=ChamberLevel.NATIONAL,
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
        status=LegislatureStatus.ACTIVE,
    )
    session.add(leg)
    await session.flush()

    initiative = Initiative(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        type=InitiativeType.PROYECTO_LEY,
        official_id=initiative_official_id,
        title_original="Proyecto de Ley de prueba",
        status=InitiativeStatus.SUBMITTED,
    )
    session.add(initiative)
    await session.flush()

    sess_row = SessionRow(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        date=date(2026, 4, 30),
        type="plenary",
        title="Sesión Plenaria número 177",
    )
    session.add(sess_row)
    await session.flush()

    vote = Vote(
        session_id=sess_row.id,
        initiative_id=None,
        sequence_in_session=1,
        title="Proposiciones no de Ley.",
        description="…",
        voted_at=datetime(2026, 4, 30, 12, 0, tzinfo=UTC),
        result=VoteResult.REJECTED,
        ayes=33,
        noes=315,
        abstentions=0,
        absent=2,
        expediente_raw=vote_expediente_raw,
    )
    session.add(vote)
    await session.commit()
    return initiative, vote


def _patch_session_local(
    engine_maker: async_sessionmaker[AsyncSession],
) -> AbstractContextManager[object]:
    """Patch ``AsyncSessionLocal`` in the bootstrap module to use our maker.

    The bootstrap helper opens its own session via
    ``async with AsyncSessionLocal() as session:`` so we can't pass our
    SQLite session in directly. We monkey-patch the symbol the module
    imported so the same in-memory DB is reused.
    """
    return patch("app.ingest.congreso.bootstrap.AsyncSessionLocal", engine_maker)


async def test_backfill_links_two_part_vote_to_three_part_initiative(
    db_session: AsyncSession,
) -> None:
    """The flagship case: vote scraped as ``121/000262``, initiative as ``…/0000``."""
    initiative, vote = await _seed_minimal_world(
        db_session,
        initiative_official_id="162/000756/0000",
        vote_expediente_raw="162/000756",
    )

    # Re-use the same engine for the bootstrap call.
    maker = async_sessionmaker(db_session.bind, expire_on_commit=False)
    with _patch_session_local(maker):
        from app.ingest.congreso.bootstrap import backfill_vote_initiative_links

        stats = await backfill_vote_initiative_links()

    assert stats.votes_processed == 1
    assert stats.votes_linked == 1
    assert stats.votes_unmatched == 0

    refreshed = (await db_session.execute(select(Vote).where(Vote.id == vote.id))).scalar_one()
    # SQLAlchemy may keep the original object cached — refresh from DB.
    await db_session.refresh(refreshed)
    assert refreshed.initiative_id == initiative.id


async def test_backfill_skips_votes_without_match(db_session: AsyncSession) -> None:
    """A vote whose expediente has no matching initiative stays unlinked."""
    _, vote = await _seed_minimal_world(
        db_session,
        initiative_official_id="121/000001/0000",
        vote_expediente_raw="999/999999",  # series we don't have
    )
    maker = async_sessionmaker(db_session.bind, expire_on_commit=False)
    with _patch_session_local(maker):
        from app.ingest.congreso.bootstrap import backfill_vote_initiative_links

        stats = await backfill_vote_initiative_links()

    assert stats.votes_processed == 1
    assert stats.votes_linked == 0
    assert stats.votes_unmatched == 1

    refreshed = (await db_session.execute(select(Vote).where(Vote.id == vote.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.initiative_id is None


async def test_backfill_is_idempotent(db_session: AsyncSession) -> None:
    """Re-running the backfill processes only the still-unlinked rows."""
    initiative, vote = await _seed_minimal_world(
        db_session,
        initiative_official_id="121/000262/0000",
        vote_expediente_raw="121/000262",
    )
    maker = async_sessionmaker(db_session.bind, expire_on_commit=False)
    with _patch_session_local(maker):
        from app.ingest.congreso.bootstrap import backfill_vote_initiative_links

        first = await backfill_vote_initiative_links()
        second = await backfill_vote_initiative_links()

    assert first.votes_linked == 1
    # On the second pass the vote is already linked → it's no longer a
    # candidate (the SELECT filters ``initiative_id IS NULL``).
    assert second.votes_processed == 0
    assert second.votes_linked == 0
    assert second.votes_unmatched == 0
    refreshed = (await db_session.execute(select(Vote).where(Vote.id == vote.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.initiative_id == initiative.id
