"""Tests for the hemicycle image-map parser.

We do **not** hit the live Congreso page from tests; we feed the parser
a trimmed fixture mirroring the real Liferay output observed on
2026-05-12 at ``https://www.congreso.es/ca/hemiciclo``. Both attribute
orderings the portal emits in the wild are represented, plus a couple
of cabinet-bench (``Banco Azul``) entries that lack the
``getUrlFichaDiputado`` href — those MUST be skipped because the
"deputy" sitting there is a minister who isn't currently a member of
the chamber.
"""

from __future__ import annotations

from app.ingest.congreso.hemicycle import (
    HEMICYCLE_IMAGE_HEIGHT,
    HEMICYCLE_IMAGE_WIDTH,
    normalise_name_for_match,
    parse_hemicycle_html,
)

# A faithful trim of the real page. Each seat block reproduces the
# whitespace artefacts (trailing pad-spaces inside ``coords="…"``) the
# Liferay template emits.
FIXTURE_HTML = """
<div id="capaHemiciclo">
<img src='/o/diputados/img/hemiciclo.png' usemap="#hemiciclo">
<map name="hemiciclo">

  <area shape="circle" id="fotoHemi" alt="Francina Armengol Socias (Presidenta del Congreso de los Diputados)"
        coords="270,382,5                     "
        href="javascript:getUrlFichaDiputado(185, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo(
            '/docu/imgweb/diputados/185_15.jpg', '/wc/htdocs/web' ,
            'Armengol Socias, Francina (Presidenta del Congreso de los Diputados)',
            'Diputada per Balears (Illes)', 'G. P. Mesa del Congreso' , '', '', true, 185);"
        onmouseout="">

  <area shape="circle" id="fotoHemi" alt="Santiago Abascal Conde (Presidente)"
        coords="430,120,5                     "
        href="javascript:getUrlFichaDiputado(317, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo(
            '/docu/imgweb/diputados/317_15.jpg', '/wc/htdocs/web' ,
            'Abascal Conde, Santiago (Presidente)',
            'Diputado per Madrid', 'G. P. VOX' , '', '', true, 317);"
        onmouseout="">

  <area shape="circle" id="fotoHemi" alt="Cristina Abades Martínez"
        coords="120,200,5                     "
        href="javascript:getUrlFichaDiputado(491, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo(
            '/docu/imgweb/diputados/491_15.jpg', '/wc/htdocs/web' ,
            'Abades Martínez, Cristina',
            'Diputada per Lugo', 'G. P. Popular en el Congreso' , '', '', true, 491);"
        onmouseout="">

  <!-- A cabinet-bench seat without a getUrlFichaDiputado href.
       The parser must skip this and not place a phantom seat at
       (190, 290). -->
  <area shape="circle" id="fotoHemi" alt="Carlos Cuerpo Caballero (Vicepresidente Primero del Gobierno)"
        coords="190,290,5                     "
        href=""
        onmouseover="javascript:mostrarFotografiaHemiciclo(
            '/docu/imgweb/diputados/527_15.jpg', '/wc/htdocs/web' ,
            'Cuerpo Caballero, Carlos (Vicepresidente Primero del Gobierno)',
            'Diputado per ', 'G. P. ' , '', '', true, 0);"
        onmouseout="">

  <!-- Reversed attribute order: href appears before coords. -->
  <area shape="circle" id="fotoHemi"
        href="javascript:getUrlFichaDiputado(140, 15);"
        coords="294,382,5                     "
        alt="Alfonso Rodríguez Gómez de Celis (Vicepresidente Primero)"
        onmouseover="javascript:mostrarFotografiaHemiciclo(
            '/docu/imgweb/diputados/140_15.jpg', '/wc/htdocs/web' ,
            'Rodríguez Gómez de Celis, Alfonso (Vicepresidente Primero)',
            'Diputado per Sevilla', 'G. P. Mesa del Congreso' , '', '', true, 140);"
        onmouseout="">

  <area shape="circle" id="fotoHemi" alt="X"
        coords="100,100,5" href="javascript:getUrlFichaDiputado(1, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/1_15.jpg','/wc/htdocs/web','A, B','Diputat per Barcelona','G. P. Socialista','','',true,1);">
  <area shape="circle" id="fotoHemi" alt="X"
        coords="110,100,5" href="javascript:getUrlFichaDiputado(2, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/2_15.jpg','/wc/htdocs/web','C, D','Diputat per Barcelona','G. P. Socialista','','',true,2);">
  <area shape="circle" id="fotoHemi" alt="X"
        coords="120,100,5" href="javascript:getUrlFichaDiputado(3, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/3_15.jpg','/wc/htdocs/web','E, F','Diputat per Barcelona','G. P. Socialista','','',true,3);">
  <area shape="circle" id="fotoHemi" alt="X"
        coords="130,100,5" href="javascript:getUrlFichaDiputado(4, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/4_15.jpg','/wc/htdocs/web','G, H','Diputat per Barcelona','G. P. Socialista','','',true,4);">
  <area shape="circle" id="fotoHemi" alt="X"
        coords="140,100,5" href="javascript:getUrlFichaDiputado(5, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/5_15.jpg','/wc/htdocs/web','I, J','Diputat per Barcelona','G. P. Socialista','','',true,5);">
  <area shape="circle" id="fotoHemi" alt="X"
        coords="150,100,5" href="javascript:getUrlFichaDiputado(6, 15);"
        onmouseover="javascript:mostrarFotografiaHemiciclo('/docu/imgweb/diputados/6_15.jpg','/wc/htdocs/web','K, L','Diputada per Barcelona','G. P. Socialista','','',true,6);">

</map>
</div>
"""


def test_parse_hemicycle_returns_at_least_ten_seats() -> None:
    """The fixture contains 10 deputy-linked seats + 1 cabinet-bench skip."""
    seats = parse_hemicycle_html(FIXTURE_HTML)
    assert len(seats) >= 10

    cods = {s.cod_parlamentario for s in seats}
    # All ten linked codes parsed, cabinet-bench code 527 ignored.
    assert {185, 317, 491, 140, 1, 2, 3, 4, 5, 6} <= cods
    assert 527 not in cods


def test_parse_hemicycle_extracts_pixel_coordinates() -> None:
    """Coordinates must be the natural pixel values from the source image."""
    seats = {s.cod_parlamentario: s for s in parse_hemicycle_html(FIXTURE_HTML)}

    # Mesa front-row, central seat. Trailing pad-spaces inside the
    # coords attribute must NOT bleed into the captured digits.
    armengol = seats[185]
    assert (armengol.x, armengol.y) == (270, 382)

    # Reversed-attribute-order seat: parser must still recover both
    # the cod and the coords.
    rodriguez = seats[140]
    assert (rodriguez.x, rodriguez.y) == (294, 382)

    abascal = seats[317]
    assert (abascal.x, abascal.y) == (430, 120)


def test_parse_hemicycle_captures_raw_name() -> None:
    """The hover-card name is captured for the name-matching fallback."""
    seats = {s.cod_parlamentario: s for s in parse_hemicycle_html(FIXTURE_HTML)}

    abades = seats[491]
    assert abades.raw_name is not None
    # The hover JS uses "Family, Given (role?)" — we keep the raw form
    # and let normalise_name_for_match() flatten it.
    assert "Abades Martínez" in abades.raw_name


def test_normalise_name_strips_role_and_reflows_comma() -> None:
    """Family-comma-given with a parenthesised role normalises to a DB-comparable key."""
    raw = "Armengol Socias, Francina (Presidenta del Congreso de los Diputados)"
    key = normalise_name_for_match(raw)
    # Matches the casefold of how the DB stores Person.full_name.
    assert key == "francina armengol socias"


def test_normalise_name_handles_plain_form() -> None:
    """Names without a role suffix or comma still normalise cleanly."""
    assert normalise_name_for_match("Santiago Abascal Conde") == "santiago abascal conde"


def test_image_dimensions_constants_are_natural_size() -> None:
    """The exported constants must match the natural size of the published PNG.

    These are the values the API serialises in the ``HemicycleLayout``
    response — the frontend needs the source viewport to map pixel
    coordinates into its own SVG viewBox correctly.
    """
    assert HEMICYCLE_IMAGE_WIDTH == 536
    assert HEMICYCLE_IMAGE_HEIGHT == 393
