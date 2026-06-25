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
