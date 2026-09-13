"""Tests for cutting a PNL / motion out of a BOCG Serie D bulletin."""

from __future__ import annotations

from app.ingest.congreso.motion_texts import expediente_of, find_bocg_d_link, slice_item_text

_BULLETIN = """\
SUMARIO
162/000833 Proposición no de Ley para una respuesta de Estado en Ceuta. 34
162/000834 Proposición no de Ley sobre el deporte de élite. 36
BOLETÍN OFICIAL DE LAS CORTES GENERALES
162/000833
El Grupo Parlamentario Popular en el Congreso presenta la siguiente
Proposición no de Ley para su debate en Pleno.
Exposición de motivos
Los acontecimientos vividos durante el verano justifican esta iniciativa.
«El Congreso de los Diputados insta al Gobierno a:
1. Convocar el Consejo de Seguridad Nacional.
2. Reforzar los medios de la frontera.»
162/000834
El Grupo Parlamentario Socialista presenta otra Proposición no de Ley.
«El Congreso de los Diputados insta al Gobierno a mejorar las ayudas.»
"""


def test_expediente_drops_the_suffix() -> None:
    assert expediente_of("162/000833/0000") == "162/000833"
    assert expediente_of("173/000186") == "173/000186"


def test_finds_the_serie_d_link_and_page() -> None:
    html = (
        '<a href="/public_oficiales/L15/CONG/BOCG/B/BOCG-15-B-12.PDF">B</a>'
        '<a href="/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-578.PDF#page=34">PDF</a>'
    )
    assert find_bocg_d_link(html) == ("/public_oficiales/L15/CONG/BOCG/D/BOCG-15-D-578.PDF", 34)
    assert find_bocg_d_link("<p>sin publicaciones</p>") is None


def test_slices_one_item_from_its_header_to_the_next() -> None:
    body = slice_item_text(_BULLETIN, "162/000833")
    assert body is not None
    # Starts at the item, not at its line in the table of contents.
    assert body.startswith("El Grupo Parlamentario Popular")
    assert "insta al Gobierno a" in body
    assert "Consejo de Seguridad Nacional" in body
    # Stops before the next initiative.
    assert "Socialista" not in body
    assert "SUMARIO" not in body


def test_missing_item_returns_none() -> None:
    assert slice_item_text(_BULLETIN, "162/000999") is None
