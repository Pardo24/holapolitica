"""Every page id the site's sitemap lists, in one cached call.

The sitemap (frontend app/sitemap.ts) used to list the last 100 votes and
no deputy at all, out of ~14,000 votes, ~1,600 initiatives and ~1,250
deputies, so search engines barely knew the site's pages existed. Paging
through the list endpoints for all of them would cost the frontend hundreds
of calls per regeneration; this returns just the ids (and a date where one
helps), cached for six hours.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Initiative, Mandate, Person, Vote
from app.services.cache import cached

router = APIRouter(prefix="/sitemap", tags=["sitemap"])


class SitemapIds(BaseModel):
    #: [vote id, ISO date of the vote]
    votes: list[tuple[int, str]]
    #: [initiative id, ISO date it was submitted or None]
    initiatives: list[tuple[int, str | None]]
    persons: list[int]
    #: Distinct plenary days with votes (the /avui/<date> archive).
    days: list[str]


@router.get("/ids", response_model=SitemapIds)
async def sitemap_ids(session: AsyncSession = Depends(get_session)) -> dict[str, object]:
    async def _factory() -> dict[str, object]:
        votes = (
            await session.execute(select(Vote.id, Vote.voted_at).order_by(Vote.voted_at.desc()))
        ).all()
        initiatives = (
            await session.execute(
                select(Initiative.id, Initiative.submitted_at).order_by(Initiative.id)
            )
        ).all()
        persons = (
            await session.execute(
                select(Person.id).join(Mandate, Mandate.person_id == Person.id).distinct()
            )
        ).scalars()
        days = (
            await session.execute(
                select(func.date(Vote.voted_at))
                .distinct()
                .order_by(func.date(Vote.voted_at).desc())
            )
        ).scalars()
        return {
            "votes": [(int(i), d.date().isoformat()) for i, d in votes],
            "initiatives": [(int(i), d.isoformat() if d else None) for i, d in initiatives],
            "persons": sorted(int(p) for p in persons),
            "days": [str(d) for d in days],
        }

    return await cached("sitemap:ids:v1", 6 * 3600, _factory)
