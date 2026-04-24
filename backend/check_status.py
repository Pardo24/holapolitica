"""Print DB session/vote counts post-backfill."""

from __future__ import annotations

import asyncio

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models import Session as S  # noqa: N817
from app.models import Vote, VoteRecord


async def go() -> None:
    async with AsyncSessionLocal() as s:
        for label, q in (
            ("sessions", select(func.count(S.id))),
            ("votes", select(func.count(Vote.id))),
            ("vote_records", select(func.count(VoteRecord.id))),
        ):
            print(label, "=", (await s.execute(q)).scalar())
        print("---")
        print("session dates:")
        for d in (await s.execute(select(S.date).order_by(S.date))).scalars():
            print("  ", d.isoformat())


asyncio.run(go())
