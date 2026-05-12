"""Tests for the BOCG PDF "Exposición de motivos" extractor.

These tests use fully synthetic text inputs that mimic the structure of
a real BOCG PDF after pypdf's ``extract_text()`` pass. We don't ship
fixture PDFs because pypdf's output is deterministic from the source
PDF but the source PDFs are large and copyrighted; the heuristic we're
exercising only ever sees the post-extraction text.

A separate live smoke (``initiative_objects_smoke`` bootstrap step)
exercises the end-to-end PDF download + parse path against the real
Congreso portal.
"""

from __future__ import annotations

import pytest

from app.ingest.congreso.object_extractor import (
    extract_object_text,
    extract_object_text_from_pdf_bytes,
    first_pdf_url,
)

# A minimal BOCG-shaped fixture. Newlines mirror what pypdf produces for
# the real "Proposición de Ley de reforma de la Ley Orgánica 6/1985".
_FIXTURE_EXPOSICION = """\
CONGRESO DE LOS DIPUTADOS
XV LEGISLATURA
Serie B Núm. 1-1 8 de septiembre de 2023 Pág. 1
BOLETÍN OFICIAL DE LAS CORTES GENERALES
PROPOSICIÓN DE LEY DE REFORMA DE LA LEY ORGÁNICA 6/1985
Exposición de motivos
Las reglas de atribución competencial de la jurisdicción penal española
se encuentran contenidas en el artículo 23 de la Ley Orgánica 6/1985, de
1 de julio, del Poder Judicial. Una de estas reglas recoge en nuestro
ordenamiento el principio de jurisdicción universal, que declara la
competencia de un Estado para perseguir y, en caso de ser declarados
culpables, castigar a presuntos delincuentes.

Haciéndose así, en atención a las particulares características de los
delitos sometidos a esa jurisdicción universal, cuya lesividad
trasciende la de las concretas víctimas y alcanza a la comunidad
internacional en su conjunto.
Artículo único.
Los apartados 2 y 4 del artículo 23 de la Ley Orgánica 6/1985 quedan
redactados del siguiente modo:
"""


def test_extract_object_text_finds_exposicion_de_motivos() -> None:
    out = extract_object_text(_FIXTURE_EXPOSICION)
    assert out is not None
    # Starts with the first paragraph of the prose
    assert out.startswith("Las reglas de atribución competencial")
    # Stops before the operative section
    assert "Artículo único" not in out
    assert "redactados del siguiente modo" not in out
    # Paragraph break is preserved
    assert "\n\n" in out


def test_extract_object_text_preserves_two_paragraphs() -> None:
    out = extract_object_text(_FIXTURE_EXPOSICION)
    assert out is not None
    paragraphs = out.split("\n\n")
    assert len(paragraphs) == 2
    assert paragraphs[0].endswith("presuntos delincuentes.")
    assert paragraphs[1].startswith("Haciéndose así")


def test_extract_object_text_strips_bocg_running_header() -> None:
    """The repeating BOCG header across pages must not appear in the output."""
    text = """\
CONGRESO DE LOS DIPUTADOS
XV LEGISLATURA
Serie B Núm. 1-1 8 de septiembre de 2023 Pág. 1
BOLETÍN OFICIAL DE LAS CORTES GENERALES
TÍTULO DEL PROYECTO
Exposición de motivos
Primera línea del cuerpo de la exposición que se extiende lo suficiente
como para superar el mínimo de longitud establecido por el extractor y
quedarse así como salida válida.

BOLETÍN OFICIAL DE LAS CORTES GENERALES
CONGRESO DE LOS DIPUTADOS
Serie B Núm. 1-1 8 de septiembre de 2023 Pág. 2
Continúa la exposición después del salto de página, sin que aparezca
ninguna cabecera repetida en el texto final.
cve: BOCG-15-B-1-1
Artículo primero.
"""
    out = extract_object_text(text)
    assert out is not None
    assert "BOLETÍN OFICIAL" not in out
    assert "CONGRESO DE LOS DIPUTADOS" not in out
    assert "Serie B Núm" not in out
    assert "cve:" not in out
    assert "Continúa la exposición" in out


def test_extract_object_text_matches_preambulo() -> None:
    """Some Proyectos de Ley use ``Preámbulo`` instead of ``Exposición``."""
    text = """\
PROYECTO DE LEY DE PREVENCIÓN DEL DESPERDICIO ALIMENTARIO
Preámbulo
I
Cada año se desperdician en España millones de toneladas de alimentos,
con consecuencias económicas, sociales y ambientales que el legislador
considera necesario abordar mediante una norma de rango legal que
ordene las obligaciones de los agentes implicados a lo largo de toda
la cadena alimentaria, desde el productor primario hasta el consumidor.
Artículo 1. Objeto.
La presente ley tiene por objeto…
"""
    out = extract_object_text(text)
    assert out is not None
    assert out.startswith("I")
    assert "Cada año se desperdician" in out
    assert "Artículo 1" not in out


def test_extract_object_text_returns_none_when_no_heading() -> None:
    out = extract_object_text("This document has no recognisable heading at all.")
    assert out is None


def test_extract_object_text_returns_none_when_section_too_short() -> None:
    text = """\
TÍTULO
Exposición de motivos
Texto demasiado corto.
Artículo único.
"""
    out = extract_object_text(text)
    assert out is None


def test_extract_object_text_truncates_huge_inputs() -> None:
    """Very long preambles get truncated with an ellipsis marker."""
    long_body = "Texto repetido. " * 2000  # ~32 000 chars
    text = f"TÍTULO\nExposición de motivos\n{long_body}\nArtículo único.\n"
    out = extract_object_text(text)
    assert out is not None
    assert len(out) <= 12001  # 12 000 plus the ellipsis
    assert out.endswith("…")


def test_extract_object_text_is_case_insensitive() -> None:
    """Heading capitalisation varies between bills."""
    text = """\
TÍTULO
EXPOSICIÓN DE MOTIVOS
Cuerpo del texto que tiene la longitud mínima necesaria para que el
extractor lo considere prosa válida y no un encabezado vacío seguido
inmediatamente del articulado operativo. Añadimos un par de oraciones
adicionales aquí para asegurar que rebasamos el umbral mínimo de
caracteres que el extractor exige antes de aceptar la sección como
prosa razonable. Esto refleja la longitud típica que vemos en los
preámbulos cortos de la serie 122 del BOCG.
Artículo único.
"""
    out = extract_object_text(text)
    assert out is not None
    assert out.startswith("Cuerpo del texto")


def test_extract_object_text_stops_at_disposicion_when_no_articulo() -> None:
    """Some bills jump straight from preamble to ``Disposición final``."""
    text = """\
TÍTULO
Exposición de motivos
Cuerpo suficientemente largo de la exposición de motivos para superar
el umbral mínimo configurado en el extractor sin problemas. Aporta
contexto y justifica la reforma propuesta. Algunas reformas técnicas
no requieren un articulado extenso, solo una disposición final que
ajusta la entrada en vigor o deroga normas previas, y aquí queremos
verificar que el extractor reconoce esa estructura tan común.
Disposición final única. Entrada en vigor.
La presente Ley entrará en vigor al día siguiente de su publicación.
"""
    out = extract_object_text(text)
    assert out is not None
    assert "Disposición final" not in out
    assert "Cuerpo suficientemente largo" in out


def test_extract_object_text_from_pdf_bytes_returns_none_for_garbage() -> None:
    """Non-PDF bytes must yield None, not propagate a pypdf exception."""
    assert extract_object_text_from_pdf_bytes(b"this is not a pdf") is None


def test_extract_object_text_from_pdf_bytes_returns_none_for_empty() -> None:
    """Empty bytes are a common failure mode on aborted HTTP fetches."""
    assert extract_object_text_from_pdf_bytes(b"") is None


@pytest.mark.parametrize(
    "raw, expected",
    [
        (None, None),
        ("", None),
        ("   \n\n  ", None),
        (
            "https://www.congreso.es/example/BOCG.PDF#page=1",
            "https://www.congreso.es/example/BOCG.PDF",
        ),
        (
            "https://www.congreso.es/a.PDF#page=1 \n https://www.congreso.es/b.PDF#page=1",
            "https://www.congreso.es/a.PDF",
        ),
        (
            # Anchor-less URL still works
            "https://www.congreso.es/plain.pdf",
            "https://www.congreso.es/plain.pdf",
        ),
        (
            # Non-PDF URL is rejected
            "https://www.congreso.es/page.html#page=1",
            None,
        ),
        (
            # Relative URL is rejected (we require absolute)
            "/relative/x.pdf",
            None,
        ),
    ],
)
def test_first_pdf_url(raw: str | None, expected: str | None) -> None:
    assert first_pdf_url(raw) == expected
