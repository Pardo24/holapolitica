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
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import (
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    Topic,
    Vote,
)
from app.schemas import (
    InitiativeDetail,
    InitiativeRead,
    InitiativeTopicSlug,
    InitiativeVoteSummary,
)

router = APIRouter(prefix="/initiatives", tags=["initiatives"])

# Initiative types that CREATE LAW (binding). Mirrors the frontend's
# ``LAW_TYPE_BINDING`` in frontend/lib/lawTypes.ts — kept in sync by hand.
# These are the initiatives that actually change the law; the rest
# (PNL / Moció / Interpel·lació) are positions, surfaced as a secondary lens.
_LAW_TYPES: tuple[InitiativeType, ...] = (
    InitiativeType.PROYECTO_LEY,
    InitiativeType.PROPOSICION_LEY,
    InitiativeType.REAL_DECRETO_LEY,
)


def _split_csv(value: str | None) -> list[str]:
    """Parse a possibly-comma-separated query value into a clean slug list."""
    if value is None:
        return []
    return [token.strip() for token in value.split(",") if token.strip()]


@router.get("", response_model=dict)
async def list_initiatives(
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    chamber_id: int | None = Query(None, description="Filter by chamber"),
    creates_law: bool | None = Query(
        None,
        description=(
            "True → only law-creating types (Projecte/Proposició de Llei, "
            "Reial Decret Llei). False → only non-binding positions (PNL, "
            "Moció, Interpel·lació). Omit for all. This is the 'laws' lens."
        ),
    ),
    initiative_type: InitiativeType | None = Query(
        None, description="Filter by a specific initiative type."
    ),
    status_filter: InitiativeStatus | None = Query(
        None, alias="status", description="Filter by lifecycle status."
    ),
    topic_slug: str | None = Query(
        None, description="Topic slug, or a comma-separated list evaluated as OR."
    ),
    q: str | None = Query(None, description="Search in the initiative title."),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """List initiatives with combinable filters — the 'laws' lens.

    Powers the /lleis view. Callers pass ``creates_law=true`` to surface
    only the initiatives that actually become law and demote the non-binding
    positions (PNL / Moció) to a secondary lens. Each row carries
    ``latest_vote_result`` so the view can show a credible outcome even for
    series (e.g. Reial Decret Llei) whose imported ``status`` is unreliable.

    Order: most recent first by ``submitted_at`` (NULLs last), then id.
    """
    base_stmt = select(Initiative)
    count_stmt = select(func.count(func.distinct(Initiative.id))).select_from(Initiative)

    conditions = []
    if legislature_id is not None:
        conditions.append(Initiative.legislature_id == legislature_id)
    if chamber_id is not None:
        conditions.append(Initiative.chamber_id == chamber_id)
    if creates_law is True:
        conditions.append(Initiative.type.in_(_LAW_TYPES))
    elif creates_law is False:
        conditions.append(Initiative.type.not_in(_LAW_TYPES))
    if initiative_type is not None:
        conditions.append(Initiative.type == initiative_type)
    if status_filter is not None:
        conditions.append(Initiative.status == status_filter)
    if q:
        conditions.append(Initiative.title_original.ilike(f"%{q}%"))

    topic_slugs = _split_csv(topic_slug)
    if topic_slugs:
        base_stmt = base_stmt.join(
            InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
        ).join(Topic, Topic.id == InitiativeTopic.topic_id)
        count_stmt = count_stmt.join(
            InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
        ).join(Topic, Topic.id == InitiativeTopic.topic_id)
        conditions.append(Topic.slug.in_(topic_slugs))

    if conditions:
        base_stmt = base_stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    total = (await session.execute(count_stmt)).scalar_one()
    stmt = (
        base_stmt.order_by(Initiative.submitted_at.desc().nullslast(), Initiative.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await session.execute(stmt)).scalars().unique().all())

    latest_result_by_initiative = await _load_latest_vote_result(
        session, [i.id for i in items]
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                **InitiativeRead.model_validate(i).model_dump(mode="json"),
                "latest_vote_result": latest_result_by_initiative.get(i.id),
            }
            for i in items
        ],
    }


async def _load_latest_vote_result(
    session: AsyncSession, initiative_ids: list[int]
) -> dict[int, str | None]:
    """Map each initiative id to the result of its most recent linked vote.

    One bulk query over the page's initiative ids; ordered latest-first so
    the first row seen per initiative is the most recent vote. Empty when an
    initiative has no linked vote yet. Lets the laws view show the real
    outcome where the imported ``Initiative.status`` is unreliable (RDL).
    """
    if not initiative_ids:
        return {}
    rows = (
        await session.execute(
            select(Vote.initiative_id, Vote.result, Vote.voted_at)
            .where(Vote.initiative_id.in_(initiative_ids))
            .order_by(Vote.voted_at.desc())
        )
    ).all()
    out: dict[int, str | None] = {}
    for initiative_id, result, _voted_at in rows:
        if initiative_id is not None and initiative_id not in out:
            # ``VoteResult`` is a StrEnum, so the row value is already a
            # plain string; ``str(...)`` normalises it for the JSON body.
            out[initiative_id] = str(result) if result is not None else None
    return out


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
