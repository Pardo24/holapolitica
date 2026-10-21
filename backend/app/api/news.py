"""Press coverage that is not tied to one topic: for now, the election."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas import TopicNewsRead
from app.services.cache import cached
from app.services.topic_news import fetch_election_news

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/elections", response_model=list[TopicNewsRead])
async def election_news(
    locale: str = Query("ca", pattern="^(ca|es|en)$"),
) -> list[dict[str, object]]:
    """Pacts, coalitions and candidacies for the 29-N general election.

    A pass-through of Google News, like the topic news: several searches
    merged, newest first, at most three articles per outlet. Cached for
    30 minutes; ``[]`` when Google News cannot be reached.
    """

    async def _factory() -> list[dict[str, object]]:
        items = await fetch_election_news(locale)
        return [
            {
                "title": it.title,
                "url": it.url,
                "source": it.source,
                "published_at": it.published_at.isoformat() if it.published_at else None,
            }
            for it in items
        ]

    return await cached(f"news:elections:{locale}:v1", 1800, _factory)
