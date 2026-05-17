"""API endpoints for votes with advanced filters.

The filter combinator here is one of the core value propositions of the project:
allow journalists and citizens to query "all housing-related votes in the current
legislature where Pedro Sánchez voted Aye" in a single request.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import (
    Initiative,
    InitiativeTopic,
    InitiativeType,
    ParliamentaryGroup,
    Topic,
    Vote,
    VoteResult,
)
from app.models import (
    Session as SessionModel,
)
from app.schemas import InitiativeTopicSlug, VoteRead
from app.services.proposing_group import resolve_proposing_group

router = APIRouter(prefix="/votes", tags=["votes"])


@router.get("", response_model=dict)
async def list_votes(
    chamber_id: int | None = Query(None, description="Filter by chamber"),
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    topic_slug: str | None = Query(None, description="Filter by topic slug, e.g. 'habitatge'"),
    initiative_type: InitiativeType | None = Query(None, description="Filter by initiative type"),
    proposing_group_slug: str | None = Query(
        None, description="Filter by the parliamentary group that proposed the vote"
    ),
    result: VoteResult | None = Query(None, description="Filter by vote result"),
    date_from: date | None = Query(None, description="Earliest vote date (inclusive)"),
    date_to: date | None = Query(None, description="Latest vote date (inclusive)"),
    q: str | None = Query(None, description="Search in vote title or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """List votes with combinable filters.

    Returns paginated results. All filters are optional and combine with AND.
    """
    base_stmt = (
        select(Vote)
        .join(SessionModel, Vote.session_id == SessionModel.id)
        .options(selectinload(Vote.initiative))
    )
    count_stmt = (
        select(func.count(Vote.id))
        .select_from(Vote)
        .join(SessionModel, Vote.session_id == SessionModel.id)
    )

    conditions = []

    if chamber_id is not None:
        conditions.append(SessionModel.chamber_id == chamber_id)

    if legislature_id is not None:
        conditions.append(SessionModel.legislature_id == legislature_id)

    if result is not None:
        conditions.append(Vote.result == result)

    if date_from is not None:
        conditions.append(Vote.voted_at >= date_from)

    if date_to is not None:
        # ``voted_at`` is a TIMESTAMP, so a naive ``<= date_to`` compares
        # against ``date_to 00:00:00`` and silently drops every vote
        # cast later that same day. Cast both sides to date so the upper
        # bound is *inclusive of the whole day*, which is what the
        # calendar UI implies when the user picks a single date.
        conditions.append(func.date(Vote.voted_at) <= date_to)

    if q:
        # Search both the procedural category (title) and the actual subject
        # (description). The portal stores the meaningful text only in the
        # description; without this OR, common queries return nothing.
        conditions.append(Vote.title.ilike(f"%{q}%") | Vote.description.ilike(f"%{q}%"))

    if proposing_group_slug == "govern":
        # Synthetic slug — votes whose proposer is the Government itself
        # (Proyectos de Ley, Real Decreto-ley convalidations). See
        # migration 0009 for the rule and ingestion's
        # ``_looks_government_proposed``.
        conditions.append(Vote.proposed_by_government.is_(True))
    elif proposing_group_slug is not None:
        base_stmt = base_stmt.join(
            ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id
        )
        count_stmt = count_stmt.join(
            ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id
        )
        conditions.append(ParliamentaryGroup.slug == proposing_group_slug)

    # Initiative-based filters require joining the Initiative table
    needs_initiative_join = initiative_type is not None or topic_slug is not None
    if needs_initiative_join:
        base_stmt = base_stmt.join(Initiative, Vote.initiative_id == Initiative.id)
        count_stmt = count_stmt.join(Initiative, Vote.initiative_id == Initiative.id)

        if initiative_type is not None:
            conditions.append(Initiative.type == initiative_type)

        if topic_slug is not None:
            base_stmt = base_stmt.join(
                InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
            ).join(Topic, Topic.id == InitiativeTopic.topic_id)
            count_stmt = count_stmt.join(
                InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
            ).join(Topic, Topic.id == InitiativeTopic.topic_id)
            conditions.append(Topic.slug == topic_slug)

    if conditions:
        base_stmt = base_stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = base_stmt.order_by(Vote.voted_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().unique().all())

    groups = list((await db.execute(select(ParliamentaryGroup))).scalars().all())

    # Bulk-load topics for every initiative present in this page. One
    # JOIN regardless of how many votes link to an initiative; cheaper
    # than N round-trips and keeps the response shape consistent with
    # the single-vote endpoint that exposes the same field.
    init_ids = [v.initiative_id for v in items if v.initiative_id is not None]
    topics_by_initiative = await _load_topics_by_initiative(db, init_ids)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            _serialize_vote(v, groups, topics_by_initiative) for v in items
        ],
    }


async def _load_topics_by_initiative(
    db: AsyncSession, initiative_ids: list[int]
) -> dict[int, list[Topic]]:
    """Bulk-load topic rows attached to a list of initiative ids.

    Returns a ``{initiative_id: [Topic, ...]}`` map (empty list for
    unclassified initiatives). One indexed query regardless of input
    size; called by the list endpoint to populate ``VoteRead.topics``
    without an N+1 pattern.
    """
    if not initiative_ids:
        return {}
    rows = (
        await db.execute(
            select(InitiativeTopic.initiative_id, Topic)
            .join(Topic, Topic.id == InitiativeTopic.topic_id)
            .where(InitiativeTopic.initiative_id.in_(initiative_ids))
        )
    ).all()
    by_id: dict[int, list[Topic]] = {iid: [] for iid in initiative_ids}
    for initiative_id, topic in rows:
        by_id.setdefault(initiative_id, []).append(topic)
    return by_id


@router.get("/{vote_id}", response_model=VoteRead)
async def get_vote(vote_id: int, db: AsyncSession = Depends(get_session)) -> VoteRead:
    """Get a single vote by ID, enriched with the proposing group when known."""
    result = await db.execute(
        select(Vote).where(Vote.id == vote_id).options(selectinload(Vote.initiative))
    )
    vote = result.scalar_one_or_none()
    if vote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")
    groups = list((await db.execute(select(ParliamentaryGroup))).scalars().all())
    topics_by_initiative = await _load_topics_by_initiative(
        db, [vote.initiative_id] if vote.initiative_id is not None else []
    )
    return _serialize_vote(vote, groups, topics_by_initiative)


def _serialize_vote(
    vote: Vote,
    groups: list[ParliamentaryGroup],
    topics_by_initiative: dict[int, list[Topic]] | None = None,
) -> VoteRead:
    """Build a ``VoteRead`` and enrich it with proposing group + plain summary."""
    base = VoteRead.model_validate(vote)
    update: dict[str, object] = {}
    proposer = resolve_proposing_group(vote.description, groups)
    if proposer is not None:
        update["proposing_group_slug"] = proposer.slug
        update["proposing_group_short"] = proposer.name_short
        update["proposing_group_color"] = proposer.color_hex
    # Plain-language summary resolution:
    # 1. Prefer vote-owned fields (populated by ``generate_vote_plain_summaries``
    #    for votes without a linked Initiative — PNL, mociones, reform debates).
    # 2. Fall back to the linked Initiative's per-language column when the
    #    vote-side value is NULL and ``initiative_id`` is set.
    # When BOTH carry a value, vote wins — it's the more specific record.
    summary_ca: str | None = vote.plain_summary_ca
    summary_es: str | None = vote.plain_summary_es
    summary_provider: str | None = vote.plain_summary_provider
    if vote.initiative_id is not None and vote.initiative is not None:
        if summary_ca is None:
            summary_ca = vote.initiative.plain_summary_ca
        if summary_es is None:
            summary_es = vote.initiative.plain_summary_es
        if summary_provider is None:
            summary_provider = vote.initiative.plain_summary_provider
    if summary_ca is not None or summary_es is not None or summary_provider is not None:
        update["plain_summary_ca"] = summary_ca
        update["plain_summary_es"] = summary_es
        update["plain_summary_provider"] = summary_provider
    # Topics attached to the linked Initiative — bulk-loaded by the
    # list handler. Translated to the InitiativeTopicSlug shape the
    # frontend already consumes on /initiatives/<id>.
    if (
        topics_by_initiative is not None
        and vote.initiative_id is not None
        and vote.initiative_id in topics_by_initiative
    ):
        topic_rows = topics_by_initiative[vote.initiative_id]
        update["topics"] = [
            InitiativeTopicSlug(
                slug=t.slug,
                name_ca=t.name_ca,
                name_es=t.name_es,
                name_en=t.name_en,
                color_hex=t.color_hex,
                icon=t.icon,
                kind=t.kind,
            )
            for t in topic_rows
        ]
    return base.model_copy(update=update) if update else base
