"""What a single vote decided within its law: an amendment, the final text…

A bill is not voted once. On the day it reaches the plenary the Congress
votes each group's amendments (or bundles of them), then the committee's
text, then, for an organic law, the whole text again for the absolute
majority. The vote XML says which is which in ``<TituloSubGrupo>`` /
``<TextoSubGrupo>``::

    Enmiendas presentadas por el Grupo Parlamentario Popular en el Congreso
        Enmienda 26.
    Votación del dictamen.
    Votación de conjunto.

Without it the ten votes of one law read as the same question asked ten
times with contradictory answers (the PP "for" in one, "against" in the
next), when most of them were amendments the majority turned down before
approving the law itself.

The stage is derived, never stored: it is a pure function of four text
fields we keep verbatim, so improving the rules needs no backfill.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Literal

from sqlalchemy import ColumnElement, and_, func, or_

from app.models import ParliamentaryGroup, Vote

VoteStage = Literal[
    "consideration",  # toma en consideración: should the Congress process it at all
    "totality",  # enmienda a la totalidad: return the bill / swap in an alternative text
    "amendment",  # a group's amendment(s) or voto particular, in the plenary
    "senate_amendment",  # the changes the Senate made, accepted or not one by one
    "final",  # the committee's text (dictamen), as amended
    "whole",  # votación de conjunto: the organic-law absolute-majority vote
    "point",  # one point of a motion / PNL voted separately
    "validation",  # convalidación of a Real Decreto-ley
    "as_bill",  # process a validated decree-law as a bill too
]

# Stages that vote on a change TO the law, not on the law. Their outcome is
# not the law's outcome, and the law's own headline must not stand in for
# them.
AMENDMENT_STAGES: frozenset[str] = frozenset({"totality", "amendment", "senate_amendment"})


def is_amendment_sql() -> ColumnElement[bool]:
    """SQL twin of ``vote_stage(...) == "amendment"``: a group's amendment
    or voto particular voted in the plenary. Never the law's own vote."""
    sg = func.lower(func.coalesce(Vote.subgroup_title, ""))
    return or_(sg.like("enmienda%"), sg.like("voto% particular%"), sg.like("votos particulares%"))


def is_change_vote_sql() -> ColumnElement[bool]:
    """Votes on changes TO a law rather than on the law: a group's amendment
    or voto particular, and the Senate's changes voted one by one (the law's
    title on each, contradictory results). Left out wherever a deputy's or a
    group's stance on laws is counted, so a "no" to another group's
    amendment never reads as a "no" to the law."""
    title = func.lower(Vote.title)
    desc = func.lower(func.coalesce(Vote.description, ""))
    return or_(
        is_amendment_sql(),
        and_(title.like("enmiendas del senado%"), ~desc.like("votación de conjunto%")),
    )


def latest_first() -> tuple[Any, ...]:
    """Order a law's votes newest first. Every vote of a sitting carries the
    same noon timestamp, so within a day the session's own order decides."""
    return (Vote.voted_at.desc(), Vote.sequence_in_session.desc().nulls_last(), Vote.id.desc())


def _low(s: str | None) -> str:
    return (s or "").strip().lower()


def vote_stage(
    title: str | None,
    description: str | None,
    subgroup_title: str | None,
    subgroup_text: str | None = None,
) -> VoteStage | None:
    """Classify a vote by the procedural step it belongs to, or ``None``.

    ``None`` is the common case (a PNL or motion voted whole, a convenio, a
    procedural agreement): nothing to say beyond the vote itself.
    """
    t, d, sg = _low(title), _low(description), _low(subgroup_title)
    st = _low(subgroup_text)

    if t.startswith("toma en consideración"):
        return "consideration"
    if (
        "totalidad" in sg
        or "totalidad" in st
        or d.startswith(
            (
                "votación de la enmienda a la totalidad",
                "votación conjunta de las enmiendas a la totalidad",
            )
        )
    ):
        return "totality"
    if sg.startswith("votación de conjunto") or d.startswith("votación de conjunto"):
        return "whole"
    if sg.startswith("votación del dictamen"):
        return "final"
    if t.startswith("enmiendas del senado"):
        return "senate_amendment"
    if sg.startswith(("enmienda", "votos particulares", "voto particular")):
        return "amendment"
    if sg.startswith("votación separada por puntos"):
        return "point"
    if t.startswith("convalidación") and d.startswith("real decreto-ley"):
        return "validation"
    if d.startswith("tramitación como proyecto de ley"):
        return "as_bill"
    return None


def amendment_groups(
    subgroup_title: str | None, groups: Iterable[ParliamentaryGroup]
) -> list[ParliamentaryGroup]:
    """The groups that signed an amendment, from ``<TituloSubGrupo>``.

    "Enmiendas presentadas por el Grupo Parlamentario Plurinacional SUMAR, el
    Grupo Parlamentario Republicano, el Grupo Parlamentario Euskal Herria
    Bildu y el Grupo Parlamentario Mixto (…)" names several. Each group's
    ``name_long`` is matched as a substring, in order of appearance; a match
    contained in a longer match ("Vasco" in "Vasco (EAJ-PNV)") is dropped,
    and the same name from another legislature's row counts once.
    """
    if not subgroup_title:
        return []
    found: list[tuple[int, ParliamentaryGroup]] = []
    seen_names: set[str] = set()
    for g in sorted(groups, key=lambda g: -len(g.name_long or "")):
        name = g.name_long
        if not name or name in seen_names:
            continue
        pos = subgroup_title.find(name)
        if pos < 0:
            continue
        if any(name in other for other in seen_names):
            continue
        seen_names.add(name)
        found.append((pos, g))
    return [g for _, g in sorted(found, key=lambda x: x[0])]


def stage_groups_for(
    stage: str | None,
    subgroup_title: str | None,
    subgroup_text: str | None,
    groups: Iterable[ParliamentaryGroup],
) -> list[dict[str, str | None]]:
    """Who signed the amendment a vote decided, as API dicts; empty otherwise.

    A totality amendment names its group in the text line ("Enmienda a la
    totalidad … presentada por el Grupo Parlamentario VOX"), a plenary
    amendment in the title line; both are searched.
    """
    if stage not in ("amendment", "totality"):
        return []
    text = " ".join(s for s in (subgroup_title, subgroup_text) if s)
    return [
        {"slug": g.slug, "name_short": g.name_short, "color_hex": g.color_hex}
        for g in amendment_groups(text, groups)
    ]
