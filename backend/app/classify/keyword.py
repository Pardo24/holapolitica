"""Keyword-based fallback classifier for initiative topics.

Until we have an LLM API key wired in (Mistral / Claude / Qwen), we still
want topic charts on the frontend. This classifier matches a curated list
of Spanish keywords against ``Initiative.title_original`` and records the
slug→initiative links with low confidence (``0.5``) so the LLM can later
override them.

Editorial discipline (CLAUDE.md "mirall, no megàfon"):

- The keyword lists are deliberately neutral and descriptive — we list
  policy AREAS, not partisan framings. ``"vivienda"`` and ``"alquiler"``
  for ``habitatge``, never ``"okupación"`` (which would presuppose a
  specific framing of the issue).
- Multiple matches → multiple topic assignments. The frontend handles
  symmetric display of all topics.
- A keyword match is NOT a precise classification. It is a starting point
  for the LLM run. The ``classified_by`` column makes the source visible.

This module exposes the keyword tables for tests and a Classifier
implementation that mimics the LLM provider interface so the
:class:`ClassificationService` can use it without changes.
"""

from __future__ import annotations

import re
import unicodedata

from app.classify.providers import Classifier, ClassifierResult

# Keyword tables, ASCII-folded and lowercased. We match against the input
# after applying the same fold, so ``"vivienda"`` matches ``"Vivienda"`` and
# ``"climatica"`` matches ``"climática"``.
TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "habitatge": (
        "vivienda",
        "viviendas",
        "alquiler",
        "alquileres",
        "hipoteca",
        "hipotecas",
        "vivienda social",
        "vivienda publica",
        "habitacional",
        "rehabilitacion de vivienda",
    ),
    "sanitat": (
        "sanidad",
        "sanitario",
        "sanitaria",
        "salud publica",
        "hospital",
        "hospitales",
        "sistema nacional de salud",
        "atencion primaria",
        "medicamentos",
        "lista de espera",
        "talidomida",
    ),
    "educacio": (
        "educacion",
        "educativa",
        "educativo",
        "universidad",
        "universitario",
        "universidades",
        "escuela",
        "escolar",
        "alumnado",
        "profesorado",
        "becas",
        "fp ",
        "formacion profesional",
    ),
    "drets-laborals": (
        "trabajo",
        "trabajadores",
        "trabajadora",
        "estatuto de los trabajadores",
        "salario",
        "salario minimo",
        "jornada laboral",
        "convenio colectivo",
        "huelga",
        "subsidio",
        "desempleo",
        "paro",
        "seguridad social",
        "pension",
        "pensiones",
        "estatuto basico del empleado",
    ),
    "immigracio": (
        "inmigracion",
        "inmigrante",
        "extranjeria",
        "asilo",
        "refugiado",
        "refugiados",
        "menor extranjero",
        "menores extranjeros",
        "ceuta",
        "melilla",
        "frontera",
        "fronteras",
    ),
    "igualtat": (
        "igualdad",
        "violencia de genero",
        "violencia machista",
        "feminismo",
        "lgtbi",
        "lgbti",
        "lgbt",
        "trans ",
        "paridad",
        "paritaria",
        "brecha salarial",
        "discriminacion",
    ),
    "medi-ambient": (
        "medio ambiente",
        "medioambiental",
        "biodiversidad",
        "emergencia climatica",
        "cambio climatico",
        "contaminacion",
        "residuos",
        "espacios naturales",
        "fauna",
        "flora",
        "litoral",
        "mar menor",
    ),
    "energia": (
        "energia",
        "electrico",
        "electrica",
        "tarifa electrica",
        "renovables",
        "nuclear",
        "gas natural",
        "hidrocarburos",
        "sector electrico",
        "transicion energetica",
    ),
    "transport": (
        "transporte",
        "transportes",
        "movilidad",
        "ferroviario",
        "ferrocarril",
        "carretera",
        "aeropuerto",
        "puertos",
        "aviacion",
        "renfe",
        "adif",
    ),
    "economia": (
        "presupuesto",
        "presupuestos generales",
        "fiscal",
        "fiscalidad",
        "impuesto",
        "irpf",
        "iva ",
        "sociedades",
        "deficit",
        "deuda publica",
        "inflacion",
        "banco",
        "financiero",
        "mercados financieros",
    ),
    "justicia": (
        "poder judicial",
        "judicial",
        "tribunal constitucional",
        "tribunal supremo",
        "ministerio fiscal",
        "fiscalia",
        "ley orgánica del poder judicial",
        "lopj",
        "amnistia",
        "indulto",
        "audiencia nacional",
    ),
    "seguretat": (
        "seguridad ciudadana",
        "guardia civil",
        "policia nacional",
        "fuerzas y cuerpos",
        "antiterrorista",
        "terrorismo",
        "proteccion civil",
        "estado de alarma",
    ),
    "cultura-llengua": (
        "cultura",
        "patrimonio",
        "lengua",
        "lenguas cooficiales",
        "audiovisual",
        "cinematografia",
        "biblioteca",
        "museos",
        "deporte",
        "deportes",
    ),
    "internacional": (
        "union europea",
        "ue ",
        "otan",
        "ucrania",
        "rusia",
        "marruecos",
        "sahara",
        "tratado internacional",
        "comercio internacional",
        "cooperacion al desarrollo",
        "ayuda humanitaria",
    ),
    "institucions": (
        "reforma constitucional",
        "reforma de la constitucion",
        "reglamento del congreso",
        "estatuto de autonomia",
        "comunidades autonomas",
        "diputacion permanente",
        "elecciones",
        "ley electoral",
        "loreg",
    ),
    "memoria": (
        "memoria democratica",
        "memoria historica",
        "victimas del franquismo",
        "exilio",
        "guerra civil",
        "transicion democratica",
        "valle de los caidos",
        "valle de cuelgamuros",
    ),
    "tecnologia-drets": (
        "datos personales",
        "proteccion de datos",
        "intelig",
        "ciberseguridad",
        "telecomunicaciones",
        "internet",
        "digitalizacion",
        "agencia digital",
        "criptoactivo",
    ),
}


def _fold(text: str) -> str:
    """ASCII-fold and lowercase. ``"Política"`` → ``"politica"``."""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def classify_by_keywords(title: str) -> list[ClassifierResult]:
    """Return matched topic slugs with confidence 0.5.

    Confidence is uniform on purpose — we don't have a basis to rank
    keyword matches, and pretending we do would mislead. The LLM run, when
    it lands, will either confirm or override.
    """
    folded = _fold(title)
    # Word-boundary regex per keyword to avoid spurious substring matches
    # ("alud" inside "salud" etc.).
    matches: list[ClassifierResult] = []
    for slug, keywords in TOPIC_KEYWORDS.items():
        for kw in keywords:
            pattern = r"\b" + re.escape(_fold(kw).strip()) + r"\b"
            if re.search(pattern, folded):
                matches.append(ClassifierResult(slug=slug, confidence=0.5))
                break  # one slug, one match — don't double-count
    return matches


class KeywordClassifier(Classifier):
    """Drop-in :class:`Classifier` that runs locally with no API key.

    Async-compatible (the project's `Classifier` interface is async). The
    keyword table only covers the editorial ``'theme'`` knowledge base; for
    the ``'sdg'`` KB we return an empty list (the LLM is the only credible
    SDG classifier — guessing SDGs from a handful of stopword-style
    keywords would be misleading).
    """

    name = "keyword:congreso-es"

    async def classify(
        self,
        *,
        title: str,
        topic_slugs: list[tuple[str, str]],
        kind: str = "theme",
    ) -> list[ClassifierResult]:
        if kind != "theme":
            return []
        allowed = {slug for slug, _desc in topic_slugs}
        return [r for r in classify_by_keywords(title) if r.slug in allowed]
