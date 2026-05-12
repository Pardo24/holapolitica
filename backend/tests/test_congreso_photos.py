"""Unit tests for the ficha-page extractors in :mod:`app.ingest.congreso.photos`.

We don't exercise the network round-trip here — the photo backfill flow
itself is tested by manual smoke runs against live HTML. These tests pin
the *parsing* of the three extracted fields (name, bio paragraph,
committee/role list) against a frozen HTML snippet so a future template
change doesn't silently regress production data.

The snippet below is a trimmed, byte-for-byte copy of the relevant
section of Armengol's live ficha (codParlamentario=185, XV legislature)
captured on 2026-05-12. We keep only the blocks the extractors care
about so the test file stays readable.
"""

from __future__ import annotations

from app.ingest.congreso.photos import (
    _extract_bio_text,
    _extract_birth_year,
    _extract_commissions,
    _extract_full_name,
)

# A condensed but otherwise faithful clip of the Armengol ficha page.
# The leading and trailing wrapper divs are kept so the bio block's
# upstream "stop at <div class='f-alta'>" boundary fires exactly the way
# it does in the wild.
ARMENGOL_FICHA_HTML = """
<html><body>
<div class="nombre-dip">Armengol Socias, Francina</div>

<div class="row cuerpo-diputado-detalle">
    <div class="col-12">
        <div class="row">
            <div class="col-12">
                <h3>Fitxa personal</h3>
                <p>Nascuda el Wed Aug 11 00:00:00 CET 1971
                   en Inca, Mallorca (Illes Balears)</p>
                <p>Diputada de la XV Legislatura</p>
                Licenciada en Farmacia. <br> Postgrado en Dermofarmacia. <br>
                Secretaria General PSIB-PSOE Illes Balears. <br>
                Ha sido dos legislaturas Presidenta del Govern de las Illes Balears (2015-2023)
                y una legislatura Presidenta del Consell Insular de Mallorca (2007-2011)

                <div class="f-alta">
                    <i class="fas fa-calendar-alt" aria-hidden="true"></i>
                    Condició plena: Thu Aug 17 00:00:00 CEST 2023
                </div>

                <div class="f-alta"></div>

                <h3>Càrrecs</h3>
                <ul class="cargos">
                    <li>Presidenta del Congreso de los Diputados
                        des del Thu Aug 17 00:00:00 CEST 2023</li>
                    <li>Presidenta de la <a href="/diputacion-permanente">Diputación Permanente</a>
                        des del Tue Nov 21 00:00:00 CET 2023</li>
                    <li>Presidenta de la <a href="/mesa">Mesa del Congreso</a>
                        des del Thu Aug 17 00:00:00 CEST 2023</li>
                </ul>
            </div>
        </div>
    </div>
</div>
</body></html>
"""


def test_extract_full_name_matches_nombre_dip_block() -> None:
    """The <div class="nombre-dip"> wrapper is the canonical name node."""
    assert _extract_full_name(ARMENGOL_FICHA_HTML) == "Francina Armengol Socias"


def test_extract_birth_year_from_java_date_format() -> None:
    """Java's Date.toString output ("Wed Aug 11 ... 1971") still yields the year."""
    assert _extract_birth_year(ARMENGOL_FICHA_HTML) == 1971


def test_extract_bio_text_drops_autogen_lines_and_keeps_paragraph() -> None:
    bio = _extract_bio_text(ARMENGOL_FICHA_HTML)
    assert bio is not None
    # The auto-generated header rows must be filtered out.
    assert "Nascuda el" not in bio
    assert "Diputada de la XV Legislatura" not in bio
    assert "Condició plena" not in bio
    # The editorial paragraph must survive, with <br> turned into a
    # paragraph break so the frontend can split on \n\n.
    assert "Licenciada en Farmacia" in bio
    assert "Postgrado en Dermofarmacia" in bio
    assert "Consell Insular de Mallorca" in bio
    # At least one paragraph break must be present — bio_text is meant
    # to be rendered as multiple <p>s on the page.
    assert "\n\n" in bio


def test_extract_bio_text_returns_none_when_block_missing() -> None:
    assert _extract_bio_text("<html><body><p>no ficha here</p></body></html>") is None


def test_extract_bio_text_drops_catalan_plural_legislatures_row() -> None:
    """A deputy who served multiple legislatures lists them with the
    Catalan plural ("Legislatures") AND comma-joined roman numerals.

    Validated 2026-05-12 against Abascal's ficha (cod 317), whose
    second header paragraph reads "Diputat de la XIII, XIV i XV
    Legislatures". The bio extractor must drop that row wholesale —
    not surface it as biography text — even though it's neither in
    the canonical Spanish singular form nor a single roman numeral.
    """
    html = """
    <h3>Fitxa personal</h3>
    <p>Nascut el Wed Apr 14 00:00:00 CEST 1976</p>
    <p>Diputat de la XIII, XIV i XV Legislatures</p>
    Casado. Cuatro hijos. <br> Presidente de VOX <br> Licenciado en Sociología
    <div class="f-alta">Condició plena: Thu Aug 17 00:00:00 CEST 2023</div>
    """
    bio = _extract_bio_text(html)
    assert bio is not None
    assert "Legislatures" not in bio
    assert "XIII" not in bio
    assert "Casado" in bio
    assert "Presidente de VOX" in bio


def test_extract_commissions_flattens_each_li_in_order() -> None:
    rows = _extract_commissions(ARMENGOL_FICHA_HTML)
    assert len(rows) == 3
    # Order preserved exactly as the source HTML lists them.
    assert rows[0].startswith("Presidenta del Congreso de los Diputados")
    # Anchor tag contents are flattened into the visible text.
    assert "Diputación Permanente" in rows[1]
    assert "Mesa del Congreso" in rows[2]
    # No HTML tags leak through.
    for row in rows:
        assert "<" not in row and ">" not in row


def test_extract_commissions_returns_empty_list_when_block_missing() -> None:
    """A ficha with no Càrrecs section yields an empty list (not None).

    The DB column distinguishes ``NULL`` (never scraped) from ``[]``
    (scraped, no roles). The extractor returns ``[]`` so the caller can
    persist the unambiguous "we looked, there's nothing" signal.
    """
    assert _extract_commissions("<html><body>no cargos</body></html>") == []
