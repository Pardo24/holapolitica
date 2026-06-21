"""Trivia game — fun, learnable questions generated from real vote data.

Powers "Hola Política, el joc". Each question LEADS with the law explained in
plain language (the star of the card); the question is then something the
player can reason about and learn from — was it approved? did a party back it?
who proposed it? — not obscure recall of a bureaucratic title.

Only substantive, well-summarised, topic-classified laws are used, so every
card is recognisable and readable. Neutral by construction: factual recall of
the public record, no framing ("mirall, no megàfon").
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
_STANCE_LABEL_CA = {
    VoteChoice.AYE: "a favor",
    VoteChoice.NO: "en contra",
    VoteChoice.ABSTENTION: "es va abstenir",
}


class GameOption(BaseModel):
    text: str
    correct: bool


class GameQuestion(BaseModel):
    id: str
    category: str  # "partits" | "lleis" | "temes"
    kind: str
    # The law in plain language — shown FIRST, as the context to reason about.
    law_summary: str
    # Short theme tag (e.g. "Habitatge") for a touch of colour. Optional.
    topic: str | None = None
    prompt: str
    options: list[GameOption]
    # One extra fact revealed after answering, to teach (e.g. the tally).
    reveal: str | None = None
    source_kind: str = "vote"
    source_id: int


class _RichVote(NamedTuple):
    vote_id: int
    summary: str
    result: str
    ayes: int
    noes: int
    group_short: str | None
    topic_name: str | None


def _display_group(name_short: str) -> str:
    if name_short == "GP Mixto":
        return name_short
    return name_short[3:] if name_short.startswith("GP ") else name_short


@router.get("/questions", response_model=list[GameQuestion])
async def game_questions(
    n: int = Query(7, ge=3, le=20),
    legislature_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[GameQuestion]:
    """Return ``n`` shuffled, explanation-led trivia questions."""
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

    # Pool of substantive, recognisable laws: counted votes, linked to an
    # initiative with a plain summary AND a classified topic. We read the
    # summary as the card's lead text, so a procedural orphan vote (no summary)
    # never shows up.
    topic_sq = (
        select(InitiativeTopic.initiative_id, Topic.name_ca.label("tname"))
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .subquery()
    )
    pool_rows = (
        await session.execute(
            select(
                Vote.id,
                Initiative.plain_summary_ca,
                Initiative.plain_summary_es,
                Vote.result,
                Vote.ayes,
                Vote.noes,
                ParliamentaryGroup.name_short,
                topic_sq.c.tname,
            )
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .join(Initiative, Initiative.id == Vote.initiative_id)
            .outerjoin(ParliamentaryGroup, ParliamentaryGroup.id == Vote.proposing_group_id)
            .join(topic_sq, topic_sq.c.initiative_id == Initiative.id)
            .where(SessionRow.legislature_id == leg_id)
            .where(Vote.approved_by_assent.is_(False))
            .where(Vote.result.in_(["approved", "rejected"]))
            .where(
                or_(
                    Initiative.plain_summary_ca.is_not(None),
                    Initiative.plain_summary_es.is_not(None),
                )
            )
            .order_by(Vote.voted_at.desc())
            .limit(400)
        )
    ).all()

    by_vote: dict[int, _RichVote] = {}
    for vid, sca, ses, result, ayes, noes, gshort, tname in pool_rows:
        if vid in by_vote:
            continue
        summary = (sca or ses or "").strip()
        if len(summary) < 30:  # too short to be a good card
            continue
        by_vote[vid] = _RichVote(
            vote_id=vid,
            summary=summary,
            result=result.value if hasattr(result, "value") else str(result),
            ayes=ayes or 0,
            noes=noes or 0,
            group_short=gshort,
            topic_name=tname,
        )
    pool = list(by_vote.values())
    if not pool:
        return []

    all_groups = [
        _display_group(g)
        for (g,) in (
            await session.execute(
                select(ParliamentaryGroup.name_short).where(
                    ParliamentaryGroup.legislature_id == leg_id
                )
            )
        ).all()
    ]

    # Per-(vote, group) majority stance for the True/False generator.
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
    rng.shuffle(pool)
    questions: list[GameQuestion] = []

    for v in pool:
        if len(questions) >= n:
            break

        # Weight toward the fun, reasonable kinds; proposer is the rare hard one.
        eligible: list[str] = ["outcome"]
        majorities = majority_by_vote.get(v.vote_id, {})
        if majorities:
            eligible += ["party_tf", "party_tf"]  # double-weight: the fun one
        if v.group_short:
            eligible.append("proposer")
        kind = rng.choice(eligible)

        if kind == "outcome":
            prompt = "El Congrés la va aprovar?"
            opts = [
                GameOption(text="Sí, aprovada", correct=v.result == "approved"),
                GameOption(text="No, rebutjada", correct=v.result == "rejected"),
            ]
            rng.shuffle(opts)
            reveal = f"{v.ayes} vots a favor i {v.noes} en contra."
            category = "lleis"
        elif kind == "party_tf" and majorities:
            g = rng.choice(list(majorities.keys()))
            stance = majorities[g]
            gd = _display_group(g)
            prompt = f"{gd} hi va votar a favor?"
            voted_aye = stance == VoteChoice.AYE
            opts = [
                GameOption(text="Sí", correct=voted_aye),
                GameOption(text="No", correct=not voted_aye),
            ]
            reveal = f"{gd} {_STANCE_LABEL_CA[stance]}."
            category = "partits"
        elif kind == "proposer" and v.group_short:
            correct = _display_group(v.group_short)
            others = [x for x in all_groups if x and x != correct]
            rng.shuffle(others)
            opts = [GameOption(text=correct, correct=True)] + [
                GameOption(text=o, correct=False) for o in others[:3]
            ]
            rng.shuffle(opts)
            prompt = "Quin grup la va proposar?"
            reveal = None
            category = "partits"
        else:
            continue

        questions.append(
            GameQuestion(
                id=f"{kind}:{v.vote_id}",
                category=category,
                kind=kind,
                law_summary=v.summary,
                topic=v.topic_name,
                prompt=prompt,
                options=opts,
                reveal=reveal,
                source_id=v.vote_id,
            )
        )

    return questions
