"""API endpoints for topics."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Initiative, InitiativeTopic, Topic
from app.schemas import InitiativeRead, TopicRead

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
