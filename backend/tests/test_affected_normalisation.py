"""The audience tags behind the /lleis "who it affects" filter.

Free-text tags from a model arrive under several spellings for the same
collective, which turned the filter into a list of near-duplicates. These
tests pin the canonical forms and the conservative merge policy.
"""

from __future__ import annotations

import pytest

from app.services.affected import normalise_audience_tag, normalise_audience_tags


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Agricultors  ", "agricultors"),
        ("els agricultors", "agricultors"),
        ("Las trabajadoras", "trabajadores"),
        ("propietarios.", "propietarios"),
        ("administració pública", "administracions públiques"),
        ("administración pública", "administraciones públicas"),
        ("govern espanyol", "govern"),
        ("gobierno central", "gobierno"),
        ("llogaters", "arrendataris"),
        ("alumnat", "estudiants"),
        ("ciudadanos", "ciudadanía"),
        # Mistranslations of "padres" seen in production.
        ("paders", "pares"),
    ],
)
def test_canonical_forms(raw: str, expected: str) -> None:
    assert normalise_audience_tag(raw) == expected


def test_unknown_tags_pass_through_cleaned() -> None:
    # The map is curated, not a guesser: an unseen collective keeps its name.
    assert normalise_audience_tag("  Pescadors d'arrossegament ") == "pescadors d'arrossegament"


def test_merging_is_conservative() -> None:
    # A subset must never be folded into a broader collective.
    assert normalise_audience_tag("propietaris") == "propietaris"
    assert normalise_audience_tag("grans patrimonis") == "grans patrimonis"


def test_list_dedupes_and_keeps_order() -> None:
    tags = ["administracions públiques", "administració pública", "govern", "govern central"]
    assert normalise_audience_tags(tags) == ["administracions públiques", "govern"]
