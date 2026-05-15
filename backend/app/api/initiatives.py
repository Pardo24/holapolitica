"""API endpoints for individual initiatives.

The bulk ``/dump/initiatives`` endpoint already exposes the full
dataset for journalists and researchers. This router adds the
single-row reader the public frontend needs to render the rich
"Exposición de motivos" prose on the vote-detail page when a vote
links to an initiative.

Aggregate listings (by topic, by group, by status) live elsewhere —
in :mod:`app.api.topics` and :mod:`app.api.stats` — to keep each
router's responsibility narrow.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Initiative, InitiativeTopic, Topic, Vote
from app.schemas import (
    InitiativeDetail,
    InitiativeRead,
    InitiativeTopicSlug,
    InitiativeVoteSummary,
)

router = APIRouter(prefix="/initiatives", tags=["initiatives"])


@router.get("/{initiative_id}", response_model=InitiativeDetail)
async def get_initiative(
    initiative_id: int,
    session: AsyncSession = Depends(get_session),
) -> InitiativeDetail:
    """Get a single initiative by its numeric primary key.

    Returns the full :class:`InitiativeDetail` shape, including the
    ``object_text`` preamble extracted from the bill's BOCG PDF when
    available, plus the linked votes (so the standalone initiative page
    can surface "the vote" without a second round-trip) and the topic
    classifications (used for breadcrumbs and similar-initiative seeds).
    """
    row = (
        await session.execute(select(Initiative).where(Initiative.id == initiative_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative not found")

    votes = (
        (
            await session.execute(
                select(Vote)
                .where(Vote.initiative_id == initiative_id)
                .order_by(desc(Vote.voted_at))
            )
        )
        .scalars()
        .all()
    )

    topic_rows = (
        (
            await session.execute(
                select(Topic)
                .join(InitiativeTopic, InitiativeTopic.topic_id == Topic.id)
                .where(InitiativeTopic.initiative_id == initiative_id)
            )
        )
        .scalars()
        .all()
    )

    # Re-use the InitiativeRead fields by serialising the ORM row then
    # adding the joined collections. Pydantic builds the response model
    # from `model_validate` so the from_attributes config applies.
    base = InitiativeRead.model_validate(row)
    return InitiativeDetail(
        **base.model_dump(),
        votes=[InitiativeVoteSummary.model_validate(v) for v in votes],
        topics=[InitiativeTopicSlug.model_validate(t) for t in topic_rows],
    )


@router.get("/{initiative_id}/related", response_model=list[InitiativeRead])
async def related_initiatives(
    initiative_id: int,
    limit: int = Query(6, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
) -> list[Initiative]:
    """Return initiatives that share at least one topic with the given row.

    Ranking is by the number of overlapping topics (descending) and then
    by submission date (most recent first), so the strongest match leads
    the list. The originating initiative itself is excluded.
    """
    own_topic_ids = (
        (
            await session.execute(
                select(InitiativeTopic.topic_id).where(
                    InitiativeTopic.initiative_id == initiative_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not own_topic_ids:
        return []

    overlap_count = func.count(InitiativeTopic.topic_id).label("overlap")
    stmt = (
        select(Initiative, overlap_count)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .where(InitiativeTopic.topic_id.in_(own_topic_ids))
        .where(Initiative.id != initiative_id)
        .group_by(Initiative.id)
        .order_by(desc(overlap_count), desc(Initiative.submitted_at))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [row[0] for row in rows]
