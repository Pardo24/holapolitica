"""Who a law touches, by everyday situation, and what changes for them.

"I a tu, què t'afecta?": a reader picks their situation (young, renting,
self-employed, pensioner…) and sees the laws with a measure that applies
to them directly, each with one sentence saying what the text establishes
for that situation.

Facts, not verdicts. The sentence says what the text does for that
situation ("Si tienes entre 18 y 30 años, el texto fija descuentos de
hasta el 90 % en…"); it never says whether that is good for the reader,
and nothing here scores the parties for or against anyone. The page shows
how each group voted, which is a fact too. The banned-terms guard of the
plain summaries runs on every sentence.

The input is what the project already knows about the law: its title, the
plain summary and the concrete measures read from its text (see
:mod:`app.services.law_text`). No PDF is read again.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings, get_settings
from app.services.law_text import _call_json
from app.services.plain_summary import _BANNED_TERMS, _fold, _provider_name

# The situations a reader can pick. Order is the order shown.
PROFILES: tuple[str, ...] = (
    "jove",
    "estudiant",
    "assalariat",
    "autonom",
    "empresa",
    "funcionari",
    "aturat",
    "pensionista",
    "llogater",
    "propietari",
    "families",
    "discapacitat",
    "cuidador",
    "migrant",
    "dona",
    "lgtbi",
    "consumidor",
    "rural",
)

MAX_PROFILES = 4

_PROMPT = """\
Eres un analista legislativo NEUTRAL. Recibirás una ley española: su título,
un resumen y las medidas concretas que establece su texto.

Di a qué SITUACIONES de la vida afecta DIRECTAMENTE: solo cuando una medida
concreta del texto se aplica a las personas en esa situación (un derecho,
una obligación, una ayuda, un impuesto, un requisito, un plazo). No vale
"afecta a toda la ciudadanía" ni un efecto indirecto o hipotético. Si no
afecta directamente a ninguna, devuelve una lista vacía.

Situaciones posibles (usa la clave exacta) y CUÁNDO aplican, al pie de la letra:
- jove: la medida usa un criterio de edad joven o se dirige expresamente a jóvenes.
- estudiant: afecta a quien estudia (matrícula, becas, títulos, prácticas, requisitos de estudios).
- assalariat: condiciones de trabajo por cuenta ajena (salario, contrato, jornada, despido, permisos, cotización del trabajador).
- autonom: trabajadores autónomos o profesionales por cuenta propia (cuotas, prestaciones, obligaciones propias).
- empresa: obligaciones, ayudas o impuestos de quien tiene o dirige una empresa.
- funcionari: personal de las administraciones públicas (plazas, retribuciones, jubilación, régimen).
- aturat: personas en paro o buscando empleo (prestaciones, subsidios, formación, contratación).
- pensionista: jubilados y pensionistas (pensiones, jubilación, complementos).
- llogater: quien vive de alquiler (contratos, rentas, desahucios, ayudas al alquiler).
- propietari: SOLO medidas sobre la VIVIENDA de quien es propietario o la alquila a otros (hipoteca de la vivienda, IBI, arrendamiento como arrendador). NO: patrimonio en general, rentas, inversiones ni empresas.
- families: quien tiene hijos o hijas a cargo (crianza, permisos, prestaciones por hijo, custodia, escolarización).
- discapacitat: personas con discapacidad (derechos, accesibilidad, prestaciones).
- cuidador: quien cuida a una persona dependiente (dependencia, permisos de cuidado, prestaciones).
- migrant: personas migrantes o extranjeras (permisos, nacionalidad, asilo, protección).
- dona: SOLO medidas dirigidas ESPECÍFICAMENTE a mujeres (violencia de género, maternidad, igualdad salarial). NO: medidas para todas las personas.
- lgtbi: medidas dirigidas específicamente a personas LGTBI.
- consumidor: derechos de consumidores y usuarios, precios regulados, servicios que contratan.
- rural: medio rural, agricultura, ganadería, pesca, o zonas rurales concretas.

Incluye una situación SOLO si una persona corriente en esa situación diría
"esto va conmigo" al leer la medida. Ante la duda, NO la incluyas: mejor una
o dos situaciones claras que cinco dudosas. Máximo 4. Si la medida solo se
aplica a un territorio concreto, dilo en la frase.

Para cada situación escribe UNA frase (máx. 35 palabras) que empiece por
"Si" y diga qué establece el texto para esa persona, con cifras y plazos si
los hay. Solo hechos del texto. PROHIBIDO valorar: nada de "beneficia",
"perjudica", "mejora", "empeora", "favorece", "a tu favor". En catalán, la
misma frase traducida ("Si ets…", "Si tens…").

Devuelve SOLO este JSON:
{"profiles": [{"key": "jove", "es": "Si…", "ca": "Si…"}]}
"""

# Words that turn a fact into a verdict. On top of the summaries' list.
_EXTRA_BANNED = (
    "benefici",
    "perjudic",
    "favorec",
    "afavore",
    "a tu favor",
    "a favor teu",
    "en tu contra",
    "en contra teva",
    "empeor",
    "empitjor",
)


@dataclass(frozen=True, slots=True)
class ProfileEffects:
    effects: dict[str, dict[str, str]]
    provider: str
    raw: str = field(repr=False, default="")


def _clean_sentence(value: Any) -> str | None:
    text = str(value or "").strip()
    if not (15 <= len(text) <= 320):
        return None
    folded = _fold(text)
    if any(_fold(term) in folded for term in (*_BANNED_TERMS, *_EXTRA_BANNED)):
        return None
    return text


def parse_profiles(raw: str) -> dict[str, dict[str, str]]:
    """Validate the model's JSON: known keys, both languages, no verdicts.

    A profile whose Spanish sentence fails is dropped; a Catalan sentence
    that fails falls back to nothing for that profile rather than to the
    Spanish one, so the page never shows a sentence in the wrong language
    under a Catalan heading. Garbage raises, so the job retries.
    """
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in model output")
    data = json.loads(raw[start : end + 1])
    out: dict[str, dict[str, str]] = {}
    for item in data.get("profiles") or []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if key not in PROFILES or key in out:
            continue
        es = _clean_sentence(item.get("es"))
        ca = _clean_sentence(item.get("ca"))
        if es is None or ca is None:
            continue
        out[key] = {"es": es, "ca": ca}
        if len(out) >= MAX_PROFILES:
            break
    return out


def profile_input(
    *,
    title: str,
    summary: str | None,
    points: list[dict[str, str | None]] | None,
) -> str:
    """What the model reads: title, summary and the measures, plainly."""
    lines = [f"TÍTULO: {title.strip()}"]
    if summary:
        lines.append(f"RESUMEN: {summary.strip()}")
    measures = [str(p.get("text") or "").strip() for p in (points or []) if p.get("text")]
    if measures:
        lines.append("MEDIDAS DEL TEXTO:")
        lines.extend(f"- {m}" for m in measures)
    return "\n".join(lines)


async def analyse_profiles(
    *,
    title: str,
    summary: str | None,
    points: list[dict[str, str | None]] | None,
    settings: Settings | None = None,
) -> ProfileEffects:
    """Ask the model which situations the law touches, and how; validate."""
    settings = settings or get_settings()
    user = profile_input(title=title, summary=summary, points=points)
    raw = await _call_json(settings, system=_PROMPT, user=user, model=settings.law_profiles_model)
    return ProfileEffects(
        effects=parse_profiles(raw),
        provider=_provider_name(settings),
        raw=raw,
    )
