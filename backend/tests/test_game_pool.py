"""What makes a good game card: plain words, and a vote that means yes."""

from __future__ import annotations

from app.services.game_pool import reads_like_original, summary_lead


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
