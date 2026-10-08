"""Does a law's plain summary agree with what its own text says?

The plain title and summary of a bill used to be written from its official
title and preamble (:mod:`app.services.plain_summary`); the measures read
from the bill's text came later (:mod:`app.services.law_text`). Reading the
text showed summaries that state a figure the text does not: initiative 1566
said "fortunes over 3 million" where its articles say 50 million.

This asks a model to compare the two and name each disagreement
with both sides quoted, so a person can check it. A first prompt that only
listed what counts flagged over half the summaries, mostly ones that were
just vaguer than the text; the test is now "can both be true at once?":

- ``contradiction``: the summary or headline says something the measures
  state differently (a figure, threshold, deadline, who is affected, or
  what is done).
- ``unsupported``: the summary states a figure (amount, percentage, date,
  age, deadline) that appears neither in the official title nor in the
  measures.
  The measures are a selection of three to eight, so this one is weaker
  evidence; it is counted apart.

Read-only: it reports, it never rewrites. The rewrite is
``resummarise_from_text`` in :mod:`app.workers.jobs`.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.services.law_text import _call_json

ISSUE_KINDS: tuple[str, ...] = ("contradiction", "unsupported")
MAX_ISSUES = 3

_CHECK_PROMPT = """Eres un verificador ESTRICTO. Recibirás el título oficial de una ley,
el titular y el resumen en lenguaje llano que publicamos sobre ella, y
algunas de las medidas que establece su texto (leídas del propio texto, con
su artículo). Las medidas son una SELECCIÓN: el texto puede decir más.

Busca SOLO errores de hecho del titular o del resumen. Dos tipos:

- "contradiction": el resumen y el texto NO pueden ser verdad a la vez.
  Un número distinto para la MISMA cosa ("más de 3 millones" frente a
  "más de 50 millones"); un colectivo distinto ("todos los conductores"
  frente a "solo los profesionales"); un alcance mayor que el del texto
  ("todos los casos" cuando el texto lo limita a unos); la acción contraria
  (sube / baja, crea / suprime); u otro asunto distinto.
- "unsupported": el resumen da una CIFRA (número, importe, porcentaje,
  fecha, edad, plazo) que no aparece ni en el título ni en las medidas.

Pregúntate siempre: ¿pueden ser verdad las dos cosas a la vez? Si pueden,
NO es un error. En concreto, NO es un error:
- que el resumen sea más vago o general que el texto ("descuentos para
  jóvenes" frente a "90 % para jóvenes de 18 a 30 años");
- que omita condiciones, matices, excepciones, plazos o medidas;
- que lo diga con otras palabras, o con una palabra más llana;
- que hable de algo que no está entre las medidas (son una selección),
  salvo si es una cifra (eso es "unsupported").

Devuelve SOLO un objeto JSON:
{"issues": [{"kind": "contradiction", "summary_says": "...", "text_says": "..."}]}
"summary_says": cita breve del resumen. "text_says": cita breve del texto
sobre LO MISMO, con su artículo, o null si es "unsupported". Máximo 3. Lo
normal es que no haya ninguno: {"issues": []}.
"""


@dataclass(frozen=True, slots=True)
class SummaryIssue:
    kind: str  # one of ISSUE_KINDS
    summary_says: str
    text_says: str | None


@dataclass(frozen=True, slots=True)
class SummaryCheck:
    issues: tuple[SummaryIssue, ...]

    @property
    def verdict(self) -> str:
        """``contradiction`` beats ``unsupported`` beats ``ok``."""
        kinds = {i.kind for i in self.issues}
        for kind in ISSUE_KINDS:
            if kind in kinds:
                return kind
        return "ok"


def build_check_input(
    *,
    title: str,
    plain_title: str | None,
    summary: str,
    points: Sequence[Mapping[str, str | None]],
) -> str:
    """The user message: official title, what we publish, what the text says."""
    measures = []
    for point in points:
        text = (point.get("text") or "").strip()
        if not text:
            continue
        ref = (point.get("ref") or "").strip()
        measures.append(f"{text} ({ref})" if ref else text)
    return json.dumps(
        {
            "titulo_oficial": title,
            "titular": plain_title,
            "resumen": summary,
            "medidas_del_texto": measures,
        },
        ensure_ascii=False,
    )


def _clip(value: object, limit: int = 240) -> str:
    return " ".join(str(value).split())[:limit]


def parse_check(raw: str) -> SummaryCheck | None:
    """The model's verdict, or ``None`` when its answer can't be read.

    Unknown kinds and issues that quote nothing from the summary are
    dropped: a disagreement nobody can point at is not one we can act on.
    A ``contradiction`` with no passage from the text is demoted to
    ``unsupported``, which is what it then amounts to.
    """
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(raw[start : end + 1])
    except ValueError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("issues"), list):
        return None

    issues: list[SummaryIssue] = []
    for item in data["issues"]:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip().lower()
        says = _clip(item.get("summary_says") or "")
        text_says_raw = item.get("text_says")
        text_says = _clip(text_says_raw) if text_says_raw not in (None, "", "null") else None
        if kind not in ISSUE_KINDS or len(says) < 3:
            continue
        if kind == "contradiction" and not text_says:
            kind = "unsupported"
        issues.append(SummaryIssue(kind=kind, summary_says=says, text_says=text_says))
        if len(issues) >= MAX_ISSUES:
            break
    return SummaryCheck(issues=tuple(issues))


async def check_summary(
    *,
    title: str,
    plain_title: str | None,
    summary: str,
    points: Sequence[Mapping[str, str | None]],
    settings: Settings | None = None,
) -> SummaryCheck | None:
    """Compare one summary with its text's measures. ``None`` if unreadable."""
    settings = settings or get_settings()
    user = build_check_input(title=title, plain_title=plain_title, summary=summary, points=points)
    # The large model: the small one, even with the "both true at once?"
    # test, still flagged about half its sample for faithful restatements.
    raw = await _call_json(
        settings, system=_CHECK_PROMPT, user=user, model=settings.law_text_verify_model
    )
    return parse_check(raw)
