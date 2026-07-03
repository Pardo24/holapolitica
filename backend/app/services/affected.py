"""LLM extraction of "who does this initiative directly affect".

Produces short audience tags (``inquilinos``, ``autónomos``,
``familias numerosas``…) for an initiative, in Spanish and Catalan, so
a citizen reads not just WHAT a law does but WHOSE life it touches.

Editorial discipline mirrors :mod:`app.services.plain_summary`:

- Only audiences the text itself names or unambiguously implies — no
  speculation about winners/losers, no framing.
- Output is STRICT JSON validated here; anything else is rejected and
  the initiative keeps ``affected_audiences = {"ca": [], "es": []}``
  (empty ≠ NULL so the batch job doesn't retry forever).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.services.plain_summary import _call_llm_for_text, _provider_name

log = get_logger(__name__)

_PROMPT = """\
Eres un analista que identifica, de forma NEUTRAL, a quién afecta
directamente una iniciativa parlamentaria española.

Recibirás el título oficial (y opcionalmente un resumen). Devuelve los
COLECTIVOS directamente afectados por lo que la iniciativa regula.

REGLAS:
- Máximo 4 colectivos. Cada uno de 1 a 3 palabras, en minúsculas.
- Solo colectivos que el texto nombra o implica de forma inequívoca
  (p. ej. una ley de alquileres → "inquilinos", "propietarios").
- Nada de juicios: no digas beneficiados/perjudicados, solo afectados.
- "ciudadanía" solo si la norma es de alcance verdaderamente general.
- Si no puedes nombrar ningún colectivo concreto, devuelve listas
  vacías.

Devuelve SOLO este JSON, sin nada más:
{"es": ["...", "..."], "ca": ["...", "..."]}

donde "es" son los colectivos en castellano y "ca" LOS MISMOS
colectivos traducidos al catalán, en el mismo orden.
"""

# Tag sanity: short, lowercase-ish strings without sentence punctuation.
_TAG_RE = re.compile(r"^[\w àáèéíïòóúüç·'\-]{2,40}$", re.IGNORECASE)

_MAX_TAGS = 4


@dataclass(frozen=True, slots=True)
class AffectedResult:
    """Validated audiences per locale (empty lists when none found)."""

    audiences: dict[str, list[str]]
    provider: str
    raw: str


def _validate(payload: object) -> dict[str, list[str]] | None:
    """Coerce the model output into ``{"ca": [...], "es": [...]}`` or None."""
    if not isinstance(payload, dict):
        return None
    out: dict[str, list[str]] = {}
    for locale in ("es", "ca"):
        values = payload.get(locale)
        if not isinstance(values, list):
            return None
        tags: list[str] = []
        for v in values[:_MAX_TAGS]:
            if not isinstance(v, str):
                continue
            tag = v.strip().rstrip(".").lower()
            if tag and _TAG_RE.match(tag):
                tags.append(tag)
        out[locale] = tags
    return out


async def extract_affected_audiences(
    *,
    title: str,
    summary: str | None,
    settings: Settings | None = None,
) -> AffectedResult:
    """Run the extraction for one initiative. Never raises on bad output."""
    s = settings or get_settings()
    user = f"TÍTULO OFICIAL:\n{title}"
    if summary:
        user += f"\n\nRESUMEN:\n{summary}"

    raw = await _call_llm_for_text(s, system=_PROMPT, user=user)
    provider = _provider_name(s)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1].strip()
    # Some models wrap the JSON in prose — grab the outermost braces.
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]

    try:
        parsed = _validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValueError):
        parsed = None

    if parsed is None:
        log.warning("affected.parse_reject", raw=raw[:200])
        parsed = {"es": [], "ca": []}

    return AffectedResult(audiences=parsed, provider=provider, raw=raw)
