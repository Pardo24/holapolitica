"""What a bill's text says, and what it changes, read from the text itself.

Many titles say little about what a law does ("Proyecto de Ley por el que
se modifican diversas normas…"), and the plain summary is written from the
title and the short object. This reads the bill as tabled (its BOCG PDF)
and produces two things, in Spanish and Catalan:

1. ``points``: the concrete measures, in plain words, each with the
   article it comes from, so a reader can check it in the PDF.
2. ``tags``: symmetric facts about what the text changes. Always offered
   in pairs, and only set when the text does it explicitly:

       tax_up          / tax_down
       rights_expand   / rights_restrict
       env_strengthen  / env_relax
       public_more     / private_more

   Each tag carries the passage that justifies it ("evidence"). A tag the
   model cannot back with a passage is dropped.

Editorial discipline, as in :mod:`app.services.plain_summary`: describe
what the text does, never whether it is good. No "perjudica", no
"beneficia"; a law can carry both tags of a pair (it raises one tax and
lowers another). The banned-terms guard runs on every point.

The text is the bill AS TABLED. It can change in committee; the page says
so next to the points.
"""

from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass, field
from typing import Any

import pypdf

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.ingest.congreso.object_extractor import _collapse_whitespace, _strip_bocg_chrome
from app.services.plain_summary import _BANNED_TERMS, _fold, _provider_name

log = get_logger(__name__)

CHANGE_TAGS: tuple[str, ...] = (
    "tax_up",
    "tax_down",
    "rights_expand",
    "rights_restrict",
    "env_strengthen",
    "env_relax",
    "public_more",
    "private_more",
)

# ~15k tokens of input: the explanatory statement and the first articles of
# any bill, and the whole of most of them. Longer texts are marked partial.
MAX_CHARS = 60_000
MAX_POINTS = 8

_PROMPT = """\
Eres un analista legislativo NEUTRAL. Recibirás el texto de una iniciativa
legislativa española tal como se presentó en el Congreso (BOCG).

Devuelve SOLO un objeto JSON con esta forma exacta:
{
  "points_es": [{"text": "...", "ref": "Art. 3"}],
  "points_ca": [{"text": "...", "ref": "Art. 3"}],
  "tags": [{"tag": "tax_down", "evidence_es": "...", "evidence_ca": "..."}]
}

POINTS: de 3 a 8 medidas CONCRETAS que el texto establece, en lenguaje
llano, máximo 30 palabras cada una. Qué obliga, permite, prohíbe, crea,
modifica o suprime, y a quién. Cifras, plazos y cuantías si aparecen.
"ref": el artículo o disposición donde está ("Art. 5", "Disp. final 2ª"),
o null si no se ve. Nada de valoraciones ni de intenciones: solo lo que
dice el texto. "points_ca" son LOS MISMOS puntos en catalán, mismo orden.

TAGS: solo los que el texto haga DE FORMA EXPLÍCITA, con una cita o
paráfrasis breve del pasaje que lo demuestra (máx. 25 palabras, con su
artículo). Si dudas, no lo incluyas. Definiciones estrictas:
- tax_up: crea un impuesto o tasa, sube un tipo, o suprime una deducción,
  exención o bonificación existente.
- tax_down: suprime o rebaja un impuesto o tasa, o crea o amplía una
  deducción, exención o bonificación.
- rights_expand: reconoce un derecho o prestación nuevo, o amplía su
  alcance, cuantía o personas beneficiarias.
- rights_restrict: limita, condiciona, reduce o suprime un derecho,
  prestación o libertad existente.
- env_strengthen: impone nuevas obligaciones o límites de protección
  ambiental (emisiones, residuos, espacios protegidos, evaluación).
- env_relax: reduce, aplaza o suprime obligaciones o límites ambientales,
  o permite actividades antes restringidas por motivos ambientales.
- public_more: pasa la gestión o propiedad de un servicio o bien al sector
  público, crea un organismo o servicio público, o limita su gestión
  privada.
- private_more: permite o amplía la gestión privada, la externalización,
  las concesiones o la venta de bienes o servicios públicos.
Una ley puede tener las dos etiquetas de un par si hace ambas cosas.
Si el texto no es legible o no contiene medidas, devuelve listas vacías.
"""

# Second pass: a stricter reader checks each tag against its passage. The
# first pass alone mislabelled about one tag in three on a sample (an
# obligation on banks read as "more private management", municipal
# autonomy read as "expands rights"); a tag shown as a fact needs better.
_VERIFY_PROMPT = """Eres un verificador ESTRICTO. Recibirás el título de una ley y unas
etiquetas, cada una con el pasaje que la justifica. Conserva SOLO las que
cumplen su definición al pie de la letra; ante la duda, descártala.

- tax_up / tax_down: cambia IMPUESTOS, TASAS, DEDUCCIONES, EXENCIONES o
  BONIFICACIONES fiscales. Ayudas o subvenciones directas NO son impuestos.
- rights_expand / rights_restrict: cambia derechos, libertades o
  prestaciones de PERSONAS (ciudadanía, trabajadores, pacientes, alumnos,
  víctimas, condenados…). NO: competencias, autonomía o financiación de
  administraciones; NO: obligaciones o cargas para empresas.
- env_strengthen / env_relax: cambia normas de PROTECCIÓN AMBIENTAL
  (emisiones, residuos, contaminación, espacios o especies protegidas,
  evaluación ambiental). Gestión económica de recursos NO basta.
- public_more / private_more: cambia QUIÉN GESTIONA O POSEE un servicio o
  bien público (paso a gestión pública o privada, externalización,
  concesión, venta o compra de bienes públicos). Imponer obligaciones o
  costes a empresas privadas NO es private_more.

Devuelve SOLO: {"keep": ["etiqueta", ...]}
"""

_REF_RE = re.compile(r"^[\w\s.ºª°,\-/()]{1,40}$")


@dataclass(frozen=True, slots=True)
class LawTextAnalysis:
    points: dict[str, list[dict[str, str | None]]]
    tags: list[str]
    evidence: dict[str, dict[str, str]]
    source: str  # "full" | "partial"
    provider: str
    raw: str = field(repr=False, default="")


def pdf_url_from_source(source_url: str | None) -> tuple[str, int] | None:
    """The PDF address and first page (1-based) from a BOCG ``source_url``.

    The importer stores links like ``…/BOCG-15-A-12-1.PDF#page=3``; the
    anchor says where this initiative starts inside a shared issue.
    """
    if not source_url:
        return None
    url = source_url.strip()
    base, _, anchor = url.partition("#")
    if not base.lower().endswith(".pdf"):
        return None
    page = 1
    m = re.search(r"page=(\d+)", anchor)
    if m:
        page = max(1, int(m.group(1)))
    return base, page


def extract_pdf_text(pdf_bytes: bytes, first_page: int = 1) -> tuple[str, bool]:
    """Plain text of the bill from ``first_page`` on, and whether it was cut."""
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    chunks: list[str] = []
    total = 0
    truncated = False
    for index, page in enumerate(reader.pages, start=1):
        if index < first_page:
            continue
        text = page.extract_text() or ""
        chunks.append(text)
        total += len(text)
        if total > MAX_CHARS:
            truncated = True
            break
    text = _collapse_whitespace(_strip_bocg_chrome("\n".join(chunks)))
    if len(text) > MAX_CHARS:
        text, truncated = text[:MAX_CHARS], True
    return text, truncated


def _clean_point(item: Any) -> dict[str, str | None] | None:
    if not isinstance(item, dict):
        return None
    text = str(item.get("text") or "").strip()
    if not (8 <= len(text) <= 400):
        return None
    folded = _fold(text)
    if any(_fold(term) in folded for term in _BANNED_TERMS):
        return None
    ref = item.get("ref")
    ref_s = str(ref).strip() if ref not in (None, "", "null") else None
    if ref_s and not _REF_RE.match(ref_s):
        ref_s = None
    # The model often repeats the reference at the end of the sentence
    # ("... custodia. Art. 92 CC"); it is shown on its own beside the point.
    if ref_s and text.rstrip(" .").endswith(ref_s):
        text = text.rstrip(" .")[: -len(ref_s)].rstrip(" .,;(") + "."
    return {"text": text, "ref": ref_s}


def parse_analysis(
    raw: str,
) -> tuple[dict[str, list[dict[str, str | None]]], list[str], dict[str, dict[str, str]]]:
    """Validate the model's JSON. Anything malformed is dropped, not guessed."""
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in model output")
    data = json.loads(raw[start : end + 1])

    points: dict[str, list[dict[str, str | None]]] = {}
    for lang in ("es", "ca"):
        items = data.get(f"points_{lang}") or []
        cleaned = [p for p in (_clean_point(i) for i in items) if p][:MAX_POINTS]
        points[lang] = cleaned
    # A translation that lost or gained points would pair the wrong refs.
    if len(points["ca"]) != len(points["es"]):
        points["ca"] = []

    tags: list[str] = []
    evidence: dict[str, dict[str, str]] = {"es": {}, "ca": {}}
    for item in data.get("tags") or []:
        if not isinstance(item, dict):
            continue
        tag = str(item.get("tag") or "").strip()
        ev_es = str(item.get("evidence_es") or "").strip()
        ev_ca = str(item.get("evidence_ca") or "").strip()
        # No passage, no tag: the reader must be able to check it.
        if tag not in CHANGE_TAGS or tag in tags or len(ev_es) < 8:
            continue
        tags.append(tag)
        evidence["es"][tag] = ev_es[:300]
        evidence["ca"][tag] = (ev_ca or ev_es)[:300]
    return points, tags, evidence


async def analyse_law_text(
    text: str, *, truncated: bool, settings: Settings | None = None
) -> LawTextAnalysis:
    """Ask the model for points and tags over ``text``; validate the answer."""
    settings = settings or get_settings()
    raw = await _call_json(settings, system=_PROMPT, user=text)
    points, tags, evidence = parse_analysis(raw)
    if tags:
        tags = await verify_tags(
            title=text[:300], tags=tags, evidence=evidence["es"], settings=settings
        )
        evidence = {
            lang: {k: v for k, v in ev.items() if k in tags} for lang, ev in evidence.items()
        }
    return LawTextAnalysis(
        points=points,
        tags=tags,
        evidence=evidence,
        source="partial" if truncated else "full",
        provider=_provider_name(settings),
        raw=raw,
    )


async def verify_tags(
    *, title: str, tags: list[str], evidence: dict[str, str], settings: Settings | None = None
) -> list[str]:
    """Keep only the tags a strict second reading confirms. Order kept."""
    settings = settings or get_settings()
    if not tags:
        return []
    user = json.dumps(
        {"titulo": title, "etiquetas": [{"tag": t, "pasaje": evidence.get(t, "")} for t in tags]},
        ensure_ascii=False,
    )
    raw = await _call_json(settings, system=_VERIFY_PROMPT, user=user)
    return parse_verdict(raw, tags)


def parse_verdict(raw: str, tags: list[str]) -> list[str]:
    """The tags the verifier kept, in their original order; none on garbage."""
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return []
    try:
        keep = json.loads(raw[start : end + 1]).get("keep") or []
    except (ValueError, AttributeError):
        return []
    kept = {str(k).strip() for k in keep}
    return [t for t in tags if t in kept]


async def _call_json(settings: Settings, *, system: str, user: str) -> str:
    """One JSON-mode completion. Long input, so a longer timeout than usual."""
    import httpx

    from app.services.llm_http import post_llm

    if settings.llm_provider != "mistral":
        # Other providers have no JSON mode wired here; the plain-text
        # path still returns the object, and parse_analysis finds it.
        from app.services.plain_summary import _call_llm_for_text

        return await _call_llm_for_text(settings, system=system, user=user)
    if not settings.mistral_api_key:
        raise RuntimeError("MISTRAL_API_KEY is not configured")
    body = {
        "model": settings.mistral_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "max_tokens": 3000,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.mistral_api_key}",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, read=180.0)) as client:
        r = await post_llm(
            client,
            "https://api.mistral.ai/v1/chat/completions",
            json_body=body,
            headers=headers,
            min_interval_s=settings.llm_min_interval_s,
        )
    return str(r.json()["choices"][0]["message"]["content"])
