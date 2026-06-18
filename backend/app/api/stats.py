"""Site-wide aggregate statistics endpoints.

These power the public ``/stats`` page. We surface raw counts where
useful and pre-computed breakdowns where the math is non-trivial. The
frontend decides how to render them; this layer stays thin.

CLAUDE.md "regla de simetria" governs what we *can* return — we never
filter to a partisan subset (e.g. "the most rejected initiatives") here.
The frontend can sort and slice for display, but the API surface is the
full universe.

Caching
~~~~~~~

Every endpoint here is read-heavy and cheap to invalidate, so we layer
Redis on top via :mod:`app.services.cache`. TTL is conservative (1h) and
the ingest jobs call ``invalidate("stats:")`` / ``invalidate("metrics:")``
when fresh data lands, so the public site never serves data older than
the most recent ingest run.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, cast, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.metrics import (
    TopicGlobalRow,
    compute_topic_global_stats,
)
from app.models import (
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    Legislature,
    LegislatureStatus,
    ParliamentaryGroup,
    Topic,
    Vote,
    VoteResult,
)
from app.models import (
    Session as SessionModel,
)
from app.services.cache import cached

router = APIRouter(prefix="/stats", tags=["stats"])

# Default TTL for cached read endpoints in this module. Set to 24 h
# because cache freshness is event-driven: every ingest worker
# (latest votes, deputies, initiatives, classify) calls
# ``_invalidate_aggregate_caches`` which wipes the ``stats:*`` and
# ``metrics:*`` namespaces. The TTL is a safety net for the
# unlikely case Redis is restored from a snapshot taken before an
# ingest — a worst-case 24 h of stale data instead of forever.
_CACHE_TTL = 86400  # 24 hours


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class InitiativeTypeCount(BaseModel):
    type: InitiativeType
    count: int


class InitiativeStatusCount(BaseModel):
    status: InitiativeStatus
    count: int


class VoteResultCount(BaseModel):
    result: VoteResult
    count: int


class GroupProposalCount(BaseModel):
    slug: str
    name_short: str
    color_hex: str | None
    count: int


class GlobalSummary(BaseModel):
    initiatives_total: int
    votes_total: int
    initiatives_classified: int


class LegislatureStat(BaseModel):
    """Per-legislature comparative KPIs for the cross-legislature view.

    One row per legislature (X-XV today). Only outcome-level aggregates that
    are cheap to compute over the full vote universe; per-deputy cohesion is a
    heavier, separate computation. ``approval_rate`` is approved / votes_total
    (0 when a legislature has no recorded votes, e.g. a dissolved term)."""

    number: str
    name_ca: str
    name_es: str
    start_date: date
    end_date: date | None
    status: LegislatureStatus
    sessions: int
    votes_total: int
    approved: int
    rejected: int
    tie: int
    assent: int
    approval_rate: float


class InitiativeMini(BaseModel):
    """Compact initiative row for "recent activity" lists.

    A trimmed-down view of :class:`Initiative` — just the fields the
    /stats explorer needs to render a row + a deep link. Includes plain
    summary fields so the frontend can render the SummaryHover affordance
    without an extra fetch per row.
    """

    id: int
    type: InitiativeType
    official_id: str
    title_original: str
    title_ca: str | None
    status: InitiativeStatus
    submitted_at: str | None  # ISO date or None
    plain_summary_ca: str | None = None
    plain_summary_es: str | None = None
    plain_summary_provider: str | None = None


class TopicCount(BaseModel):
    """One topic + an initiative count, used in proposer/group breakdowns."""

    topic_slug: str
    topic_name_ca: str
    topic_color_hex: str | None
    count: int


class ProposerCount(BaseModel):
    """One proposer (parliamentary group OR the cabinet) + an initiative count.

    ``slug`` is the parliamentary group slug, or ``"government"`` for
    government bills (``proposed_by_government=True`` / no group attached).
    """

    slug: str
    name_short: str
    color_hex: str | None
    count: int


class GroupActivity(BaseModel):
    """What one group has been pushing through parliament lately."""

    recent_initiatives: list[InitiativeMini]
    topic_distribution: list[TopicCount]


class TopicProposers(BaseModel):
    """Who proposes initiatives on a topic + recent activity in that topic."""

    top_proposers: list[ProposerCount]
    recent_initiatives: list[InitiativeMini]


class CrossTopicGroupSummary(BaseModel):
    """Minimal topic descriptor used in cross-filter responses."""

    slug: str
    name_ca: str
    color_hex: str | None


class CrossGroupSummary(BaseModel):
    """Minimal group descriptor used in cross-filter responses."""

    slug: str
    name_short: str
    name_long: str
    color_hex: str | None


class CrossTopicGroup(BaseModel):
    """Full snapshot of one (topic, group) intersection.

    Power-feature for the /stats page when BOTH filters are active:

    - ``initiatives_on_topic_by_group``: how many initiatives EACH group has
      filed on this topic. Symmetry rule — every group is always present
      (or zero), the page just highlights the focal one.
    - ``topic_distribution_for_group``: top topics in the focal group's
      initiative footprint, with the focal topic always included so the
      frontend can render it highlighted even when it's not in the top N.
    - ``joint_initiatives``: every initiative this group filed on this
      topic, ordered submitted_at desc. Capped at 50 to bound the payload;
      the page shows a "N total" count separately.
    """

    topic: CrossTopicGroupSummary
    group: CrossGroupSummary
    initiatives_on_topic_by_group: list[ProposerCount]
    topic_distribution_for_group: list[TopicCount]
    joint_initiatives: list[InitiativeMini]
    joint_initiatives_total: int


# ---------------------------------------------------------------------------
# Existing endpoints, now cached
# ---------------------------------------------------------------------------


@router.get("/summary", response_model=GlobalSummary)
async def summary(session: AsyncSession = Depends(get_session)) -> GlobalSummary:
    async def factory() -> GlobalSummary:
        initiatives_total = (await session.execute(select(func.count(Initiative.id)))).scalar_one()
        votes_total = (await session.execute(select(func.count(Vote.id)))).scalar_one()
        classified = (
            await session.execute(select(func.count(func.distinct(InitiativeTopic.initiative_id))))
        ).scalar_one()
        return GlobalSummary(
            initiatives_total=initiatives_total,
            votes_total=votes_total,
            initiatives_classified=classified,
        )

    return await cached("stats:summary", _CACHE_TTL, factory)


@router.get("/initiatives/by-type", response_model=list[InitiativeTypeCount])
async def initiatives_by_type(
    session: AsyncSession = Depends(get_session),
) -> list[InitiativeTypeCount]:
    async def factory() -> list[InitiativeTypeCount]:
        rows = (
            await session.execute(
                select(Initiative.type, func.count(Initiative.id))
                .group_by(Initiative.type)
                .order_by(func.count(Initiative.id).desc())
            )
        ).all()
        return [InitiativeTypeCount(type=t, count=c) for t, c in rows]

    return await cached("stats:initiatives:by-type", _CACHE_TTL, factory)


@router.get("/initiatives/by-status", response_model=list[InitiativeStatusCount])
async def initiatives_by_status(
    session: AsyncSession = Depends(get_session),
) -> list[InitiativeStatusCount]:
    async def factory() -> list[InitiativeStatusCount]:
        rows = (
            await session.execute(
                select(Initiative.status, func.count(Initiative.id))
                .group_by(Initiative.status)
                .order_by(func.count(Initiative.id).desc())
            )
        ).all()
        return [InitiativeStatusCount(status=s, count=c) for s, c in rows]

    return await cached("stats:initiatives:by-status", _CACHE_TTL, factory)


@router.get("/votes/by-result", response_model=list[VoteResultCount])
async def votes_by_result(
    session: AsyncSession = Depends(get_session),
) -> list[VoteResultCount]:
    async def factory() -> list[VoteResultCount]:
        rows = (
            await session.execute(
                select(Vote.result, func.count(Vote.id))
                .group_by(Vote.result)
                .order_by(func.count(Vote.id).desc())
            )
        ).all()
        return [VoteResultCount(result=r, count=c) for r, c in rows]

    return await cached("stats:votes:by-result", _CACHE_TTL, factory)


async def _compute_legislature_stats(session: AsyncSession) -> list[LegislatureStat]:
    """Per-legislature comparative KPIs, most recent first.

    Symmetric by construction — every legislature's full aggregates, never a
    partisan slice (CLAUDE.md "regla de simetria")."""
    legs = (
        (await session.execute(select(Legislature).order_by(Legislature.start_date.desc())))
        .scalars()
        .all()
    )

    # Votes grouped by (legislature, result) + per-legislature assent tally,
    # in one pass over votes joined to their session.
    vote_rows = (
        await session.execute(
            select(
                SessionModel.legislature_id,
                Vote.result,
                func.count(Vote.id),
                func.sum(cast(Vote.approved_by_assent, Integer)),
            )
            .join(SessionModel, Vote.session_id == SessionModel.id)
            .group_by(SessionModel.legislature_id, Vote.result)
        )
    ).all()
    session_rows = (
        await session.execute(
            select(SessionModel.legislature_id, func.count(SessionModel.id)).group_by(
                SessionModel.legislature_id
            )
        )
    ).all()

    sessions_by_leg = {leg_id: n for leg_id, n in session_rows}
    # leg_id -> {"approved": n, "rejected": n, "tie": n, "assent": n}
    agg: dict[int, dict[str, int]] = {}
    for leg_id, result, count, assent in vote_rows:
        bucket = agg.setdefault(leg_id, {"approved": 0, "rejected": 0, "tie": 0, "assent": 0})
        # result comes back as the raw string ("approved") from the grouped
        # query, not the VoteResult enum.
        key = result.value if hasattr(result, "value") else str(result)
        bucket[key] = bucket.get(key, 0) + count
        bucket["assent"] += int(assent or 0)

    out: list[LegislatureStat] = []
    for leg in legs:
        b = agg.get(leg.id, {"approved": 0, "rejected": 0, "tie": 0, "assent": 0})
        votes_total = b["approved"] + b["rejected"] + b["tie"]
        out.append(
            LegislatureStat(
                number=leg.number,
                name_ca=leg.name_ca,
                name_es=leg.name_es,
                start_date=leg.start_date,
                end_date=leg.end_date,
                status=leg.status,
                sessions=sessions_by_leg.get(leg.id, 0),
                votes_total=votes_total,
                approved=b["approved"],
                rejected=b["rejected"],
                tie=b["tie"],
                assent=b["assent"],
                approval_rate=(b["approved"] / votes_total) if votes_total else 0.0,
            )
        )
    return out


@router.get("/legislatures", response_model=list[LegislatureStat])
async def stats_legislatures(
    session: AsyncSession = Depends(get_session),
) -> list[LegislatureStat]:
    """Comparative KPIs per legislature, most recent first.

    Powers the cross-legislature comparison view unlocked by the historical
    backfill (X-XV)."""

    async def factory() -> list[LegislatureStat]:
        return await _compute_legislature_stats(session)

    return await cached("stats:legislatures", _CACHE_TTL, factory)


@router.get("/votes/by-proposing-group", response_model=list[GroupProposalCount])
async def votes_by_proposing_group(
    session: AsyncSession = Depends(get_session),
) -> list[GroupProposalCount]:
    async def factory() -> list[GroupProposalCount]:
        rows = (
            await session.execute(
                select(
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                    func.count(Vote.id),
                )
                .join(Vote, Vote.proposing_group_id == ParliamentaryGroup.id)
                .group_by(
                    ParliamentaryGroup.id,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                )
                .order_by(func.count(Vote.id).desc())
            )
        ).all()
        return [
            GroupProposalCount(slug=s, name_short=ns, color_hex=c, count=n) for s, ns, c, n in rows
        ]

    return await cached("stats:votes:by-proposing-group", _CACHE_TTL, factory)


@router.get("/topics/global", response_model=list[TopicGlobalRow])
async def topics_global(
    session: AsyncSession = Depends(get_session),
) -> list[TopicGlobalRow]:
    """Per-topic counts of initiatives broken down by status."""

    async def factory() -> list[TopicGlobalRow]:
        return await compute_topic_global_stats(session)

    return await cached("stats:topics:global", _CACHE_TTL, factory)


# ---------------------------------------------------------------------------
# New endpoints — group activity + topic proposers
# ---------------------------------------------------------------------------


@router.get("/by-group/{slug}", response_model=GroupActivity)
async def stats_by_group(
    slug: str,
    legislature_id: int | None = Query(
        None, description="Restrict counts to a specific legislature"
    ),
    session: AsyncSession = Depends(get_session),
) -> GroupActivity:
    """Recent activity + topic mix for one parliamentary group.

    ``recent_initiatives`` is the 10 most recent initiatives whose
    ``submitted_by`` text mentions this group's long name. We use a
    substring match because the source field is free text that lists every
    co-signer — same heuristic as ``app.services.proposing_group``.

    ``topic_distribution`` aggregates classifier-assigned topics across
    those initiatives (across ALL the group's initiatives, not just the top
    10) so the user sees the group's thematic profile, not just what's
    fresh this week.
    """
    return await cached(
        f"stats:by-group:{slug}:{legislature_id or 'all'}",
        _CACHE_TTL,
        lambda: _compute_group_activity(session, slug, legislature_id),
    )


async def _compute_group_activity(
    session: AsyncSession, slug: str, legislature_id: int | None
) -> GroupActivity:
    """Resolve a group's recent initiatives + their topic mix.

    We resolve the group via ``ParliamentaryGroup.slug`` (most recent
    legislature if multiple). When no group exists we return empty lists
    rather than 404 — the /stats filter UI sends slugs straight from the
    URL and a typo shouldn't crash the page.
    """
    group_stmt = (
        select(ParliamentaryGroup)
        .where(ParliamentaryGroup.slug == slug)
        .order_by(ParliamentaryGroup.legislature_id.desc())
        .limit(1)
    )
    group = (await session.execute(group_stmt)).scalar_one_or_none()
    if group is None:
        return GroupActivity(recent_initiatives=[], topic_distribution=[])

    # Substring match on submitted_by — same heuristic the proposing_group
    # service uses on Vote.description. Free text, so we accept the
    # imperfection rather than introducing yet another denormalised column.
    proposer_like = f"%{group.name_long}%"
    base_stmt = select(Initiative).where(Initiative.submitted_by.ilike(proposer_like))
    if legislature_id is not None:
        base_stmt = base_stmt.where(Initiative.legislature_id == legislature_id)

    recent_rows = (
        (
            await session.execute(
                base_stmt.order_by(
                    desc(Initiative.submitted_at).nullslast(), desc(Initiative.id)
                ).limit(10)
            )
        )
        .scalars()
        .all()
    )
    recent = [_initiative_mini(i) for i in recent_rows]

    # Topic distribution: top 10 topics across all the group's initiatives.
    topic_stmt = (
        select(
            Topic.slug,
            Topic.name_ca,
            Topic.color_hex,
            func.count(func.distinct(Initiative.id)),
        )
        .select_from(Initiative)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(Initiative.submitted_by.ilike(proposer_like))
    )
    if legislature_id is not None:
        topic_stmt = topic_stmt.where(Initiative.legislature_id == legislature_id)
    topic_stmt = (
        topic_stmt.group_by(Topic.id, Topic.slug, Topic.name_ca, Topic.color_hex)
        .order_by(func.count(func.distinct(Initiative.id)).desc())
        .limit(10)
    )
    topic_rows = (await session.execute(topic_stmt)).all()
    topic_distribution = [
        TopicCount(
            topic_slug=ts,
            topic_name_ca=tn,
            topic_color_hex=tc,
            count=int(n),
        )
        for ts, tn, tc, n in topic_rows
    ]

    return GroupActivity(
        recent_initiatives=recent,
        topic_distribution=topic_distribution,
    )


@router.get("/by-topic/{slug}/proposers", response_model=TopicProposers)
async def stats_by_topic_proposers(
    slug: str,
    legislature_id: int | None = Query(
        None, description="Restrict counts to a specific legislature"
    ),
    session: AsyncSession = Depends(get_session),
) -> TopicProposers:
    """Top proposers + recent initiatives in one topic.

    Proposers are computed by intersecting each parliamentary group's
    ``name_long`` against ``Initiative.submitted_by``. We always return the
    top 5 with their counts. ``"government"`` appears as a synthetic row
    representing initiatives marked as government bills.

    A 404 is returned only when the topic slug itself doesn't exist.
    """
    return await cached(
        f"stats:by-topic:{slug}:proposers:{legislature_id or 'all'}",
        _CACHE_TTL,
        lambda: _compute_topic_proposers(session, slug, legislature_id),
    )


async def _compute_topic_proposers(
    session: AsyncSession, slug: str, legislature_id: int | None
) -> TopicProposers:
    topic_id = (
        await session.execute(select(Topic.id).where(Topic.slug == slug))
    ).scalar_one_or_none()
    if topic_id is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    base = (
        select(Initiative)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .where(InitiativeTopic.topic_id == topic_id)
    )
    if legislature_id is not None:
        base = base.where(Initiative.legislature_id == legislature_id)

    # Recent initiatives in this topic.
    recent_rows = (
        (
            await session.execute(
                base.order_by(desc(Initiative.submitted_at).nullslast(), desc(Initiative.id)).limit(
                    10
                )
            )
        )
        .scalars()
        .all()
    )
    recent = [_initiative_mini(i) for i in recent_rows]

    # Fetch ALL groups + initiatives in scope, then count in Python. Volumes
    # are small (~10 groups × hundreds of initiatives), so this is cheaper
    # than 10 separate substring counts.
    groups = (await session.execute(select(ParliamentaryGroup))).scalars().all()
    initiatives = (await session.execute(base)).scalars().unique().all()

    counts: dict[str, ProposerCount] = {}
    for ini in initiatives:
        # Government bills aggregate under a single synthetic slug. We
        # don't have a column for "proposed_by_government" on initiatives
        # the way we do on votes, so we infer from the type.
        if ini.type == InitiativeType.PROYECTO_LEY or ini.type == InitiativeType.REAL_DECRETO_LEY:
            slot = counts.setdefault(
                "government",
                ProposerCount(
                    slug="government",
                    name_short="Govern",
                    color_hex=None,
                    count=0,
                ),
            )
            slot.count += 1
            continue
        submitted = ini.submitted_by or ""
        if not submitted:
            continue
        # Pick the longest matching group name (most specific).
        match: ParliamentaryGroup | None = None
        for g in groups:
            if (
                g.name_long
                and g.name_long in submitted
                and (match is None or len(g.name_long) > len(match.name_long))
            ):
                match = g
        if match is None:
            continue
        slot = counts.setdefault(
            match.slug,
            ProposerCount(
                slug=match.slug,
                name_short=match.name_short,
                color_hex=match.color_hex,
                count=0,
            ),
        )
        slot.count += 1

    top = sorted(counts.values(), key=lambda r: -r.count)[:5]
    return TopicProposers(top_proposers=top, recent_initiatives=recent)


def _initiative_mini(i: Initiative) -> InitiativeMini:
    """Cast an ORM row into the API mini representation."""
    return InitiativeMini(
        id=i.id,
        type=i.type,
        official_id=i.official_id,
        title_original=i.title_original,
        title_ca=i.title_ca,
        status=i.status,
        submitted_at=i.submitted_at.isoformat() if i.submitted_at else None,
        plain_summary_ca=i.plain_summary_ca,
        plain_summary_es=i.plain_summary_es,
        plain_summary_provider=i.plain_summary_provider,
    )


# ---------------------------------------------------------------------------
# Combined topic × group cross endpoint
# ---------------------------------------------------------------------------


@router.get(
    "/cross/topic/{topic_slug}/group/{group_slug}",
    response_model=CrossTopicGroup,
)
async def stats_cross_topic_group(
    topic_slug: str,
    group_slug: str,
    legislature_id: int | None = Query(
        None, description="Restrict counts to a specific legislature"
    ),
    session: AsyncSession = Depends(get_session),
) -> CrossTopicGroup:
    """Power the /stats page when BOTH topic and group filters are active.

    Returns enough data to render three panels in one round trip:

    1. ``initiatives_on_topic_by_group`` — initiatives classified under
       ``topic_slug`` grouped by their proposing group. ALL groups appear
       (with zero counts when applicable) so the frontend can keep the
       symmetry rule and show a full bar chart with one bar highlighted.
    2. ``topic_distribution_for_group`` — initiatives proposed by
       ``group_slug``, grouped by topic. Top 8 by count, plus the focal
       topic if it falls outside the top 8 (so it can always be
       highlighted in the chart).
    3. ``joint_initiatives`` — every initiative that is BOTH classified
       under ``topic_slug`` AND has ``submitted_by`` matching the group's
       long name, sorted by submitted_at desc. Capped at 50 rows.

    404 is raised only when ``topic_slug`` doesn't exist; an unknown
    ``group_slug`` returns empty lists rather than failing the page.
    """
    return await cached(
        f"stats:cross:{topic_slug}:{group_slug}:{legislature_id or 'all'}",
        _CACHE_TTL,
        lambda: _compute_cross_topic_group(session, topic_slug, group_slug, legislature_id),
    )


# Top-N for the topic distribution chart, plus the focal topic when it
# falls outside the top-N. Keeps the chart readable while always letting
# the highlighted bar appear.
_CROSS_TOPIC_TOP_N = 8
_CROSS_JOINT_LIMIT = 50


async def _compute_cross_topic_group(
    session: AsyncSession,
    topic_slug: str,
    group_slug: str,
    legislature_id: int | None,
) -> CrossTopicGroup:
    """Resolve the cross-filter snapshot. See endpoint docstring for shape."""
    topic_row = (
        await session.execute(
            select(Topic.id, Topic.slug, Topic.name_ca, Topic.color_hex).where(
                Topic.slug == topic_slug
            )
        )
    ).first()
    if topic_row is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    topic_id, topic_slug_db, topic_name_ca, topic_color_hex = topic_row
    topic_summary = CrossTopicGroupSummary(
        slug=topic_slug_db, name_ca=topic_name_ca, color_hex=topic_color_hex
    )

    # Resolve the focal group. Pick the most recent legislature row when
    # multiple exist for the same slug (matches `_compute_group_activity`).
    focal_group = (
        await session.execute(
            select(ParliamentaryGroup)
            .where(ParliamentaryGroup.slug == group_slug)
            .order_by(ParliamentaryGroup.legislature_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    # ALL groups for the symmetry-rule bar chart. We always emit a row per
    # group (zero count if they haven't proposed anything on this topic).
    all_groups = (await session.execute(select(ParliamentaryGroup))).scalars().all()

    # Initiatives on this topic, scoped by legislature when requested.
    initiatives_on_topic_stmt = (
        select(Initiative)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .where(InitiativeTopic.topic_id == topic_id)
    )
    if legislature_id is not None:
        initiatives_on_topic_stmt = initiatives_on_topic_stmt.where(
            Initiative.legislature_id == legislature_id
        )
    initiatives_on_topic = (
        (await session.execute(initiatives_on_topic_stmt)).scalars().unique().all()
    )

    # Per-group counts on this topic. Pick the longest matching group name
    # (most specific) as in ``_compute_topic_proposers``.
    counts_by_slug: dict[str, int] = {g.slug: 0 for g in all_groups}
    for ini in initiatives_on_topic:
        submitted = ini.submitted_by or ""
        if not submitted:
            continue
        match: ParliamentaryGroup | None = None
        for g in all_groups:
            if (
                g.name_long
                and g.name_long in submitted
                and (match is None or len(g.name_long) > len(match.name_long))
            ):
                match = g
        if match is not None:
            counts_by_slug[match.slug] += 1

    initiatives_on_topic_by_group = [
        ProposerCount(
            slug=g.slug,
            name_short=g.name_short,
            color_hex=g.color_hex,
            count=counts_by_slug.get(g.slug, 0),
        )
        for g in all_groups
    ]
    # Order desc but keep every row — never hide a group (symmetry rule).
    initiatives_on_topic_by_group.sort(key=lambda r: (-r.count, r.slug))

    # Topic distribution for the focal group + joint list.
    topic_distribution_for_group: list[TopicCount] = []
    joint_initiatives: list[InitiativeMini] = []
    joint_initiatives_total = 0

    if focal_group is not None:
        proposer_like = f"%{focal_group.name_long}%"

        # Top topics across the group's initiatives (top N + focal topic).
        topic_dist_stmt = (
            select(
                Topic.slug,
                Topic.name_ca,
                Topic.color_hex,
                func.count(func.distinct(Initiative.id)),
            )
            .select_from(Initiative)
            .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
            .join(Topic, Topic.id == InitiativeTopic.topic_id)
            .where(Initiative.submitted_by.ilike(proposer_like))
        )
        if legislature_id is not None:
            topic_dist_stmt = topic_dist_stmt.where(Initiative.legislature_id == legislature_id)
        topic_dist_stmt = topic_dist_stmt.group_by(
            Topic.id, Topic.slug, Topic.name_ca, Topic.color_hex
        ).order_by(func.count(func.distinct(Initiative.id)).desc())

        topic_dist_rows = (await session.execute(topic_dist_stmt)).all()
        all_topic_counts = [
            TopicCount(
                topic_slug=ts,
                topic_name_ca=tn,
                topic_color_hex=tc,
                count=int(n),
            )
            for ts, tn, tc, n in topic_dist_rows
        ]
        top_n = all_topic_counts[:_CROSS_TOPIC_TOP_N]
        # If the focal topic fell outside the top-N, append it so the chart
        # can render the highlighted bar with the real count (even when 0).
        if not any(r.topic_slug == topic_slug for r in top_n):
            focal_row = next(
                (r for r in all_topic_counts if r.topic_slug == topic_slug),
                TopicCount(
                    topic_slug=topic_slug_db,
                    topic_name_ca=topic_name_ca,
                    topic_color_hex=topic_color_hex,
                    count=0,
                ),
            )
            top_n.append(focal_row)
        topic_distribution_for_group = top_n

        # Joint initiatives: (topic ∩ group's submitted_by).
        joint_stmt = (
            select(Initiative)
            .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
            .where(InitiativeTopic.topic_id == topic_id)
            .where(Initiative.submitted_by.ilike(proposer_like))
        )
        if legislature_id is not None:
            joint_stmt = joint_stmt.where(Initiative.legislature_id == legislature_id)
        joint_stmt_ordered = joint_stmt.order_by(
            desc(Initiative.submitted_at).nullslast(), desc(Initiative.id)
        ).limit(_CROSS_JOINT_LIMIT)

        joint_rows = (await session.execute(joint_stmt_ordered)).scalars().unique().all()
        joint_initiatives = [_initiative_mini(i) for i in joint_rows]

        # Exact count of distinct initiatives matching BOTH filters. We
        # rebuild the predicate from scratch over Initiative because
        # wrapping ``joint_stmt`` as a subquery loses the FROM-clause join
        # context and the COUNT becomes meaningless (cartesian-ish).
        joint_count_stmt = (
            select(func.count(func.distinct(Initiative.id)))
            .select_from(Initiative)
            .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
            .where(InitiativeTopic.topic_id == topic_id)
            .where(Initiative.submitted_by.ilike(proposer_like))
        )
        if legislature_id is not None:
            joint_count_stmt = joint_count_stmt.where(Initiative.legislature_id == legislature_id)
        joint_initiatives_total = int((await session.execute(joint_count_stmt)).scalar_one())

    group_summary = CrossGroupSummary(
        slug=focal_group.slug if focal_group is not None else group_slug,
        name_short=focal_group.name_short if focal_group is not None else group_slug,
        name_long=focal_group.name_long if focal_group is not None else group_slug,
        color_hex=focal_group.color_hex if focal_group is not None else None,
    )

    return CrossTopicGroup(
        topic=topic_summary,
        group=group_summary,
        initiatives_on_topic_by_group=initiatives_on_topic_by_group,
        topic_distribution_for_group=topic_distribution_for_group,
        joint_initiatives=joint_initiatives,
        joint_initiatives_total=joint_initiatives_total,
    )
