"""Reading a bill's text: what the model may say, and what is thrown away.

The analysis is shown to readers as "what the text says", so the guard is
strict: a tag without a passage behind it is dropped, an unknown tag is
dropped, a point with editorial language is dropped, and a Catalan list
that does not line up with the Spanish one is discarded rather than
pairing the wrong article references.
"""

from __future__ import annotations

import json

from app.services.law_text import parse_analysis, pdf_url_from_source


def test_pdf_url_and_first_page_from_source() -> None:
    assert pdf_url_from_source(
        "https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-12-1.PDF#page=3"
    ) == ("https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-12-1.PDF", 3)
    assert pdf_url_from_source("https://x.es/a.pdf") == ("https://x.es/a.pdf", 1)
    assert pdf_url_from_source("https://www.congreso.es/busqueda-de-iniciativas") is None
    assert pdf_url_from_source(None) is None


def _raw(**over: object) -> str:
    data: dict[str, object] = {
        "points_es": [
            {"text": "Rebaja el IVA de los alimentos básicos al 0 %.", "ref": "Art. 1"},
            {"text": "Crea una deducción por alquiler de vivienda habitual.", "ref": None},
        ],
        "points_ca": [
            {"text": "Rebaixa l'IVA dels aliments bàsics al 0 %.", "ref": "Art. 1"},
            {"text": "Crea una deducció per lloguer d'habitatge habitual.", "ref": None},
        ],
        "tags": [
            {
                "tag": "tax_down",
                "evidence_es": "Art. 1: tipo del 0 % para alimentos",
                "evidence_ca": "Art. 1: tipus del 0 %",
            },
            {"tag": "tax_up", "evidence_es": ""},
            {"tag": "makes_life_better", "evidence_es": "Art. 9: todo"},
        ],
    }
    data.update(over)
    return "Aquí tienes:\n" + json.dumps(data, ensure_ascii=False)


def test_keeps_valid_points_and_backed_tags_only() -> None:
    points, tags, evidence = parse_analysis(_raw())
    assert [p["ref"] for p in points["es"]] == ["Art. 1", None]
    assert len(points["ca"]) == 2
    # tax_up has no passage, the other is not a tag we know.
    assert tags == ["tax_down"]
    assert evidence["ca"]["tax_down"].startswith("Art. 1")


def test_drops_editorial_points_and_misaligned_translation() -> None:
    points, _, _ = parse_analysis(
        _raw(
            points_es=[
                {
                    "text": "Una medida polémica que supone un ataque a la clase media.",
                    "ref": "Art. 2",
                },
                {"text": "Amplía el permiso de paternidad a 20 semanas.", "ref": "Art. 4"},
            ],
            points_ca=[{"text": "Amplia el permís de paternitat a 20 setmanes.", "ref": "Art. 4"}],
        )
    )
    assert [p["text"] for p in points["es"]] == ["Amplía el permiso de paternidad a 20 semanas."]
    # Lengths now match only because the editorial point went; still aligned.
    assert len(points["ca"]) == 1
