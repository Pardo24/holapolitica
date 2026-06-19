"""Trivia game — multiple-choice questions generated from real vote data.

Powers the "Hola Política, el joc" surface. Every question is factual recall
(who proposed / how a group voted / what was decided / which topic), built from
the database, with the law's plain-language summary as the explanation shown
after answering. No editorial framing: the game tests knowledge of the public
record, it doesn't push opinions ("mirall, no megàfon").

Questions are only drawn from items that carry a plain-language summary, so the
player always gets a readable explanation of the law behind the question.
"""

from __future__ import annotations

import random
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

router = APIRouter(prefix="/game", tags=["game"])

_STANCES = (VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION)
_STANCE_LABEL_CA = {VoteChoice.AYE: "Sí", VoteChoice.NO: "No", VoteChoice.ABSTENTION: "Abstenció"}


class GameOption(BaseModel):
    text: str
    correct: bool


class GameQuestion(BaseModel):
    id: str
    category: str  # "partits" | "lleis" | "temes"
    kind: str  # generator name, for the client to vary copy if it wants
    prompt: str
    # Short, neutral context shown above the options (e.g. the law title).
    subject: str | None = None
    options: list[GameOption]
    # Plain-language explanation revealed after answering. Prioritised over the
    # original legal text per the product brief.
    explanation: str | None = None
    source_kind: str  # "vote"
    source_id: int  # deep-link target (the vote)


class _RichVote(NamedTuple):
    vote_id: int
    title: str
    result: str
    summary_ca: str | None
    summary_es: str | None
    group_id: int | None  # proposing group
    group_short: str | None
    topic_slug: str | None
    topic_name: str | None


def _pick_summary(v: _RichVote) -> str | None:
    return v.summary_ca or v.summary_es


def _display_group(name_short: str) -> str:
    """Drop the procedural 'GP ' prefix for display, mirroring the frontend's
    displayGroupShort — except 'GP Mixto', where the prefix carries meaning."""
    if name_short == "GP Mixto":
        return name_short
    return name_short[3:] if name_short.startswith("GP ") else name_short


@router.get("/questions", response_model=list[GameQuestion])
async def game_questions(
    n: int = Query(7, ge=3, le=20),
    legislature_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[GameQuestion]:
    """Return ``n`` shuffled trivia questions built from real votes.

    All questions reference a vote whose linked initiative carries a plain
    summary, so the explanation is always readable. A mix of generators
    (proposer / result / how-a-group-voted / topic) keeps a round varied."""
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

    # Pool of "rich" votes: counted, with a proposing group, and a linked
    # initiative that has a plain summary + (optionally) a topic.
    topic_sq = (
        select(InitiativeTopic.initiative_id, Topic.slug, Topic.name_ca)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .subquery()
    )
    pool_rows = (
        await session.execute(
            select(
                Vote.id,
                Vote.title,
                Vote.description,
                Vote.result,
                Initiative.plain_summary_ca,
                Initiative.plain_summary_es,
                Vote.proposing_group_id,
                ParliamentaryGroup.name_short,
                topic_sq.c.slug,
                topic_sq.c.name_ca,
            )
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .join(Initiative, Initiative.id == Vote.initiative_id)
            .outerjoin(ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id)
            .outerjoin(topic_sq, topic_sq.c.initiative_id == Initiative.id)
            .where(SessionRow.legislature_id == leg_id)
            .where(Vote.approved_by_assent.is_(False))
            .where(
                or_(
                    Initiative.plain_summary_ca.is_not(None),
                    Initiative.plain_summary_es.is_not(None),
                )
            )
            .order_by(Vote.voted_at.desc())
            .limit(300)
        )
    ).all()

    # Dedupe by vote id (the topic join can repeat a vote across topics; keep
    # the first topic seen).
    by_vote: dict[int, _RichVote] = {}
    for vid, title, desc, result, sca, ses, gid, gshort, tslug, tname in pool_rows:
        if vid in by_vote:
            continue
        by_vote[vid] = _RichVote(
            vote_id=vid,
            title=(desc or title or "").strip(),
            result=result.value if hasattr(result, "value") else str(result),
            summary_ca=sca,
            summary_es=ses,
            group_id=gid,
            group_short=gshort,
            topic_slug=tslug,
            topic_name=tname,
        )
    pool = list(by_vote.values())
    if not pool:
        return []

    # Group + topic catalogues for plausible distractors.
    group_rows = (
        await session.execute(
            select(ParliamentaryGroup.name_short).where(ParliamentaryGroup.legislature_id == leg_id)
        )
    ).all()
    all_groups = [_display_group(g) for (g,) in group_rows]
    topic_rows = (await session.execute(select(Topic.name_ca))).all()
    all_topics = [t for (t,) in topic_rows]

    # Per-(vote, group) majority stance for the "how did X vote" generator.
    majority_by_vote: dict[int, dict[str, VoteChoice]] = defaultdict(dict)
    rec_rows = (
        await session.execute(
            select(VoteRecord.vote_id, ParliamentaryGroup.name_short, VoteRecord.choice)
            .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
            .where(VoteRecord.vote_id.in_(list(by_vote.keys())))
        )
    ).all()
    counters: dict[tuple[int, str], Counter[VoteChoice]] = defaultdict(Counter)
    for vote_id, gshort, choice in rec_rows:
        counters[(vote_id, gshort)][choice] += 1
    for (vote_id, gshort), counts in counters.items():
        stance, count = max(((c, counts[c]) for c in _STANCES), key=lambda kv: kv[1])
        if count > 0:
            majority_by_vote[vote_id][gshort] = stance

    rng = random.Random()
    questions: list[GameQuestion] = []
    rng.shuffle(pool)

    def _distractor_options(correct: str, universe: list[str], k: int = 3) -> list[GameOption]:
        others = [x for x in universe if x and x != correct]
        rng.shuffle(others)
        opts = [GameOption(text=correct, correct=True)] + [
            GameOption(text=o, correct=False) for o in others[:k]
        ]
        rng.shuffle(opts)
        return opts

    for v in pool:
        if len(questions) >= n:
            break
        summary = _pick_summary(v)
        # Rotate generators by what this vote supports, picking one at random
        # among the eligible kinds so a round stays varied.
        eligible: list[str] = ["result"]
        if v.group_short:
            eligible.append("proposer")
        if v.topic_name and len(all_topics) >= 4:
            eligible.append("topic")
        majorities = majority_by_vote.get(v.vote_id, {})
        votable_groups = [g for g, _ in majorities.items()]
        if votable_groups:
            eligible.append("group_vote")

        kind = rng.choice(eligible)

        if kind == "result":
            opts = [
                GameOption(text="Aprovada", correct=v.result == "approved"),
                GameOption(text="Rebutjada", correct=v.result == "rejected"),
            ]
            rng.shuffle(opts)
            prompt = "Què es va decidir en aquesta votació?"
        elif kind == "proposer" and v.group_short:
            opts = _distractor_options(_display_group(v.group_short), all_groups)
            prompt = "Quin grup va proposar aquesta votació?"
        elif kind == "topic" and v.topic_name:
            opts = _distractor_options(v.topic_name, all_topics)
            prompt = "Sobre quin tema tracta principalment?"
        elif kind == "group_vote" and votable_groups:
            g = rng.choice(votable_groups)
            stance = majorities[g]
            correct_label = _STANCE_LABEL_CA[stance]
            opts = [
                GameOption(text=lbl, correct=lbl == correct_label)
                for lbl in ("Sí", "No", "Abstenció")
            ]
            prompt = f"Com va votar majoritàriament {_display_group(g)} en aquesta votació?"
        else:
            continue

        questions.append(
            GameQuestion(
                id=f"{kind}:{v.vote_id}",
                category={
                    "result": "lleis",
                    "proposer": "partits",
                    "topic": "temes",
                    "group_vote": "partits",
                }[kind],
                kind=kind,
                prompt=prompt,
                subject=v.title[:160] if v.title else None,
                options=opts,
                explanation=summary,
                source_kind="vote",
                source_id=v.vote_id,
            )
        )

    return questions
