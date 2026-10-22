"""Press coverage that is not tied to one topic: for now, the election."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas import ElectionNewsRead
from app.services.cache import cached
from app.services.election_parties import BY_SLUG, parties_in
from app.services.topic_news import fetch_election_news

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/elections", response_model=list[ElectionNewsRead])
async def election_news(
    locale: str = Query("ca", pattern="^(ca|es|en)$"),
    party: str | None = Query(None, max_length=32),
) -> list[dict[str, object]]:
    """Pacts, coalitions and candidacies for the 29-N general election.

    A pass-through of Google News, like the topic news: several searches
    merged, newest first, at most three articles per outlet. Cached for
    30 minutes; ``[]`` when Google News cannot be reached.

    Each article lists the parties its headline names (``parties``, slugs of
    ``app.services.election_parties``); ``party`` keeps only those naming it.
    """
    if party is not None and party not in BY_SLUG:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown party")

    async def _factory() -> list[dict[str, object]]:
        items = await fetch_election_news(locale, party)
        return [
            {
                "title": it.title,
                "url": it.url,
                "source": it.source,
                "published_at": it.published_at.isoformat() if it.published_at else None,
                "parties": parties_in(it.title),
            }
            for it in items
        ]

    return await cached(f"news:elections:{locale}:{party or 'all'}:v2", 1800, _factory)
