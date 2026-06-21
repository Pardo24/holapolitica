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
from typing import NamedTuple, TypedDict

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
_STANCE_LABEL_ES = {
    VoteChoice.AYE: "votó a favor",
    VoteChoice.NO: "votó en contra",
    VoteChoice.ABSTENTION: "se abstuvo",
}


class _GameStrings(TypedDict):
    outcome_prompt: str
    opt_approved: str
    opt_rejected: str
    outcome_reveal: str
    party_tf_prompt: str
    party_tf_reveal: str
    proposer_prompt: str
    opt_yes: str
    opt_no: str
    stance: dict[VoteChoice, str]


# All player-facing question strings, per supported language. Questions are
# generated server-side, so they must be localised HERE — the frontend only
# localises the chrome. Catalan and Castilian are the supported game
# languages; any other UI locale falls back to Catalan.
_GAME_TEXT: dict[str, _GameStrings] = {
    "ca": {
        "outcome_prompt": "El Congrés la va aprovar?",
        "opt_approved": "Sí, aprovada",
        "opt_rejected": "No, rebutjada",
        "outcome_reveal": "{ayes} vots a favor i {noes} en contra.",
        "party_tf_prompt": "{g} hi va votar a favor?",
        "party_tf_reveal": "{g} {stance}.",
        "proposer_prompt": "Quin grup la va proposar?",
        "opt_yes": "Sí",
        "opt_no": "No",
        "stance": _STANCE_LABEL_CA,
    },
    "es": {
        "outcome_prompt": "¿El Congreso la aprobó?",
        "opt_approved": "Sí, aprobada",
        "opt_rejected": "No, rechazada",
        "outcome_reveal": "{ayes} votos a favor y {noes} en contra.",
        "party_tf_prompt": "¿{g} votó a favor?",
        "party_tf_reveal": "{g} {stance}.",
        "proposer_prompt": "¿Qué grupo la propuso?",
        "opt_yes": "Sí",
        "opt_no": "No",
        "stance": _STANCE_LABEL_ES,
    },
}


def _game_lang(lang: str | None) -> str:
    """Normalise a UI locale to a supported game language ('ca' or 'es').

    Defensive against a non-str default: unit tests call ``game_questions``
    directly, so an unsupplied ``lang`` arrives as the FastAPI ``Query``
    sentinel rather than a string. Anything that isn't a real locale string
    falls back to Catalan."""
    return "es" if isinstance(lang, str) and lang.lower().startswith("es") else "ca"


# Groups (by name_short) that are NOT a coherent party and so have no
# meaningful "how did the group vote": the Grupo Mixto is a procedural
# catch-all of unrelated small parties (BNG, CCa, UPN…) that often split, so a
# "majority stance" for it is misleading. Excluded from the party-vote question.
_NON_PARTY_GROUPS = {"GP Mixto"}


class GameOption(BaseModel):
    text: str
    correct: bool
    # When the option IS a party, its identity so the UI can show the coloured
    # disc + abbreviation (our neutral stand-in for an official logo).
    party_slug: str | None = None
    party_color: str | None = None


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
    # The party the question is ABOUT (party_tf), so the UI can show its badge
    # in the prompt.
    party_slug: str | None = None
    party_color: str | None = None
    # One extra fact revealed after answering, to teach (e.g. the tally).
    reveal: str | None = None
    source_kind: str = "vote"
    source_id: int


class _GroupMeta(NamedTuple):
    slug: str
    display: str
    color: str | None


class _RichVote(NamedTuple):
    vote_id: int
    summary: str
    result: str
    ayes: int
    noes: int
    group_short: str | None
    group_slug: str | None
    group_color: str | None
    topic_ca: str | None
    topic_es: str | None


def _display_group(name_short: str) -> str:
    if name_short == "GP Mixto":
        return name_short
    return name_short[3:] if name_short.startswith("GP ") else name_short


@router.get("/questions", response_model=list[GameQuestion])
async def game_questions(
    n: int = Query(7, ge=3, le=20),
    legislature_id: int | None = Query(None),
    seed: int | None = Query(
        None, description="Fix the question set so a shared challenge is reproducible."
    ),
    lang: str = Query("ca", description="UI locale; questions render in 'ca' or 'es'."),
    session: AsyncSession = Depends(get_session),
) -> list[GameQuestion]:
    """Return ``n`` shuffled, explanation-led trivia questions.

    With ``seed`` the selection is deterministic, so a challenge link drops a
    friend onto the exact same round to compare scores."""
    lang_key = _game_lang(lang)
    txt = _GAME_TEXT[lang_key]
    stance_label = txt["stance"]
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
        select(
            InitiativeTopic.initiative_id,
            Topic.name_ca.label("tname"),
            Topic.name_es.label("tname_es"),
        )
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
                ParliamentaryGroup.slug,
                ParliamentaryGroup.color_hex,
                topic_sq.c.tname,
                topic_sq.c.tname_es,
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
    for vid, sca, ses, result, ayes, noes, gshort, gslug, gcolor, tname, tname_es in pool_rows:
        if vid in by_vote:
            continue
        # Lead with the summary in the player's language, falling back to the
        # other one so a card is never dropped just for a missing translation.
        summary = (((ses or sca) if lang_key == "es" else (sca or ses)) or "").strip()
        if len(summary) < 30:  # too short to be a good card
            continue
        by_vote[vid] = _RichVote(
            vote_id=vid,
            summary=summary,
            result=result.value if hasattr(result, "value") else str(result),
            ayes=ayes or 0,
            noes=noes or 0,
            group_short=gshort,
            group_slug=gslug,
            group_color=gcolor,
            topic_ca=tname,
            topic_es=tname_es,
        )
    pool = list(by_vote.values())
    if not pool:
        return []

    # Group catalogue with identity, for badges + plausible proposer distractors.
    meta_by_short: dict[str, _GroupMeta] = {}
    for short, slug, color in (
        await session.execute(
            select(
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.color_hex,
            ).where(ParliamentaryGroup.legislature_id == leg_id)
        )
    ).all():
        meta_by_short[short] = _GroupMeta(slug=slug, display=_display_group(short), color=color)
    distractor_metas = list(meta_by_short.values())

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

    rng = random.Random(seed)
    rng.shuffle(pool)
    questions: list[GameQuestion] = []

    for v in pool:
        if len(questions) >= n:
            break

        # Weight toward the fun, reasonable kinds; proposer is the rare hard one.
        majorities = majority_by_vote.get(v.vote_id, {})
        # Only coherent parties can be asked "did X vote in favour?" — drop the
        # Grupo Mixto and friends (see _NON_PARTY_GROUPS).
        votable = [g for g in majorities if g not in _NON_PARTY_GROUPS]
        eligible: list[str] = ["outcome"]
        if votable:
            eligible += ["party_tf", "party_tf"]  # double-weight: the fun one
        if v.group_short:
            eligible.append("proposer")
        kind = rng.choice(eligible)

        q_party_slug: str | None = None
        q_party_color: str | None = None

        if kind == "outcome":
            prompt = txt["outcome_prompt"]
            opts = [
                GameOption(text=txt["opt_approved"], correct=v.result == "approved"),
                GameOption(text=txt["opt_rejected"], correct=v.result == "rejected"),
            ]
            rng.shuffle(opts)
            reveal = txt["outcome_reveal"].format(ayes=v.ayes, noes=v.noes)
            category = "lleis"
        elif kind == "party_tf" and votable:
            g = rng.choice(votable)
            stance = majorities[g]
            meta = meta_by_short.get(g)
            gd = meta.display if meta else _display_group(g)
            if meta:
                q_party_slug, q_party_color = meta.slug, meta.color
            prompt = txt["party_tf_prompt"].format(g=gd)
            voted_aye = stance == VoteChoice.AYE
            opts = [
                GameOption(text=txt["opt_yes"], correct=voted_aye),
                GameOption(text=txt["opt_no"], correct=not voted_aye),
            ]
            reveal = txt["party_tf_reveal"].format(g=gd, stance=stance_label[stance])
            category = "partits"
        elif kind == "proposer" and v.group_short:
            correct_meta = meta_by_short.get(v.group_short)
            correct_display = (
                correct_meta.display if correct_meta else _display_group(v.group_short)
            )
            correct_slug = correct_meta.slug if correct_meta else None
            others = [m for m in distractor_metas if m.slug != correct_slug]
            rng.shuffle(others)
            opts = [
                GameOption(
                    text=correct_display,
                    correct=True,
                    party_slug=correct_slug,
                    party_color=v.group_color,
                )
            ] + [
                GameOption(text=m.display, correct=False, party_slug=m.slug, party_color=m.color)
                for m in others[:3]
            ]
            rng.shuffle(opts)
            prompt = txt["proposer_prompt"]
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
                topic=(v.topic_es if lang_key == "es" else v.topic_ca),
                prompt=prompt,
                options=opts,
                party_slug=q_party_slug,
                party_color=q_party_color,
                reveal=reveal,
                source_id=v.vote_id,
            )
        )

    return questions
