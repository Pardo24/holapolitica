"""'Com et representen?' — vote-alignment questionnaire.

Serves a set of real past votes for the citizen to answer (Sí / No /
Abstenció), each annotated with how every parliamentary group actually voted.
The frontend hides the group positions until the user has answered, then
computes — *client-side, on the device* — which groups the user coincided
with most. The backend has no opinion and stores nothing: it only mirrors the
real record back against the user's own stances.

Neutrality ("mirall, no megàfon"): every group that had a clear majority on a
vote is returned for that vote — never a partisan subset. The question text is
the vote's own title / plain-language summary, with no editorial framing.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import NamedTuple

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import (
    Initiative,
    InitiativeTopic,
    Legislature,
    LegislatureStatus,
    ParliamentaryGroup,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
)
from app.models import (
    Session as SessionRow,
)
from app.services.cache import cached

router = APIRouter(prefix="/align", tags=["align"])

# The three stances a citizen can take — and the only group positions we
# compare against. ABSENT / NO_VOTE_RECORDED are not opinions, so they can't
# be a majority "position" for alignment purposes.
_STANCES = (VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION)

_CACHE_TTL = 86400  # 24h; invalidated by the ingest workers alongside stats:


class _Chosen(NamedTuple):
    vote_id: int
    initiative_id: int | None
    title: str
    plain_summary_ca: str | None
    plain_summary_es: str | None


class AlignTopic(BaseModel):
    slug: str
    name_ca: str
    color_hex: str | None = None


class AlignGroupPosition(BaseModel):
    slug: str
    name_short: str
    color_hex: str | None = None
    choice: str  # "aye" | "no" | "abstention"


class AlignQuestion(BaseModel):
    vote_id: int
    title: str
    plain_summary_ca: str | None = None
    plain_summary_es: str | None = None
    topics: list[AlignTopic] = []
    group_positions: list[AlignGroupPosition] = []


@router.get("/questions", response_model=list[AlignQuestion])
async def align_questions(
    n: int = Query(8, ge=3, le=20, description="How many votes to return."),
    legislature_id: int | None = Query(
        None, description="Legislature to draw from; defaults to the current one."
    ),
    session: AsyncSession = Depends(get_session),
) -> list[AlignQuestion]:
    """Return ``n`` recent, contextful votes with each group's majority stance.

    Eligibility: counted votes (not approval-by-assent) that carry a
    plain-language summary — on the vote itself or its linked initiative — so
    the citizen has something to react to. Deduplicated by initiative so a bill
    voted in parts doesn't dominate."""

    async def factory() -> list[AlignQuestion]:
        leg_id = legislature_id
        if leg_id is None:
            leg_id = (
                await session.execute(
                    select(Legislature.id)
                    .where(Legislature.status == LegislatureStatus.ACTIVE)
                    .order_by(Legislature.start_date.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        if leg_id is None:
            return []

        # Eligible votes, most recent first, with a summary somewhere. Pull a
        # pool larger than n so we can dedupe by initiative and still fill n.
        pool_rows = (
            await session.execute(
                select(
                    Vote.id,
                    Vote.initiative_id,
                    Vote.title,
                    Vote.description,
                    Vote.plain_summary_ca,
                    Vote.plain_summary_es,
                    Initiative.plain_summary_ca,
                    Initiative.plain_summary_es,
                )
                .join(SessionRow, SessionRow.id == Vote.session_id)
                .outerjoin(Initiative, Initiative.id == Vote.initiative_id)
                .where(SessionRow.legislature_id == leg_id)
                .where(Vote.approved_by_assent.is_(False))
                .where(
                    or_(
                        Vote.plain_summary_ca.is_not(None),
                        Vote.plain_summary_es.is_not(None),
                        Initiative.plain_summary_ca.is_not(None),
                        Initiative.plain_summary_es.is_not(None),
                    )
                )
                .order_by(Vote.voted_at.desc(), Vote.id.desc())
                .limit(n * 6)
            )
        ).all()

        chosen: list[_Chosen] = []
        seen_initiatives: set[int] = set()
        for vid, init_id, title, desc, vca, ves, ica, ies in pool_rows:
            if init_id is not None:
                if init_id in seen_initiatives:
                    continue
                seen_initiatives.add(init_id)
            chosen.append(
                _Chosen(
                    vote_id=vid,
                    initiative_id=init_id,
                    title=(desc or title or "").strip(),
                    plain_summary_ca=vca or ica,
                    plain_summary_es=ves or ies,
                )
            )
            # Take the whole deduped pool; the final assembly applies the
            # quality filter (drop unanimous / position-less votes) and caps
            # at n, so we can't fall short because early votes were unanimous.

        vote_ids = [c.vote_id for c in chosen]
        if not vote_ids:
            return []

        # Per-(vote, group) majority stance — same aggregation as the
        # coincidence matrix, restricted to the chosen votes.
        rec_rows = (
            await session.execute(
                select(
                    VoteRecord.vote_id,
                    ParliamentaryGroup.slug,
                    ParliamentaryGroup.name_short,
                    ParliamentaryGroup.color_hex,
                    VoteRecord.choice,
                )
                .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
                .where(VoteRecord.vote_id.in_(vote_ids))
            )
        ).all()

        counters: dict[tuple[int, str], Counter[VoteChoice]] = defaultdict(Counter)
        group_meta: dict[str, tuple[str, str | None]] = {}
        for vote_id, slug, name_short, color_hex, choice in rec_rows:
            counters[(vote_id, slug)][choice] += 1
            group_meta[slug] = (name_short, color_hex)

        positions_by_vote: dict[int, list[AlignGroupPosition]] = defaultdict(list)
        for (vote_id, slug), counts in counters.items():
            stance, count = max(((c, counts[c]) for c in _STANCES), key=lambda kv: kv[1])
            if count == 0:
                continue  # group only abstained from voting / was absent
            name_short, color_hex = group_meta[slug]
            positions_by_vote[vote_id].append(
                AlignGroupPosition(
                    slug=slug,
                    name_short=name_short,
                    color_hex=color_hex,
                    choice=stance.value,
                )
            )
        for positions in positions_by_vote.values():
            positions.sort(key=lambda p: p.slug)

        # Topics per linked initiative, for light thematic context on each card.
        init_ids = [c.initiative_id for c in chosen if c.initiative_id is not None]
        topics_by_initiative: dict[int, list[AlignTopic]] = defaultdict(list)
        if init_ids:
            topic_rows = (
                await session.execute(
                    select(InitiativeTopic.initiative_id, Topic)
                    .join(Topic, Topic.id == InitiativeTopic.topic_id)
                    .where(InitiativeTopic.initiative_id.in_(init_ids))
                )
            ).all()
            for initiative_id, topic in topic_rows:
                topics_by_initiative[initiative_id].append(
                    AlignTopic(slug=topic.slug, name_ca=topic.name_ca, color_hex=topic.color_hex)
                )

        out: list[AlignQuestion] = []
        for c in chosen:
            if len(out) >= n:
                break
            positions = positions_by_vote.get(c.vote_id, [])
            # Need comparable positions, AND at least two distinct stances —
            # a unanimous vote carries no alignment signal, so it makes a
            # useless question. Skip both cases.
            if len(positions) < 2 or len({p.choice for p in positions}) < 2:
                continue
            out.append(
                AlignQuestion(
                    vote_id=c.vote_id,
                    title=c.title,
                    plain_summary_ca=c.plain_summary_ca,
                    plain_summary_es=c.plain_summary_es,
                    topics=(
                        topics_by_initiative.get(c.initiative_id, [])
                        if c.initiative_id is not None
                        else []
                    ),
                    group_positions=positions,
                )
            )
        return out

    return await cached(f"align:questions:{legislature_id}:{n}", _CACHE_TTL, factory)
