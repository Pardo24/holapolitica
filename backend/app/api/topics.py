"""API endpoints for topics."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.initiatives import _load_latest_vote, _load_topics_by_initiative
from app.db import get_session
from app.metrics import GroupVoteStatRow, compute_group_stats_for_topic
from app.models import Initiative, InitiativeTopic, Legislature, ManifestoPoint, Topic
from app.schemas import InitiativeRead, InitiativeTopicSlug, TopicNewsRead, TopicRead
from app.services.cache import cached
from app.services.game_pool import LAW_TYPES
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


@router.get("/{slug}/group-stats", response_model=list[GroupVoteStatRow])
async def get_topic_group_stats(
    slug: str, session: AsyncSession = Depends(get_session)
) -> list[GroupVoteStatRow]:
    """Per-group Sí/No/Abst breakdown of every vote cast on this topic.

    The inverse of /groups/{slug}/topic-stats: feeds the "who votes in
    favour and who votes against on this topic" widget. The full per-group
    list is returned, ordered by total participation desc; the frontend
    sorts by ayes / noes for display (symmetry rule — the API never ranks
    one group against another).

    Scoped to the CURRENT legislature: the widget asks "who's for and who's
    against today", and a party's share averaged across legislatures (where
    it has been both in government and in opposition) would misrepresent its
    present stance and list groups that no longer sit.
    """
    topic = (await session.execute(select(Topic).where(Topic.slug == slug))).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    legislature_id = (
        await session.execute(
            select(Legislature.id).order_by(Legislature.start_date.desc()).limit(1)
        )
    ).scalar_one_or_none()

    topic_id = topic.id
    return await cached(
        f"stats:topic:{slug}:group-stats:leg:{legislature_id}",
        3600,
        lambda: compute_group_stats_for_topic(
            session, topic_id=topic_id, legislature_id=legislature_id
        ),
    )


class KeyLawGroup(BaseModel):
    slug: str
    name_short: str | None
    color_hex: str | None
    logo_url: str | None
    choice: str


class KeyLawRow(BaseModel):
    initiative_id: int
    type: str
    title_ca: str | None
    title_es: str | None
    stage: str
    verdict: str | None
    vote_id: int
    voted_at: str | None
    groups: list[KeyLawGroup]


@router.get("/{slug}/key-laws", response_model=list[KeyLawRow])
async def get_topic_key_laws(
    slug: str,
    n: int = Query(8, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
) -> list[KeyLawRow]:
    """The latest laws on this topic the plenary voted, and how each group voted.

    "Compare the parties" in the vote guide: one law at a time says more
    than a share of yeses averaged over every vote of a subject, amendments
    included, where every group comes out near half and half.

    Neutral selection: the ``n`` most recent, nothing picked by hand. Bills,
    group bills and decree-laws only, scoped to the current legislature so
    every row lists the groups that sit today. ``stage`` says what was voted
    (whether to start a bill, a decree's validation, the final text).
    """
    topic_id = (
        await session.execute(select(Topic.id).where(Topic.slug == slug))
    ).scalar_one_or_none()
    if topic_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    started = (
        await session.execute(
            select(Legislature.start_date).order_by(Legislature.start_date.desc()).limit(1)
        )
    ).scalar_one_or_none()

    async def _compute() -> list[dict[str, object]]:
        items = list(
            (
                await session.execute(
                    select(Initiative)
                    .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
                    .where(InitiativeTopic.topic_id == topic_id)
                    .where(Initiative.type.in_(LAW_TYPES))
                )
            )
            .scalars()
            .all()
        )
        latest = await _load_latest_vote(session, [i.id for i in items])
        floor = started.isoformat() if started else ""
        rows: list[KeyLawRow] = []
        for i in items:
            vote = latest.get(i.id)
            if not vote or not vote["groups"] or (vote["voted_at"] or "") < floor:
                continue
            rows.append(
                KeyLawRow(
                    initiative_id=i.id,
                    type=str(i.type),
                    title_ca=i.plain_title_ca or i.title_ca,
                    title_es=i.plain_title_es or i.title_es,
                    stage=str(vote["stage"]),
                    verdict=vote["verdict"],
                    vote_id=int(vote["vote_id"]),
                    voted_at=vote["voted_at"],
                    groups=[KeyLawGroup.model_validate(g) for g in vote["groups"]],
                )
            )
        rows.sort(key=lambda r: (r.voted_at or "", r.vote_id), reverse=True)
        return [r.model_dump(mode="json") for r in rows[:n]]

    data = await cached(f"topics:{slug}:key-laws:{started}:{n}:v1", 3600, _compute)
    return [KeyLawRow.model_validate(r) for r in data]


class TopicManifestoPoint(BaseModel):
    party: str
    quote: str
    page: int | None
    source_url: str | None


class TopicManifesto(BaseModel):
    # How many quotes each party's manifesto has in all, so a page can tell
    # "says nothing on this subject" from "not read yet".
    counts: dict[str, int]
    points: list[TopicManifestoPoint]


@router.get("/{slug}/manifesto", response_model=TopicManifesto)
async def get_topic_manifesto(
    slug: str,
    election: str = Query("2026-11", pattern=r"^\d{4}-\d{2}$"),
    session: AsyncSession = Depends(get_session),
) -> TopicManifesto:
    """Every party's manifesto commitments on one topic, side by side.

    Literal, page-referenced quotes (``app/ingest/manifestos.py``, the same
    extraction for every party). For the 2026 election ``party`` is the
    election party slug (frontend/lib/electionParties.ts), not a group's:
    parties stand that hold no group, and groups split into lists.
    """

    async def _compute() -> dict[str, object]:
        counts = dict(
            (
                await session.execute(
                    select(ManifestoPoint.group_slug, func.count())
                    .where(ManifestoPoint.election == election)
                    .group_by(ManifestoPoint.group_slug)
                )
            )
            .tuples()
            .all()
        )
        points = (
            (
                await session.execute(
                    select(ManifestoPoint)
                    .where(ManifestoPoint.election == election)
                    .where(ManifestoPoint.topic_slug == slug)
                    .order_by(ManifestoPoint.group_slug, ManifestoPoint.page, ManifestoPoint.id)
                )
            )
            .scalars()
            .all()
        )
        return TopicManifesto(
            counts=counts,
            points=[
                TopicManifestoPoint(
                    party=p.group_slug, quote=p.quote, page=p.page, source_url=p.source_url
                )
                for p in points
            ],
        ).model_dump(mode="json")

    data = await cached(f"topics:{slug}:manifesto:{election}:v1", 3600, _compute)
    return TopicManifesto.model_validate(data)


@router.get("/{slug}/initiatives", response_model=list[dict[str, object]])
async def list_topic_initiatives(
    slug: str,
    legislature_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, object]]:
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
    items = list((await session.execute(stmt)).scalars().all())

    # Same shape as the laws list, so the topic hub can render the same card
    # instead of its own compact row: each initiative carries its decisive
    # vote (tally + how each group voted) and its topics.
    item_ids = [i.id for i in items]
    latest_vote_by_initiative = await _load_latest_vote(session, item_ids)
    topics_by_initiative = await _load_topics_by_initiative(session, item_ids)
    return [
        {
            **InitiativeRead.model_validate(i).model_dump(mode="json"),
            "latest_vote_result": (latest_vote_by_initiative.get(i.id) or {}).get("verdict"),
            "latest_vote": latest_vote_by_initiative.get(i.id),
            "topics": [
                InitiativeTopicSlug.model_validate(tp).model_dump(mode="json")
                for tp in topics_by_initiative.get(i.id, [])
            ],
        }
        for i in items
    ]


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
    topic = (await session.execute(select(Topic).where(Topic.slug == slug))).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    # Pick the locale-appropriate display name as the search term so the
    # feed matches the language the visitor is reading the hub in.
    name = {
        "ca": topic.name_ca,
        "es": topic.name_es,
        "en": topic.name_en,
    }[locale]
    # Done with the database: give the connection back before waiting on
    # Google News (seconds, or the timeout), or a few slow feeds hold the
    # pool and the rest of the API queues behind them.
    await session.close()

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
                "published_at": (it.published_at.isoformat() if it.published_at else None),
            }
            for it in items
        ]

    return await cached(f"topics:{slug}:news:{locale}:v1", 3600, _factory)
