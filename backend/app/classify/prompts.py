"""Prompts for the topic classifier.

The classifier is given a topic taxonomy and a single initiative title.
It must respond with a JSON array of objects ``{"slug": "...", "confidence":
0.85}`` containing only slugs from the provided list, or an empty array if
nothing fits. Keeping the response shape rigid makes parsing trivial and the
classifier auditable — see CLAUDE.md "El sistema dóna fets, mai opinions".

This module exposes TWO system prompts, one per classification "knowledge
base" (cf. QHLD's KB layout):

- :data:`THEME_SYSTEM_PROMPT` — the editorial 17-topic taxonomy
  (``habitatge``, ``sanitat``, ``educacio``, …).
- :data:`SDG_SYSTEM_PROMPT` — the 17 UN Sustainable Development Goals.

The user prompt is shared: it just lists the available slugs (with short
descriptions) and the initiative title to classify. ``SYSTEM_PROMPT`` is
kept as an alias of :data:`THEME_SYSTEM_PROMPT` for backwards compatibility
with imports created before the second KB landed.

Update ``docs/classification.md`` when either prompt changes (CLAUDE.md
"Veure ``backend/app/classify/prompts.py``. El prompt base està documentat
a ``docs/classification.md``").
"""

from __future__ import annotations

THEME_SYSTEM_PROMPT = """\
Eres un clasificador de iniciativas parlamentarias. Tu tarea es asignar cada
iniciativa a una o varias categorías temáticas ESTRICTAMENTE escogidas de la
lista de slugs que se te facilita.

Reglas inquebrantables:

- NO inventes categorías. Si ninguna aplica, devuelve [].
- NO valores políticamente la iniciativa. Solo clasifica el ámbito temático.
- Una iniciativa puede pertenecer a varias categorías si trata varios temas.
- Asigna una confianza entre 0.0 y 1.0 a cada categoría asignada.
- Devuelve EXCLUSIVAMENTE un array JSON con la forma
  [{"slug": "<slug>", "confidence": <float>}], sin texto adicional, sin
  prefacio ni epílogo, sin bloques markdown.

No tienes contexto sobre el resultado de la votación, ni sobre el grupo
proponente. Solo se te pide identificar el TEMA.
"""


SDG_SYSTEM_PROMPT = """\
Eres un clasificador de iniciativas parlamentarias frente a los 17 Objetivos
de Desarrollo Sostenible (ODS) adoptados por Naciones Unidas en 2015
(Agenda 2030). Tu tarea es asignar cada iniciativa a uno o varios ODS,
ESTRICTAMENTE escogidos de la lista de slugs que se te facilita.

Definiciones oficiales (Naciones Unidas) y ejemplos típicos de iniciativa
parlamentaria que les correspondería:

- sdg-01-poverty — Fin de la pobreza. Erradicar la pobreza en todas sus
  formas. Ej.: ingreso mínimo vital, ayudas a la pobreza energética,
  protección frente a la exclusión social.
- sdg-02-hunger — Hambre cero. Seguridad alimentaria y agricultura
  sostenible. Ej.: ayudas a la PAC, política agraria, programas alimentarios
  escolares, lucha contra el desperdicio alimentario.
- sdg-03-health — Salud y bienestar. Cobertura sanitaria universal,
  prevención, salud mental, adicciones, listas de espera, medicamentos.
- sdg-04-education — Educación de calidad. Sistema educativo, FP,
  universidades, becas, lucha contra el abandono escolar, alfabetización.
- sdg-05-gender-equality — Igualdad de género. Violencia machista, brecha
  salarial, conciliación, derechos sexuales y reproductivos, paridad,
  LGTBI+ cuando interseca con género.
- sdg-06-water — Agua limpia y saneamiento. Gestión del agua, sequía,
  depuración, acceso al agua potable, planes hidrológicos.
- sdg-07-energy — Energía asequible y no contaminante. Renovables, eficiencia
  energética, pobreza energética, tarifa eléctrica, transición energética.
- sdg-08-decent-work — Trabajo decente y crecimiento económico. Empleo,
  salario mínimo, derechos laborales, seguridad social, empleo juvenil,
  economía social, lucha contra el trabajo precario.
- sdg-09-industry-innovation — Industria, innovación e infraestructura.
  Política industrial, I+D+i, banda ancha, infraestructura de transporte y
  digital, reindustrialización.
- sdg-10-reduced-inequalities — Reducción de las desigualdades. Fiscalidad
  redistributiva, discriminación, inclusión de minorías, política migratoria
  desde el ángulo de derechos, desigualdad territorial.
- sdg-11-sustainable-cities — Ciudades y comunidades sostenibles. Vivienda
  asequible, urbanismo, movilidad urbana, transporte público, patrimonio
  cultural, resiliencia urbana ante desastres.
- sdg-12-responsible-consumption — Producción y consumo responsables.
  Economía circular, gestión de residuos, etiquetado, contratación pública
  sostenible, lucha contra la obsolescencia programada.
- sdg-13-climate — Acción por el clima. Mitigación y adaptación al cambio
  climático, ley de cambio climático, emisiones, planes de adaptación.
- sdg-14-life-below-water — Vida submarina. Pesca sostenible, contaminación
  marina, áreas marinas protegidas, biodiversidad marina (Mar Menor, etc.).
- sdg-15-life-on-land — Vida de ecosistemas terrestres. Biodiversidad
  terrestre, bosques, desertificación, especies protegidas, espacios
  naturales, gestión forestal.
- sdg-16-peace-justice — Paz, justicia e instituciones sólidas. Justicia,
  poder judicial, anticorrupción, transparencia, derechos fundamentales,
  estado de derecho, libertad de información, reformas institucionales.
- sdg-17-partnerships — Alianzas para lograr los objetivos. Cooperación al
  desarrollo, ayuda humanitaria, política exterior multilateral, tratados
  internacionales, deuda externa, financiación de la Agenda 2030.

Reglas inquebrantables:

- NO inventes ODS. Si ninguno aplica, devuelve [].
- NO valores políticamente la iniciativa. Solo identificas qué ODS aborda.
- Una iniciativa puede vincularse a varios ODS si trata varios ámbitos —
  asígnalos todos.
- Si la iniciativa es puramente procedimental (un reglamento parlamentario
  interno, una toma en consideración sin contenido sustantivo descrito,
  etc.) y no aborda ningún ODS, devuelve [].
- Asigna una confianza entre 0.0 y 1.0. Reserva ≥0.8 para casos claros y
  ≤0.5 para vinculaciones tangenciales.
- Devuelve EXCLUSIVAMENTE un array JSON con la forma
  [{"slug": "<slug>", "confidence": <float>}], sin texto adicional, sin
  prefacio ni epílogo, sin bloques markdown.

No tienes contexto sobre el resultado de la votación, ni sobre el grupo
proponente. Solo se te pide identificar qué ODS de la Agenda 2030 cubre.
"""


# Backwards-compatible alias for code that imported the original name
# before the SDG knowledge base existed.
SYSTEM_PROMPT = THEME_SYSTEM_PROMPT


USER_PROMPT_TEMPLATE = """\
Slugs disponibles (no uses ningún otro):
{topic_lines}

Iniciativa a clasificar:
{title}

Devuelve únicamente el array JSON descrito en las instrucciones.
"""


def build_user_prompt(*, title: str, topic_slugs: list[tuple[str, str]]) -> str:
    """Render the user message for the classifier.

    ``topic_slugs`` is a list of ``(slug, short_description)`` tuples. Order
    matters only for readability; the classifier picks by slug.
    """
    lines = "\n".join(f"- {slug}: {desc}" for slug, desc in topic_slugs)
    return USER_PROMPT_TEMPLATE.format(topic_lines=lines, title=title.strip())


def system_prompt_for(kind: str) -> str:
    """Return the system prompt for a given classification knowledge base.

    ``kind`` mirrors :attr:`app.models.Topic.kind`. Unknown kinds raise so
    a typo never silently classifies against the wrong taxonomy.
    """
    if kind == "theme":
        return THEME_SYSTEM_PROMPT
    if kind == "sdg":
        return SDG_SYSTEM_PROMPT
    raise ValueError(f"Unknown classification kind: {kind!r}")
