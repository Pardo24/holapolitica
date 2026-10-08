"""What makes a vote a good game question, shared by the Trivia and the
"how would you vote?" quiz.

Two rules, both about being understood by anyone:

1. The subject touches daily life. With no topic chosen, the pool is the
   everyday themes (housing, work, health, schools, energy...) rather than
   treaty ratifications or the chamber's own rules.
2. The vote means what it looks like. A "debate de totalidad" votes the
   amendments to the whole text, so "yes" there is AGAINST the bill;
   amendment rounds vote fragments; a "toma en consideración" only lets a
   bill start. Asked as "did the Congress approve it?" or "would you vote
   yes?" next to the law's summary, each of them reads backwards.

And the card speaks plainly: the law's short plain title and the lead of
its plain summary, never the official wording.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from sqlalchemy import ColumnElement, Select, and_, func, not_, select

from app.models import InitiativeTopic, Topic, Vote
from app.services.vote_stage import is_amendment_sql

# Themes a reader meets in daily life. Left out: institutions, foreign
# affairs, historical memory, culture and language (fine subjects, but the
# votes on them are mostly about the state's own machinery or treaties).
EVERYDAY_TOPICS: tuple[str, ...] = (
    "habitatge",
    "drets-laborals",
    "economia",
    "sanitat",
    "educacio",
    "medi-ambient",
    "justicia",
    "energia",
    "igualtat",
    "immigracio",
    "transport",
    "tecnologia-drets",
    "seguretat",
)

# Below this many candidate votes in the everyday themes, widen to all.
MIN_EVERYDAY_POOL = 40


# How sure the classifier must be that a law is ABOUT a subject before a game
# files it there. Topics are tagged generously (a Ceuta aid decree carried
# "housing" at 0.6 for one of its measures), which is right for a topic page
# listing everything that touches housing, and wrong for "play on housing",
# where the reader expects laws on housing.
TOPIC_MIN_CONFIDENCE = 0.75


def initiatives_about(slugs: Sequence[str]) -> Select[tuple[int]]:
    """Ids of the initiatives mainly about any of ``slugs``."""
    return (
        select(InitiativeTopic.initiative_id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(Topic.slug.in_(list(slugs)))
        .where(InitiativeTopic.confidence >= TOPIC_MIN_CONFIDENCE)
    )


def not_backwards(*, include_taking: bool) -> ColumnElement[bool]:
    """Votes whose "yes" is not about the law as a whole.

    Totality debates and amendment rounds always; the "toma en
    consideración" too when ``include_taking`` is False (an outcome question
    would call a bill that merely started its passage "approved").
    """
    title = Vote.title
    clauses = [
        not_(title.ilike("debate% de totalidad%")),
        not_(title.ilike("debates de totalidad%")),
        not_(title.ilike("enmienda%")),
        # A group's amendment voted on the day the law passes: the subject
        # line is the law's ("Dictámenes de Comisiones…"), only the subgroup
        # says it is an amendment. A "yes" there is not a yes to the law.
        not_(is_amendment_sql()),
        not_(func.lower(func.coalesce(Vote.subgroup_title, "")).like("%totalidad%")),
    ]
    if not include_taking:
        clauses.append(not_(title.ilike("toma en consideraci%")))
    return and_(*clauses)


_ORIGINAL_WORDING = re.compile(
    r"^\s*(proyecto de ley|proposici[oó]n (no )?de ley|real decreto|projecte de llei"
    r"|proposici[oó] (no )?de llei|reial decret|moci[oó]n?)\b",
    re.IGNORECASE,
)


def reads_like_original(text: str) -> bool:
    """A "summary" that is really the official title restated."""
    return bool(_ORIGINAL_WORDING.match(text))


def summary_lead(text: str, max_chars: int = 240) -> str:
    """The first sentence or two of a summary, for a game card.

    A list summary ("... que: 1. ... 2. ...") keeps its lead only.
    """
    text = " ".join(text.split())
    text = re.split(r"\s(?:1[.)])\s", text, maxsplit=1)[0].rstrip(" :")
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for sentence in sentences:
        candidate = f"{out} {sentence}".strip()
        if out and len(candidate) > max_chars:
            break
        out = candidate
        if len(out) >= max_chars * 0.6:
            break
    if len(out) > max_chars:
        out = out[: max_chars - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return out
