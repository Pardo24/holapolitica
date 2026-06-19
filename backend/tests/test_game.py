"""Tests for the trivia game question generator (app.api.game)."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.game import game_questions
from app.db.base import Base
from app.models import (
    Chamber,
    ChamberLevel,
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    Legislature,
    LegislatureStatus,
    Mandate,
    ParliamentaryGroup,
    Person,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
    VoteResult,
)
from app.models import (
    Session as SessionRow,
)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def _seed_rich_vote(session: AsyncSession) -> Legislature:
    """Seed one counted vote with a linked summarised+classified initiative,
    a proposing group, and per-group records — enough for every generator."""
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
    psoe = ParliamentaryGroup(
        legislature_id=leg.id,
        slug="gp-socialista",
        name_short="GP Socialista",
        name_long="Grupo Parlamentario Socialista",
        color_hex="#dc2626",
    )
    pp = ParliamentaryGroup(
        legislature_id=leg.id,
        slug="gp-popular",
        name_short="GP Popular",
        name_long="Grupo Parlamentario Popular",
        color_hex="#2563eb",
    )
    session.add_all([psoe, pp])
    await session.flush()
    topic = Topic(slug="habitatge", name_ca="Habitatge", name_es="Vivienda", name_en="Housing")
    session.add(topic)
    await session.flush()
    ini = Initiative(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        type=InitiativeType.PROPOSICION_LEY,
        official_id="122/000001",
        title_original="Llei de prova",
        status=InitiativeStatus.APPROVED,
        submitted_at=date(2024, 1, 1),
        plain_summary_es="Una explicación sencilla de la ley.",
    )
    session.add(ini)
    await session.flush()
    session.add(
        InitiativeTopic(
            initiative_id=ini.id,
            topic_id=topic.id,
            confidence=0.9,
            classified_by="test",
            classified_at=datetime.now(UTC),
        )
    )
    sess = SessionRow(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        date=date(2024, 1, 10),
        type="plenary",
        title="Sessió",
    )
    session.add(sess)
    await session.flush()
    vote = Vote(
        session_id=sess.id,
        initiative_id=ini.id,
        sequence_in_session=1,
        title="Votació de prova",
        description="Proposición de Ley de prueba",
        voted_at=datetime(2024, 1, 10, 12, 0, tzinfo=UTC),
        result=VoteResult.APPROVED,
        ayes=2,
        noes=1,
        proposing_group_id=psoe.id,
        approved_by_assent=False,
    )
    session.add(vote)
    await session.flush()
    # Two deputies → two records, giving each group a clear majority.
    for i, (grp, choice) in enumerate([(psoe, VoteChoice.AYE), (pp, VoteChoice.NO)]):
        person = Person(full_name=f"Diputat {i}")
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
            VoteRecord(
                # Explicit id: VoteRecord.id is BigInteger, which SQLite does
                # not autoincrement (unlike Integer rowid). Postgres uses a
                # sequence in prod; the test just needs unique ids.
                id=i + 1,
                vote_id=vote.id,
                mandate_id=mandate.id,
                choice=choice,
                group_id_at_time=grp.id,
            )
        )
    await session.commit()
    return leg


async def test_game_questions_are_well_formed(db_session: AsyncSession) -> None:
    leg = await _seed_rich_vote(db_session)
    questions = await game_questions(n=5, legislature_id=leg.id, session=db_session)

    assert len(questions) >= 1
    for q in questions:
        # Exactly one correct option — the core invariant of a fair quiz.
        assert sum(1 for o in q.options if o.correct) == 1
        assert 2 <= len(q.options) <= 4
        # Every question references a real vote and carries an explanation
        # (we only draw from summarised initiatives).
        assert q.source_kind == "vote"
        assert q.explanation
        assert q.category in {"partits", "lleis", "temes"}


async def test_game_questions_empty_without_data(db_session: AsyncSession) -> None:
    # No active legislature / no votes → no questions, no error.
    questions = await game_questions(n=5, legislature_id=None, session=db_session)
    assert questions == []
