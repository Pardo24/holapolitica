"""LLM-generated plain-language summary of a parliamentary initiative.

The official text of an initiative reads like a court filing. This
service runs an LLM with a tightly-constrained prompt to produce a
2-3 sentence Catalan summary that a non-lawyer can understand, and
nothing more.

Editorial discipline is enforced TWICE:

1. **Prompt-level**: explicit prohibition of value judgments,
   speculation, examples, and any wording that would frame the
   initiative as good/bad.
2. **Output validation** (:func:`assert_neutral_summary`): a banned-words
   filter that returns ``[INSUFICIENT]`` if the model emits any of the
   banned terms. The caller persists ``NULL`` rather than a tainted
   summary.

This is one of the highest-risk surfaces for editorial drift in the
whole project; the test in ``tests/test_plain_summary.py`` is the
contract. If you change the prompt, run the tests.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.classify.providers import ClassifierError
from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


_PROMPT_CA = """\
Ets un redactor que explica lleis en llenguatge planer, en CATALÀ.

Rebràs el títol oficial d'una iniciativa parlamentària espanyola (i
opcionalment una mica de text). La teva feina és **explicar QUÈ FA** la
iniciativa, **2-3 frases**, en català simple i directe que pugui
entendre algú sense formació jurídica.

EXEMPLES de respostes adequades:

- "Modifica la Llei de l'Impost sobre la Renda per ajustar les
  deduccions de les famílies nombroses. Aplica a partir de l'exercici
  fiscal següent."
- "Reforma l'Estatut dels Treballadors per regular el dret de
  desconnexió digital fora de l'horari laboral. Afecta totes les
  empreses amb assalariats."
- "Modifica el Codi Penal per ampliar la tipificació dels delictes
  d'odi. Inclou nous supòsits relacionats amb l'orientació sexual."

REGLES (importants però normals — pots fer la feina sense problemes):

- Descriu QUÈ canvia, no si és bo o dolent.
- Cap valoració: evita paraules com "polèmica", "controvertida",
  "necessària", "perjudicial", "criticada", "rellevant".
- Cap especulació sobre intencions polítiques o efectes futurs.
- Cap exemple hipotètic que no aparegui al text.
- Si el títol és tan genèric que no es pot dir RES (per exemple, només
  "Proposición no de Ley" sense més), respon amb la cadena exacta
  ``[INSUFICIENT]``. Però per a la majoria d'iniciatives, FES el
  resum — el títol oficial sol contenir prou detall.

Retorna NOMÉS el resum en català, sense pròleg, sense títol, sense
disclaimer. O ``[INSUFICIENT]`` si realment no es pot fer.
"""

_PROMPT_ES = """\
Eres un redactor que explica leyes en lenguaje llano, en CASTELLANO.

Recibirás el título oficial de una iniciativa parlamentaria española (y
opcionalmente algo de texto). Tu trabajo es **explicar QUÉ HACE** la
iniciativa, **2-3 frases**, en castellano simple y directo que pueda
entender alguien sin formación jurídica.

EJEMPLOS de respuestas adecuadas:

- "Modifica la Ley del IRPF para ajustar las deducciones de las
  familias numerosas. Se aplica a partir del siguiente ejercicio
  fiscal."
- "Reforma el Estatuto de los Trabajadores para regular el derecho a
  la desconexión digital fuera del horario laboral. Afecta a todas las
  empresas con asalariados."
- "Modifica el Código Penal para ampliar la tipificación de los
  delitos de odio. Incluye nuevos supuestos relacionados con la
  orientación sexual."

REGLAS (importantes pero normales — puedes hacer el trabajo sin
problemas):

- Describe QUÉ cambia, no si es bueno o malo.
- Sin valoraciones: evita palabras como "polémica", "controvertida",
  "necesaria", "perjudicial", "criticada", "relevante".
- Sin especular sobre intenciones políticas ni efectos futuros.
- Sin ejemplos hipotéticos que no aparezcan en el texto.
- Si el título es tan genérico que no puedes decir NADA (por ejemplo,
  solo "Proposición no de Ley" sin más), responde con la cadena
  exacta ``[INSUFICIENT]``. Pero para la mayoría de iniciativas, HAZ
  el resumen — el título oficial suele contener detalle suficiente.

Devuelve SÓLO el resumen en castellano, sin prólogo, sin título, sin
disclaimer. O ``[INSUFICIENT]`` si realmente no se puede.
"""


_PROMPTS_BY_LANG: dict[str, str] = {"ca": _PROMPT_CA, "es": _PROMPT_ES}

# Backwards-compatible alias for callers / tests that still reference the
# Catalan prompt directly.
SYSTEM_PROMPT = _PROMPT_CA


# Banned terms (lowercased, ASCII-folded) that signal editorial drift.
# Curated to catch the strongest editorial framings without rejecting
# neutral uses ("Defensa Nacional", "memòria històrica", "judici just").
# If any appears in the model's output we reject the whole summary.
_BANNED_TERMS = (
    # Direct editorial framings
    "polemic",  # polèmica/polémico
    "controvert",  # controvertida/o
    "controversi",
    "criticad",
    "destac",  # destacada/o, destacable
    "rellevant",  # in CA only (ES uses "relevante")
    "relevante",
    # Value judgments
    "innecesari",  # innecesaria/o
    "innecessari",
    "perjudic",  # perjudicial, perjudica
    "beneficios",  # beneficiosa
    # Action-framing words used to editorialise
    "lluita",  # "una lluita per..."
    "amenaç",  # "una amenaça per..."
    # Strong ideological adjectives
    "progressist",
    "conservadorame",
)

INSUFFICIENT = "[INSUFICIENT]"


@dataclass(frozen=True, slots=True)
class PlainSummaryResult:
    text: str | None  # None when the model returned [INSUFICIENT] or banned text
    provider: str
    raw: str  # the raw LLM output for audit


def assert_neutral_summary(text: str) -> None:
    """Raise :class:`ValueError` if ``text`` contains any banned editorial term.

    The check is case- and accent-insensitive (NFKD-folded). The banned
    list itself is folded at runtime so authors can write terms naturally
    (with accents / cedillas).
    """
    folded = _fold(text)
    for banned in _BANNED_TERMS:
        if _fold(banned) in folded:
            raise ValueError(f"banned editorial term: {banned!r} in summary")


async def generate_plain_summary(
    *,
    title: str,
    body: str | None,
    lang: str = "ca",
    settings: Settings | None = None,
) -> PlainSummaryResult:
    """Ask the configured LLM to produce a plain-language summary.

    ``lang`` selects the output language and the prompt language. We
    currently support ``"ca"`` and ``"es"``; an unknown lang raises.

    Returns a :class:`PlainSummaryResult` with ``text=None`` when the
    model declines (``[INSUFICIENT]``) or when validation rejects its
    output. The raw LLM response is always returned for audit even
    when the validated text is rejected.
    """
    s = settings or get_settings()
    prompt = _PROMPTS_BY_LANG.get(lang)
    if prompt is None:
        raise ValueError(f"Unsupported lang for plain summary: {lang!r}")

    label_title = "Títol" if lang == "ca" else "Título"
    label_body = "Text oficial" if lang == "ca" else "Texto oficial"
    fallback = "(no body)" if lang == "ca" else "(sin texto adicional)"
    user_prompt = f"{label_title}: {title}\n\n{label_body}:\n{body or fallback}"
    raw = await _call_llm_for_text(s, system=prompt, user=user_prompt)
    provider_name = _provider_name(s)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1].strip()

    if cleaned.upper().startswith(INSUFFICIENT) or not cleaned:
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    try:
        assert_neutral_summary(cleaned)
    except ValueError as e:
        log.warning("plain_summary.editorial_reject", reason=str(e), raw=raw[:200])
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    return PlainSummaryResult(text=cleaned, provider=provider_name, raw=raw)


# ---------------------------------------------------------------------------


def _provider_name(settings: Settings) -> str:
    if settings.llm_provider == "mistral":
        return "llm:mistral-small"
    if settings.llm_provider == "anthropic":
        return "llm:claude-haiku"
    if settings.llm_provider == "local_qwen":
        return "llm:qwen2.5-7b"
    return f"llm:{settings.llm_provider}"


async def _call_llm_for_text(settings: Settings, *, system: str, user: str) -> str:
    """Plain-text completion via the configured provider.

    Mirrors the transport pieces of
    :class:`app.classify.providers._ChatCompletionsClassifier` and
    :class:`AnthropicClassifier`. The classifier abstraction returns
    parsed slugs; we want raw text, so we duplicate the small HTTP bit.
    """
    import httpx

    if settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ClassifierError("ANTHROPIC_API_KEY is not configured")
        body = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 512,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, read=90.0)) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages", json=body, headers=headers
            )
            r.raise_for_status()
        blocks = r.json()["content"]
        text: str = next(b["text"] for b in blocks if b.get("type") == "text")
        return text

    # OpenAI-compatible (Mistral or Qwen)
    if settings.llm_provider == "mistral":
        base = "https://api.mistral.ai"
        model = "mistral-small-latest"
        api_key: str | None = settings.mistral_api_key
    else:  # local_qwen
        base = settings.qwen_base_url
        model = "qwen2.5:7b-instruct"
        api_key = None

    if not api_key and settings.llm_provider == "mistral":
        raise ClassifierError("MISTRAL_API_KEY is not configured")

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, read=90.0)) as client:
        r = await client.post(f"{base}/v1/chat/completions", json=body, headers=headers)
        r.raise_for_status()
    return str(r.json()["choices"][0]["message"]["content"])


def _fold(text: str) -> str:
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))
