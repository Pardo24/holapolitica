"""Tests for the proposing-group resolver.

These are pure function tests — no DB. We pass in fake group rows.
"""

from __future__ import annotations

from app.models import ParliamentaryGroup
from app.services.proposing_group import resolve_proposing_group


def _g(slug: str, name_long: str) -> ParliamentaryGroup:
    g = ParliamentaryGroup(
        legislature_id=1, slug=slug, name_short="GP " + slug, name_long=name_long
    )
    g.id = hash(slug) % 1000
    return g


GROUPS = [
    _g("popular", "Grupo Parlamentario Popular en el Congreso"),
    _g("socialista", "Grupo Parlamentario Socialista"),
    _g("vox", "Grupo Parlamentario VOX"),
    _g("sumar", "Grupo Parlamentario Plurinacional SUMAR"),
    _g("vasco", "Grupo Parlamentario Vasco (EAJ-PNV)"),
    _g("mixto", "Grupo Parlamentario Mixto"),
]


def test_extracts_vox() -> None:
    desc = (
        "Proposición no de Ley del Grupo Parlamentario VOX, relativa al "
        "colapso del Sistema Nacional de Salud."
    )
    assert resolve_proposing_group(desc, GROUPS).slug == "vox"


def test_extracts_popular_full_name() -> None:
    desc = (
        "Proposición no de Ley del Grupo Parlamentario Popular en el Congreso, " "sobre habitatge."
    )
    assert resolve_proposing_group(desc, GROUPS).slug == "popular"


def test_picks_longest_match_when_overlap() -> None:
    """The Basque group's long name should beat any prefix-overlap."""
    desc = "Moción del Grupo Parlamentario Vasco (EAJ-PNV)..."
    assert resolve_proposing_group(desc, GROUPS).slug == "vasco"


def test_returns_none_when_no_group_mentioned() -> None:
    desc = "Convalidación o derogación de Reales Decretos-leyes."
    assert resolve_proposing_group(desc, GROUPS) is None


def test_returns_none_for_empty_description() -> None:
    assert resolve_proposing_group(None, GROUPS) is None
    assert resolve_proposing_group("", GROUPS) is None


def test_returns_none_when_groups_list_empty() -> None:
    assert resolve_proposing_group("Grupo Parlamentario VOX", []) is None
