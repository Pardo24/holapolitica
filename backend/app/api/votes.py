"""API endpoints for votes with advanced filters.

The filter combinator here is one of the core value propositions of the project:
allow journalists and citizens to query "all housing-related votes in the current
legislature where Pedro Sánchez voted Aye" in a single request.
"""

from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.legislatures import HemicycleLayout, HemicycleSeat
from app.db import get_session
from app.ingest.congreso.hemicycle import (
    HEMICYCLE_IMAGE_HEIGHT,
    HEMICYCLE_IMAGE_WIDTH,
)
from app.models import (
    GroupMembership,
    Initiative,
    InitiativeTopic,
    InitiativeType,
    Mandate,
    ParliamentaryGroup,
    Person,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
    VoteResult,
)
from app.models import (
    Session as SessionModel,
)
from app.schemas import InitiativeTopicSlug, VoteRead
from app.services.cache import cached
from app.services.proposing_group import resolve_proposing_group

router = APIRouter(prefix="/votes", tags=["votes"])


def _split_csv(value: str | None) -> list[str]:
    """Parse a possibly-comma-separated query value into a clean slug list.

    ``?topic_slug=habitatge,sanitat`` and ``?topic_slug=habitatge`` both
    come through here. Empty strings and whitespace-only tokens are
    dropped so a trailing comma in the URL doesn't widen the filter
    to "everything".
    """
    if value is None:
        return []
    return [token.strip() for token in value.split(",") if token.strip()]


@router.get("", response_model=dict)
async def list_votes(
    chamber_id: int | None = Query(None, description="Filter by chamber"),
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    topic_slug: str | None = Query(
        None,
        description=(
            "Filter by topic slug. Accepts either a single slug ('habitatge') "
            "or a comma-separated list ('habitatge,sanitat') — the list is "
            "evaluated as OR across values."
        ),
    ),
    initiative_type: InitiativeType | None = Query(None, description="Filter by initiative type"),
    proposing_group_slug: str | None = Query(
        None,
        description=(
            "Filter by the parliamentary group that proposed the vote. "
            "Accepts a single slug or a comma-separated list; the synthetic "
            "slug 'govern' matches Government-proposed votes and composes "
            "with any number of group slugs as OR."
        ),
    ),
    result: VoteResult | None = Query(None, description="Filter by vote result"),
    law_only: bool = Query(
        False,
        description=(
            "Keep only law-creating votes — those whose expediente is a "
            "Proyecto de Ley (121), Proposición de Ley (122) or Real "
            "Decreto-ley (130). Works for historical legislatures too, where "
            "votes have no linked Initiative: the lens reads the expediente "
            "prefix, not initiative_type."
        ),
    ),
    date_from: date | None = Query(None, description="Earliest vote date (inclusive)"),
    date_to: date | None = Query(None, description="Latest vote date (inclusive)"),
    q: str | None = Query(None, description="Search in vote title or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """List votes with combinable filters.

    Returns paginated results. All filters are optional and combine with AND.
    Within ``topic_slug`` and ``proposing_group_slug`` multiple values
    compose as OR (a vote matches if it touches ANY of the selected
    topics, regardless of how many other topics it also touches).
    """
    base_stmt = (
        select(Vote)
        .join(SessionModel, Vote.session_id == SessionModel.id)
        .options(selectinload(Vote.initiative))
    )
    count_stmt = (
        # Distinct so multi-topic / multi-group filters that JOIN
        # InitiativeTopic don't inflate the count for a vote that
        # matches more than one of the selected topics.
        select(func.count(func.distinct(Vote.id)))
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

    if law_only:
        # Law-creating expediente series: 121 Proyecto de Ley, 122 Proposición
        # de Ley, 130 Real Decreto-ley. Prefix match on the raw expediente so
        # it works on historical votes with no linked Initiative.
        conditions.append(
            or_(
                Vote.expediente_raw.like("121/%"),
                Vote.expediente_raw.like("122/%"),
                Vote.expediente_raw.like("130/%"),
            )
        )

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

    group_slugs = _split_csv(proposing_group_slug)
    if group_slugs:
        wants_government = "govern" in group_slugs
        real_group_slugs = [s for s in group_slugs if s != "govern"]
        # Multi-select OR: government flag + any selected real groups.
        # When the synthetic 'govern' slug is alongside other slugs we
        # match votes that are EITHER government-proposed OR proposed
        # by any of the selected groups.
        clauses = []
        if wants_government:
            clauses.append(Vote.proposed_by_government.is_(True))
        if real_group_slugs:
            base_stmt = base_stmt.join(
                ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id
            )
            count_stmt = count_stmt.join(
                ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id
            )
            clauses.append(ParliamentaryGroup.slug.in_(real_group_slugs))
        if len(clauses) == 1:
            conditions.append(clauses[0])
        elif len(clauses) > 1:
            conditions.append(or_(*clauses))

    topic_slugs = _split_csv(topic_slug)
    # Initiative-based filters require joining the Initiative table
    needs_initiative_join = initiative_type is not None or bool(topic_slugs)
    if needs_initiative_join:
        base_stmt = base_stmt.join(Initiative, Vote.initiative_id == Initiative.id)
        count_stmt = count_stmt.join(Initiative, Vote.initiative_id == Initiative.id)

        if initiative_type is not None:
            conditions.append(Initiative.type == initiative_type)

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
    types_by_initiative = await _load_types_by_initiative(db, init_ids)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            _serialize_vote(v, groups, topics_by_initiative, types_by_initiative) for v in items
        ],
    }


async def _load_types_by_initiative(
    db: AsyncSession, initiative_ids: list[int]
) -> dict[int, InitiativeType]:
    """Bulk-load the procedural ``type`` of a list of initiatives.

    Returns ``{initiative_id: InitiativeType}`` (initiatives not found are
    simply absent). One indexed query regardless of input size; powers
    ``VoteRead.initiative_type`` on the list endpoint without N+1.
    """
    if not initiative_ids:
        return {}
    rows = (
        await db.execute(
            select(Initiative.id, Initiative.type).where(Initiative.id.in_(initiative_ids))
        )
    ).all()
    return {iid: typ for iid, typ in rows}


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


class DissidentPerson(BaseModel):
    """A single deputy who voted opposite their group's majority position."""

    person_id: int
    full_name: str
    photo_url: str | None
    constituency: str | None
    vote_choice: str  # 'aye' / 'no' / 'abstention' / 'no_vote'


class GroupDissidentBlock(BaseModel):
    """Per-group dissident bucket: the group, its majority position,
    and the list of deputies who broke ranks. Symmetric by
    construction — every group with at least one dissident appears,
    regardless of which side broke. Groups with full unity disappear
    so the section never gets padded with "0 dissidents" noise.
    """

    group_slug: str
    group_name_short: str
    group_color_hex: str | None
    majority_choice: str  # the choice the majority of the group made
    majority_count: int
    dissidents: list[DissidentPerson]


class VoteDissidentsResponse(BaseModel):
    blocks: list[GroupDissidentBlock]


async def _compute_dissidents(db: AsyncSession, vote_id: int) -> VoteDissidentsResponse:
    """Identify every deputy who voted against their group's majority on this vote.

    The grouping is "the deputy's group AT THE TIME of the vote"
    (open GroupMembership intersecting ``vote.voted_at``), not the
    deputy's current group — a substitution that happened after the
    vote shouldn't reshuffle who counts as a dissident retroactively.

    Returns one :class:`GroupDissidentBlock` per group that had at
    least one dissident; groups with full unity are omitted from
    the response (the cohesion endpoint already shows them as 100%).
    """
    vote = (await db.execute(select(Vote).where(Vote.id == vote_id))).scalar_one_or_none()
    if vote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")

    # One query: every VoteRecord on this vote, joined to the deputy
    # and the parliamentary group they belonged to at the moment of
    # the vote. Group membership is point-in-time — a deputy who
    # switched groups after this vote stays attributed to their
    # original group here.
    rows = (
        await db.execute(
            select(
                VoteRecord.choice,
                Person.id,
                Person.full_name,
                Person.photo_url,
                Mandate.constituency,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
            )
            .join(Mandate, Mandate.id == VoteRecord.mandate_id)
            .join(Person, Person.id == Mandate.person_id)
            .join(GroupMembership, GroupMembership.mandate_id == Mandate.id)
            .join(
                ParliamentaryGroup,
                ParliamentaryGroup.id == GroupMembership.group_id,
            )
            .where(VoteRecord.vote_id == vote_id)
            .where(GroupMembership.start_date <= vote.voted_at)
            .where(
                or_(
                    GroupMembership.end_date.is_(None),
                    GroupMembership.end_date > vote.voted_at,
                )
            )
        )
    ).all()

    # Bucket choices per group, track per-deputy choice + identity.
    by_group: dict[str, dict[str, object]] = {}
    for (
        choice,
        person_id,
        full_name,
        photo_url,
        constituency,
        slug,
        short,
        color,
    ) in rows:
        if slug not in by_group:
            by_group[slug] = {
                "slug": slug,
                "short": short,
                "color": color,
                "choices": Counter(),
                "members": [],
            }
        counter = by_group[slug]["choices"]
        assert isinstance(counter, Counter)
        counter[choice] += 1
        members = by_group[slug]["members"]
        assert isinstance(members, list)
        members.append(
            {
                "person_id": person_id,
                "full_name": full_name,
                "photo_url": photo_url,
                "constituency": constituency,
                "choice": choice,
            }
        )

    blocks: list[GroupDissidentBlock] = []
    for _slug, info in by_group.items():
        choices = info["choices"]
        members = info["members"]
        assert isinstance(choices, Counter)
        assert isinstance(members, list)
        if not choices:
            continue
        # Skip non-stance choices from BOTH the majority calculation
        # and the dissidents list. ``absent`` (didn't attend) and
        # ``no_vote_recorded`` (present but didn't press a button —
        # e.g. presidency or deliberate non-vote) are not a stance.
        # Counting them in the majority would inflate dissidence on
        # procedural votes some groups deliberately sit out; counting
        # them as dissidents would misrepresent passive absence as
        # active dissent.
        non_stance = {"absent", "no_vote_recorded"}
        choices_excluding_absent = Counter(
            {k: v for k, v in choices.items() if k not in non_stance}
        )
        if not choices_excluding_absent:
            continue
        majority_choice, majority_count = choices_excluding_absent.most_common(1)[0]
        dissidents: list[DissidentPerson] = []
        for m in members:
            assert isinstance(m, dict)
            ch = m["choice"]
            # A dissident is a deputy who took a STANCE different
            # from the group majority. Absences and no-vote-recorded
            # are not dissent.
            if ch in non_stance or ch == majority_choice:
                continue
            dissidents.append(
                DissidentPerson(
                    person_id=int(m["person_id"]),
                    full_name=str(m["full_name"]),
                    photo_url=(str(m["photo_url"]) if m["photo_url"] is not None else None),
                    constituency=(
                        str(m["constituency"]) if m["constituency"] is not None else None
                    ),
                    vote_choice=str(ch),
                )
            )
        if not dissidents:
            continue
        dissidents.sort(key=lambda d: d.full_name.casefold())
        blocks.append(
            GroupDissidentBlock(
                group_slug=str(info["slug"]),
                group_name_short=str(info["short"]),
                group_color_hex=(str(info["color"]) if info["color"] is not None else None),
                majority_choice=str(majority_choice),
                majority_count=int(majority_count),
                dissidents=dissidents,
            )
        )
    # Stable order: groups with more dissidents first; ties by name.
    blocks.sort(key=lambda b: (-len(b.dissidents), b.group_name_short))
    return VoteDissidentsResponse(blocks=blocks)


class GroupVoteChoiceRow(BaseModel):
    """How one parliamentary group voted across a set of votes.

    ``choices`` maps a ``vote_id`` (as a string, for JSON) to the group's
    MAJORITY choice on that vote: ``aye`` / ``no`` / ``abstention`` /
    ``absent`` (absent folds in ``no_vote_recorded``). A vote absent from the
    map means the group has no records for it.
    """

    slug: str
    name_short: str
    color_hex: str | None
    choices: dict[str, str]


class GroupVoteMatrixResponse(BaseModel):
    groups: list[GroupVoteChoiceRow]


def _fold_choice(choice: str) -> str:
    """Collapse the raw choice into the four the matrix renders."""
    if choice in (VoteChoice.ABSENT.value, VoteChoice.NO_VOTE_RECORDED.value):
        return VoteChoice.ABSENT.value
    return choice


@router.get("/group-choices", response_model=GroupVoteMatrixResponse)
async def get_group_choices(
    ids: str = Query(..., description="Comma-separated vote ids (max 50)."),
    db: AsyncSession = Depends(get_session),
) -> GroupVoteMatrixResponse:
    """Per-group majority choice across a set of votes.

    Feeds the "how each group voted across a law's votes" matrix in the
    session sheet: pass the vote ids of one law's votes and get, per group,
    its majority stance on each. Declared BEFORE ``/{vote_id}`` so the
    literal path wins over the int path param.
    """
    vote_ids = [int(x) for x in ids.split(",") if x.strip().lstrip("-").isdigit()][:50]
    if not vote_ids:
        return GroupVoteMatrixResponse(groups=[])

    async def factory() -> GroupVoteMatrixResponse:
        rows = (
            await db.execute(
                select(
                    VoteRecord.vote_id,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                    VoteRecord.choice,
                    func.count().label("n"),
                )
                .join(
                    ParliamentaryGroup,
                    ParliamentaryGroup.id == VoteRecord.group_id_at_time,
                )
                .where(VoteRecord.vote_id.in_(vote_ids))
                .group_by(
                    VoteRecord.vote_id,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                    VoteRecord.choice,
                )
            )
        ).all()

        # (slug, vote_id) -> {folded_choice: count}; plus per-slug meta + size.
        counts: dict[tuple[str, int], Counter[str]] = {}
        meta: dict[str, tuple[str, str | None]] = {}
        size: dict[str, int] = {}
        for vote_id, slug, name_short, color_hex, choice, n in rows:
            key = (slug, vote_id)
            counts.setdefault(key, Counter())[_fold_choice(choice)] += n
            meta[slug] = (name_short, color_hex)
            size[slug] = size.get(slug, 0) + n

        groups: list[GroupVoteChoiceRow] = []
        for slug in sorted(meta, key=lambda s: (-size.get(s, 0), s)):
            name_short, color_hex = meta[slug]
            choice_map: dict[str, str] = {}
            for vid in vote_ids:
                c = counts.get((slug, vid))
                if c:
                    # Majority choice; ties break deterministically by name.
                    choice_map[str(vid)] = max(c.items(), key=lambda kv: (kv[1], kv[0]))[0]
            groups.append(
                GroupVoteChoiceRow(
                    slug=slug,
                    name_short=name_short,
                    color_hex=color_hex,
                    choices=choice_map,
                )
            )
        return GroupVoteMatrixResponse(groups=groups)

    key = "votes:group-choices:v1:" + ",".join(str(v) for v in sorted(vote_ids))
    return await cached(key, 3600, factory)


@router.get("/{vote_id}/dissidents", response_model=VoteDissidentsResponse)
async def get_vote_dissidents(
    vote_id: int, db: AsyncSession = Depends(get_session)
) -> VoteDissidentsResponse:
    """Per-group list of deputies who voted against their group on this vote.

    Cached for 1 h — the underlying data (VoteRecords for a closed
    vote) doesn't change once a vote is published; the only reason
    to invalidate is a backfill of historical group memberships,
    which is rare.
    """
    return await cached(
        f"votes:{vote_id}:dissidents:v1",
        3600,
        lambda: _compute_dissidents(db, vote_id),
    )


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
    # The initiative is selectinloaded above, so read its type directly
    # rather than issuing a second query.
    types_by_initiative: dict[int, InitiativeType] = (
        {vote.initiative_id: vote.initiative.type}
        if vote.initiative_id is not None and vote.initiative is not None
        else {}
    )
    return _serialize_vote(vote, groups, topics_by_initiative, types_by_initiative)


def _serialize_vote(
    vote: Vote,
    groups: list[ParliamentaryGroup],
    topics_by_initiative: dict[int, list[Topic]] | None = None,
    types_by_initiative: dict[int, InitiativeType] | None = None,
) -> VoteRead:
    """Build a ``VoteRead`` and enrich it with proposing group + plain summary."""
    base = VoteRead.model_validate(vote)
    update: dict[str, object] = {}
    if (
        types_by_initiative is not None
        and vote.initiative_id is not None
        and vote.initiative_id in types_by_initiative
    ):
        update["initiative_type"] = types_by_initiative[vote.initiative_id]
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


# ---------------------------------------------------------------------------
# Per-vote hemicycle — seats coloured by vote choice
# ---------------------------------------------------------------------------


class VoteHemicycleSeat(HemicycleSeat):
    """One seat with the choice cast on a specific vote.

    Extends :class:`HemicycleSeat` with a single new field so the
    frontend's existing :class:`Hemicycle` component can switch its
    fill rule by passing ``coloredBy="vote"`` and look at
    ``seat.vote_choice`` instead of ``seat.group_color``. Persons who
    were on an open mandate but cast no record (procedural quirks,
    presiding role) come through as ``vote_choice="absent"`` so the
    chart still accounts for every seat.
    """

    vote_choice: str


class VoteHemicycleLayout(HemicycleLayout):
    """Per-vote hemicycle response: same shape as the legislature layout,
    but every seat carries the choice the seat-holder cast."""

    vote_id: int
    seats: list[VoteHemicycleSeat]  # type: ignore[assignment]


async def _compute_vote_hemicycle(session: AsyncSession, vote_id: int) -> VoteHemicycleLayout:
    """Build the seat-by-choice layout for a single vote.

    Anchors on the vote's parent session to resolve the legislature,
    then runs the same per-seat enrichment as the legislature-wide
    layout, LEFT JOINing :class:`VoteRecord` on ``(vote_id, mandate)``
    to pull the actual choice. Mandates without a record default to
    ``"absent"`` — visually identical to deputies who showed up and
    were marked absent in the source data.
    """
    vote_row = (
        await session.execute(
            select(Vote.id, SessionModel.legislature_id)
            .join(SessionModel, SessionModel.id == Vote.session_id)
            .where(Vote.id == vote_id)
        )
    ).one_or_none()
    if vote_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")
    _, legislature_id = vote_row

    rows = (
        await session.execute(
            select(
                Person.id,
                Person.full_name,
                Person.photo_url,
                Person.seat_x,
                Person.seat_y,
                Person.role_title,
                Person.role_kind,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
                Mandate.constituency,
                Mandate.start_date,
                VoteRecord.choice,
            )
            .join(Mandate, Mandate.person_id == Person.id)
            .outerjoin(
                GroupMembership,
                (GroupMembership.mandate_id == Mandate.id) & (GroupMembership.end_date.is_(None)),
            )
            .outerjoin(
                ParliamentaryGroup,
                ParliamentaryGroup.id == GroupMembership.group_id,
            )
            .outerjoin(
                VoteRecord,
                (VoteRecord.mandate_id == Mandate.id) & (VoteRecord.vote_id == vote_id),
            )
            .where(Mandate.legislature_id == legislature_id)
            .where(Mandate.end_date.is_(None))
            .order_by(Person.id, Mandate.start_date.desc())
        )
    ).all()

    by_person: dict[int, VoteHemicycleSeat] = {}
    for (
        pid,
        full_name,
        photo_url,
        seat_x,
        seat_y,
        role_title,
        role_kind,
        slug,
        short,
        color,
        constituency,
        _start,
        choice,
    ) in rows:
        if pid in by_person:
            continue
        # No VoteRecord row → the deputy is treated as absent. The
        # frontend's color map paints this in the neutral "no-vote"
        # grey so the seat stays visible without claiming a position
        # the person never expressed.
        #
        # ``choice`` reaches us as a plain string: VoteRecord.choice is
        # a String column holding VoteChoice values, so Core SELECTs
        # (this one) return str while ORM attribute access would return
        # the enum. Normalise via str() so both shapes survive.
        resolved_choice: str = (
            str(choice.value if isinstance(choice, VoteChoice) else choice)
            if choice is not None
            else VoteChoice.ABSENT.value
        )
        by_person[pid] = VoteHemicycleSeat(
            person_id=pid,
            full_name=full_name,
            photo_url=photo_url,
            group_slug=slug,
            group_short=short,
            group_color=color,
            seat_x=seat_x,
            seat_y=seat_y,
            constituency=constituency,
            role_title=role_title,
            role_kind=role_kind,
            vote_choice=resolved_choice,
        )

    seated = [s for s in by_person.values() if s.seat_y is not None and s.seat_x is not None]
    unseated = [s for s in by_person.values() if s.seat_y is None or s.seat_x is None]
    seated.sort(key=lambda s: ((s.seat_y or 0), (s.seat_x or 0), s.person_id))
    unseated.sort(key=lambda s: (s.full_name, s.person_id))

    return VoteHemicycleLayout(
        legislature_id=legislature_id,
        vote_id=vote_id,
        image_width=HEMICYCLE_IMAGE_WIDTH,
        image_height=HEMICYCLE_IMAGE_HEIGHT,
        seats=seated + unseated,
    )


@router.get("/{vote_id}/hemicycle", response_model=VoteHemicycleLayout)
async def get_vote_hemicycle(
    vote_id: int, db: AsyncSession = Depends(get_session)
) -> VoteHemicycleLayout:
    """Per-vote hemicycle: every seat carries the choice cast on this vote.

    Cached for 1 h — once a vote is published, neither its records
    nor the seat positions change. Cache busts implicitly when the
    hemicycle ingest re-runs (new key version) or the cache TTL lapses.
    """
    return await cached(
        f"votes:{vote_id}:hemicycle:v1",
        3600,
        lambda: _compute_vote_hemicycle(db, vote_id),
    )
