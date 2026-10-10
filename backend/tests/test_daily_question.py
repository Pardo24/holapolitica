"""Tests for "la pregunta del dia" (app.api.daily_question)."""

from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.daily_question import (
    DailyAnswerIn,
    _resolve,
    answer_daily_question,
    get_daily_question,
)
from app.db.base import Base
from app.models import DailyAnswerCount


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def test_civic_question_resolves(db_session: AsyncSession) -> None:
    resolved = await _resolve("civic:0", "ca", db_session)
    assert resolved is not None
    assert resolved.kind == "civic"
    assert 0 <= resolved.correct_index < len(resolved.options)
    assert resolved.explanation
    # The public getter never leaks the answer or explanation.
    out = await get_daily_question(lang="ca", session=db_session)
    assert out is not None
    assert out.key.startswith(("civic:", "vote:"))


async def test_answer_tallies_and_scores(db_session: AsyncSession) -> None:
    # Two people answer; counts accumulate and the correct index comes back.
    first = await answer_daily_question(
        DailyAnswerIn(key="civic:0", option=0), lang="ca", session=db_session
    )
    assert first.correct_index == 0  # curated bank stores the answer at index 0
    assert first.counts[0] == 1
    assert first.total == 1

    second = await answer_daily_question(
        DailyAnswerIn(key="civic:0", option=1), lang="ca", session=db_session
    )
    assert second.counts[0] == 1
    assert second.counts[1] == 1
    assert second.total == 2

    rows = (await db_session.execute(select(DailyAnswerCount))).scalars().all()
    assert sum(r.count for r in rows) == 2


async def test_unknown_key_404(db_session: AsyncSession) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await answer_daily_question(
            DailyAnswerIn(key="civic:999", option=0), lang="ca", session=db_session
        )


async def test_vote_day_variants(db_session: AsyncSession) -> None:
    """One real vote, three questions: passed?, who proposed it, how close."""
    from datetime import UTC, date, datetime

    from app.models import Chamber, Initiative, Legislature, ParliamentaryGroup, Vote
    from app.models import Session as SessionRow

    db_session.add_all(
        [
            Chamber(
                id=1, slug="es-congreso", name_ca="C", name_es="C", name_en="C", level="national"
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
    await db_session.flush()
    groups = [
        ParliamentaryGroup(id=i, legislature_id=1, slug=s, name_short=n, name_long=n)
        for i, (s, n) in enumerate(
            [
                ("gp-a", "GP Socialista"),
                ("gp-b", "GP Popular"),
                ("gp-c", "GP VOX"),
                ("gp-d", "GP Republicano"),
            ],
            start=1,
        )
    ]
    db_session.add_all(groups)
    db_session.add(SessionRow(id=1, chamber_id=1, legislature_id=1, date=date(2026, 6, 25)))
    db_session.add(
        Initiative(
            id=1,
            chamber_id=1,
            legislature_id=1,
            type="proposicion_ley",
            official_id="122/1",
            title_original="x",
            plain_title_ca="Una llei",
            plain_summary_ca="Fa coses.",
            status="approved",
        )
    )
    await db_session.flush()
    db_session.add(
        Vote(
            id=7,
            session_id=1,
            initiative_id=1,
            title="Dictamen",
            voted_at=datetime(2026, 6, 25, 12, tzinfo=UTC),
            result="approved",
            ayes=180,
            noes=170,
            proposing_group_id=2,
        )
    )
    await db_session.commit()

    approved = await _resolve("vote:7:approved", "ca", db_session)
    assert approved is not None and approved.options[approved.correct_index] == "Sí"
    assert approved.context_title == "Una llei"

    proposer = await _resolve("vote:7:proposer", "ca", db_session)
    assert proposer is not None
    assert proposer.options[proposer.correct_index] == "Popular"
    assert len(set(proposer.options)) == 4

    # No roll call recorded: the stance question falls back to "did it pass".
    assert (await _resolve("vote:7:stance", "ca", db_session)).prompt == approved.prompt  # type: ignore[union-attr]

    from app.models import VoteChoice, VoteRecord

    db_session.add_all(
        [
            VoteRecord(
                id=100 + k, vote_id=7, mandate_id=500 + k, choice=VoteChoice.NO, group_id_at_time=2
            )
            for k in range(3)
        ]
        + [
            VoteRecord(
                id=200 + k, vote_id=7, mandate_id=600 + k, choice=VoteChoice.AYE, group_id_at_time=1
            )
            for k in range(2)
        ]
    )
    await db_session.commit()
    stance = await _resolve("vote:7:stance", "ca", db_session)
    assert stance is not None and stance.options == ["A favor", "En contra", "Abstenció"]
    group = stance.prompt.removeprefix("Què hi va votar ").removesuffix("?")
    expected = {"Popular": "En contra", "Socialista": "A favor"}[group]
    assert stance.options[stance.correct_index] == expected

    legacy = await _resolve("vote:7", "ca", db_session)  # keys from before the variants
    assert legacy is not None and legacy.prompt == approved.prompt
