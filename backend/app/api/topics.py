"""API endpoints for topics."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Initiative, InitiativeTopic, Topic
from app.schemas import InitiativeRead, TopicNewsRead, TopicRead
from app.services.cache import cached
from app.services.topic_news import fetch_topic_news

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicRead])
async def list_topics(
    kind: str | None = Query(
        None,
        description=(
            "Filter by classification knowledge base. Use 'theme' for the "
            "editorial 17-topic taxonomy or 'sdg' for the 17 UN "
            "Sustainable Development Goals. Omit to return all topics."
        ),
        pattern="^(theme|sdg)$",
    ),
    session: AsyncSession = Depends(get_session),
) -> list[Topic]:
    """List topics, optionally filtered by knowledge base.

    Within a single KB, ordering is by ``slug`` so the SDGs come out in
    numeric order (``sdg-01-poverty`` … ``sdg-17-partnerships``) and the
    editorial topics in stable alphabetical order. When no ``kind`` is
    given, ``kind`` itself becomes the primary sort key so the response
    is grouped.
    """
    stmt = select(Topic)
    if kind is not None:
        stmt = stmt.where(Topic.kind == kind)
        stmt = stmt.order_by(Topic.slug)
    else:
        stmt = stmt.order_by(Topic.kind, Topic.slug)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{slug}", response_model=TopicRead)
async def get_topic(slug: str, session: AsyncSession = Depends(get_session)) -> Topic:
    """Get a topic by its slug."""
    result = await session.execute(select(Topic).where(Topic.slug == slug))
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    return topic


@router.get("/{slug}/initiatives", response_model=list[InitiativeRead])
async def list_topic_initiatives(
    slug: str,
    legislature_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    session: AsyncSession = Depends(get_session),
) -> list[Initiative]:
    """All initiatives classified under ``slug``, regardless of vote linkage.

    The /topics card surfaces an initiative count from
    ``stats.topics.global``. When the user enters the topic detail, they
    expect the same set surfaced here — not a votes-list filter that misses
    initiatives whose vote has no ``initiative_id`` because the vote type
    code (PNL / Mocions) doesn't match the initiative-feed types.

    Order: most recent first by ``submitted_at`` (with NULLs last).
    """
    topic_row = (
        await session.execute(select(Topic.id).where(Topic.slug == slug))
    ).scalar_one_or_none()
    if topic_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    stmt = (
        select(Initiative)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .where(InitiativeTopic.topic_id == topic_row)
    )
    if legislature_id is not None:
        stmt = stmt.where(Initiative.legislature_id == legislature_id)
    if status_filter:
        stmt = stmt.where(Initiative.status == status_filter)
    stmt = stmt.order_by(
        Initiative.submitted_at.desc().nullslast(),
        Initiative.id.desc(),
    )
    return list((await session.execute(stmt)).scalars().all())


@router.get("/{slug}/news", response_model=list[TopicNewsRead])
async def list_topic_news(
    slug: str,
    locale: str = Query("ca", pattern="^(ca|es|en)$"),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, object]]:
    """Recent press mentions of ``slug``, sourced from Google News RSS.

    The Topic Hub renders a "what's in the news" section so a visitor sees
    WHO is currently writing about this theme. The list is a pass-through
    of Google News' own aggregation — we don't curate, rank or filter
    sources, which keeps the project's "mirror not megaphone" stance
    intact (we surface attention, never decide it).

    Cached per (slug, locale) for 1 hour via Redis. Google News refreshes
    within minutes for major stories, but the Topic Hub is one of many
    surfaces — hour-stale data is a fair trade for not hammering Google's
    RSS host on every visit.

    Failure mode: returns ``[]`` on any upstream error. The frontend
    renders the hub without a news section in that case — same null-
    tolerant contract as the Wikidata / BOE enrichments.
    """
    topic = (
        await session.execute(select(Topic).where(Topic.slug == slug))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found"
        )

    # Pick the locale-appropriate display name as the search term so the
    # feed matches the language the visitor is reading the hub in.
    name = {
        "ca": topic.name_ca,
        "es": topic.name_es,
        "en": topic.name_en,
    }[locale]

    async def _factory() -> list[dict[str, object]]:
        # Convert the dataclass items to JSON-ready dicts before they hit
        # the Redis cache. ``cached()`` round-trips through ``json.dumps``
        # and won't serialise ``datetime`` directly; pre-converting keeps
        # the cache write reliable and the response_model coercion cheap.
        items = await fetch_topic_news(name, locale)
        return [
            {
                "title": it.title,
                "url": it.url,
                "source": it.source,
                "published_at": (
                    it.published_at.isoformat() if it.published_at else None
                ),
            }
            for it in items
        ]

    return await cached(f"topics:{slug}:news:{locale}:v1", 3600, _factory)
