"""What makes a good game card: plain words, and a vote that means yes."""

from __future__ import annotations

from app.models import InitiativeType
from app.services.game_pool import (
    best_tiers,
    is_procedural,
    law_tier,
    reads_like_original,
    summary_lead,
)


def test_the_official_wording_is_not_a_summary() -> None:
    assert reads_like_original("Proyecto de Ley por el que se modifican diversas normas.")
    assert reads_like_original("Proposició no de llei sobre l'habitatge.")
    assert not reads_like_original("Rebaixa l'IVA dels aliments bàsics.")


def test_lead_keeps_the_first_sentences_within_bounds() -> None:
    text = "Primera frase curta. Segona frase també curta. " + "Tercera " * 60
    lead = summary_lead(text, max_chars=80)
    assert lead.startswith("Primera frase curta.")
    assert len(lead) <= 80


def test_lead_drops_the_numbered_list() -> None:
    assert summary_lead("La moció demana al Govern que: 1. Faci X. 2. Faci Y.") == (
        "La moció demana al Govern que"
    )


def test_laws_that_say_whom_they_affect_come_first() -> None:
    effects = {"llogater": {"ca": "Pagaràs menys."}}
    assert law_tier(InitiativeType.PROYECTO_LEY, effects) == 0
    assert law_tier("real_decreto_ley", effects) == 0
    assert law_tier(InitiativeType.PROPOSICION_LEY, None) == 1
    assert law_tier(InitiativeType.PROPOSICION_LEY, {}) == 1
    # A motion is never a law, whatever it says.
    assert law_tier(InitiativeType.PROPOSICION_NO_LEY, effects) == 2
    assert law_tier(InitiativeType.MOCION, effects) == 2


def test_best_tiers_widens_only_when_short() -> None:
    items = [("a", 0), ("b", 2), ("c", 1), ("d", 0), ("e", 1)]
    tier = lambda item: item[1]  # noqa: E731
    assert best_tiers(items, tier, 2) == [("a", 0), ("d", 0)]
    assert best_tiers(items, tier, 3) == [("a", 0), ("c", 1), ("d", 0), ("e", 1)]
    assert best_tiers(items, tier, 9) == items


def test_procedure_is_not_a_question() -> None:
    assert is_procedural("Tramitación como proyecto de ley")
    assert is_procedural(None, "Acuerdo entre el Reino de España y Uzbekistán")
    assert not is_procedural("Proyecto de Ley de vivienda", "Ley de acuerdos de alquiler")
