"""Tests for the editorial guardrail of the plain-language summariser.

The LLM provider is not exercised here (no API key in CI). What we test is
the *output validator*: given a synthetic LLM response, does the validator
correctly accept clean text and reject editorial drift?

This is the contract that makes the feature defensible at audit. If you
loosen any banned term, justify it in the PR description.
"""

from __future__ import annotations

import pytest

from app.services.plain_summary import (
    INSUFFICIENT,
    assert_neutral_summary,
)


def test_neutral_summary_passes() -> None:
    text = (
        "Modifica l'article 89 de la Llei orgànica del Poder Judicial per "
        "atribuir a l'Audiència Nacional el coneixement dels delictes "
        "relacionats amb el narcotràfic."
    )
    assert_neutral_summary(text)  # does not raise


@pytest.mark.parametrize(
    "phrase",
    [
        "Aquesta llei polèmica modifica…",
        "El text destacat reforma el Codi Penal",
        "Una iniciativa criticada pels grups de l'oposició",
        "Una llei beneficiosa per als treballadors",
        "Una iniciativa perjudicial per als pensionistes",
        "Mesura controvertida sobre habitatge",
        "Iniciativa innecessària segons l'oposició",
        "Una llei progressista en matèria laboral",
        "Una iniciativa rellevant per al sector",
        "Una lluita contra la corrupció",
        "Una amenaça per a la convivència",
    ],
)
def test_editorial_phrases_are_rejected(phrase: str) -> None:
    with pytest.raises(ValueError):
        assert_neutral_summary(phrase)


@pytest.mark.parametrize(
    "phrase",
    [
        # Neutral phrases that include words SUPERFICIALLY similar to banned
        # ones; must NOT be rejected (false-positive guard).
        "Modifica la Llei orgànica de Defensa Nacional.",
        "Reforma de la Llei de memòria històrica.",
        "Estableix les condicions del judici just.",
        "Modifica les normes sobre el sistema públic.",
        "Reforma diverses lleis orgàniques.",
    ],
)
def test_neutral_phrases_with_lookalike_words_pass(phrase: str) -> None:
    assert_neutral_summary(phrase)


def test_insufficient_marker_is_a_constant() -> None:
    # The exact string is part of the protocol with the LLM. Don't drift.
    assert INSUFFICIENT == "[INSUFICIENT]"
