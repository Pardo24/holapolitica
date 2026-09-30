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

import re
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


# Proposiciones no de ley and mociones change no law and bind no one: they
# ask the Government (or another body) to act, or state the chamber's
# position. The law prompt above ("explica QUÉ HACE", "Modifica la Ley…")
# made the model write "Modifica la Ley del Deporte…" or "Establece la
# obligación del Gobierno…" for them, which is false. These prompts ask for
# what the initiative REQUESTS, taken from its petition ("insta al Gobierno a…").
_PROMPT_ES_MOTION = """\
Eres un redactor que explica iniciativas parlamentarias en lenguaje llano, en CASTELLANO.

Recibirás una proposición no de ley o una moción del Congreso: su título y,
si lo hay, su texto oficial. Estas iniciativas NO cambian ninguna ley ni
obligan a nada: piden al Gobierno (o a otra institución) que haga algo, o
fijan la posición del Congreso.

Tu trabajo es **explicar QUÉ PIDE**, en **2-3 frases**, en castellano simple.

- Empieza con "Pide al Gobierno que…" (o "Pide a…", "Pide que el Congreso…",
  según a quién se dirija).
- Si pide varias cosas, la PRIMERA FRASE tiene que resumir la petición
  entera y sostenerse sola, porque es la que se lee como titular en los
  listados: "Pide al Gobierno un plan estatal de vivienda asequible."
  Nunca abras con un "Pide al Gobierno que:" vacío seguido de la lista.
  Después, si hacen falta, enumera como mucho CUATRO puntos, uno por
  línea, empezando por "1. ", y cada uno en una sola frase corta.
- NUNCA digas que "modifica", "establece", "regula", "obliga" o "aprueba"
  algo: no es una ley.
- Basa el resumen en la petición final ("insta al Gobierno a…"), no en la
  exposición de motivos.

EJEMPLOS de respuestas adecuadas:

- "Pide al Gobierno que elabore un plan nacional para mejorar la calidad
  del aire en espacios cerrados."
- "Pide al Gobierno que amplíe las ayudas a los deportistas de alto nivel
  y que mejore su protección social."

REGLAS:

- Describe QUÉ se pide, no si es bueno o malo.
- Sin valoraciones: evita palabras como "polémica", "controvertida",
  "necesaria", "perjudicial", "criticada", "relevante".
- Sin especular sobre intenciones políticas ni efectos futuros.
- Si no hay información para saber qué se pide, responde con la cadena
  exacta ``[INSUFICIENT]``.

Devuelve SÓLO el resumen en castellano, sin prólogo, sin título, sin
disclaimer. O ``[INSUFICIENT]`` si realmente no se puede.
"""

_PROMPT_CA_MOTION = """\
Ets un redactor que explica iniciatives parlamentàries en llenguatge planer, en CATALÀ.

Rebràs una proposició no de llei o una moció del Congrés: el títol i, si
n'hi ha, el text oficial. Aquestes iniciatives NO canvien cap llei ni
obliguen a res: demanen al Govern (o a una altra institució) que faci
alguna cosa, o fixen la posició del Congrés.

La teva feina és **explicar QUÈ DEMANA**, en **2-3 frases**, en català simple.

- Comença amb "Demana al Govern que…" (o "Demana a…", "Demana que el
  Congrés…", segons a qui s'adreci).
- Si demana diverses coses, la PRIMERA FRASE ha de resumir la petició
  sencera i aguantar-se sola, perquè és la que es llegeix com a titular
  als llistats: "Demana al Govern un pla estatal d'habitatge assequible."
  No obris mai amb un "Demana al Govern que:" buit seguit de la llista.
  Després, si calen, enumera com a màxim QUATRE punts, un per línia,
  començant per "1. ", i cadascun en una sola frase curta.
- MAI no diguis que "modifica", "estableix", "regula", "obliga" o "aprova"
  res: no és una llei.
- Basa el resum en la petició final ("insta el Govern a…"), no en
  l'exposició de motius.

REGLES:

- Descriu QUÈ es demana, no si és bo o dolent.
- Cap valoració: evita paraules com "polèmica", "controvertida",
  "necessària", "perjudicial", "criticada", "rellevant".
- Cap especulació sobre intencions polítiques o efectes futurs.
- Si no hi ha informació per saber què es demana, respon amb la cadena
  exacta ``[INSUFICIENT]``.

Retorna NOMÉS el resum en català, sense pròleg, sense títol, sense
disclaimer. O ``[INSUFICIENT]`` si realment no es pot fer.
"""

_MOTION_PROMPTS_BY_LANG: dict[str, str] = {"ca": _PROMPT_CA_MOTION, "es": _PROMPT_ES_MOTION}


# A VOTE is not a law and not a motion: it is a decision the chamber took on
# a particular day, and most of them are procedural. "Convalidación de Reales
# Decretos-leyes", "Tramitación como Proyecto de Ley", "Toma en
# consideración", "Enmiendas del Senado". Until now these went through the
# law prompt ("explica QUÉ HACE"), which made the model write "Modifica la
# ley…" about a vote that modified nothing: it decided whether to keep a
# decree alive, or whether to let a bill start its passage.
#
# Two rules carry most of the quality here:
#  - name the decision, as a noun phrase, so the headline reads like a
#    headline and not like a sentence about a law;
#  - never state the outcome. The model is given the subject, never the
#    result, and the card already shows "Aprovada" / "Rebutjada" next to
#    this text. A summary that says "se aprueba" is wrong half the time.
_PROMPT_ES_VOTE = """Eres un redactor que explica en lenguaje llano, en CASTELLANO, QUÉ SE
DECIDÍA en una votación del Congreso de los Diputados.

Recibirás el epígrafe de la votación y el asunto concreto que se votaba.

**Manda el asunto, no el epígrafe.** El epígrafe es el título del punto del
orden del día y agrupa varias votaciones distintas: bajo "Convalidación o
derogación de Reales Decretos-leyes" puede votarse la convalidación de un
decreto Y, a continuación, su tramitación como proyecto de ley. Si el
asunto empieza por "Tramitación como Proyecto de Ley…", la decisión es esa,
aunque el epígrafe diga otra cosa.

La mayoría son decisiones de procedimiento. Estas son las más frecuentes y
cómo nombrarlas:

- "Convalidación o derogación de Reales Decretos-leyes" → el Congreso
  decide si mantiene en vigor un decreto que el Gobierno ya aplicó.
  Nómbralo: "Convalidación del decreto ley que…".
- "Tramitación como Proyecto de Ley" → decide si ese decreto, además, se
  abre a enmiendas y sigue como ley. Nómbralo: "Tramitación como proyecto
  de ley del decreto que…".
- "Toma en consideración de Proposiciones de Ley" → decide si una
  propuesta de ley empieza su recorrido. Nómbralo: "Toma en consideración
  de la proposición que…".
- "Mociones consecuencia de interpelación urgente" → el Congreso fija una
  posición y pide algo al Gobierno. Nómbralo: "Moción que pide al Gobierno
  que…".
- Enmiendas, vetos del Senado, dictámenes de comisión, avocaciones:
  nómbralos por lo que son.

FORMATO, 2-3 frases:

1. Una primera frase que NOMBRE LA DECISIÓN y diga de qué va el texto.
2. Una o dos frases más con lo que hace o pide ese texto, SI EL TEXTO LO
   DICE. Si son varias peticiones, la primera frase ya tiene que resumir
   el conjunto y sostenerse sola (es el titular del listado); los puntos,
   como mucho cuatro, van después, uno por línea, empezando por "1. ": las medidas concretas, con las cifras, los plazos y los
   colectivos **que aparezcan literalmente en lo que has recibido**.
   Cuando el texto da el dato, prefiérelo siempre a la abstracción: "300
   millones para los afectados por la DANA" dice algo, "medidas de apoyo
   económico" no dice nada. Cuando el texto NO da el dato, no lo pongas.

REGLAS:

- NO TE INVENTES NADA. Ni una cifra, ni un porcentaje, ni un plazo, ni un
  organismo, ni una medida que no esté en el texto que te dan. No uses lo
  que creas saber sobre el asunto: sólo lo que leas aquí.
- Muchos epígrafes sólo dicen el ASUNTO de una moción ("sobre la política
  educativa del Gobierno") y no dicen QUÉ se pide. En ese caso responde
  exactamente ``[INSUFICIENT]``. Es la respuesta correcta: más vale no
  decir nada que rellenar el hueco con lo que suele pedirse.
- No copies la carga del título. Los grupos titulan sus mociones con
  adjetivos ("la nefasta política de…", "la grave situación de…"); tú
  nombras el asunto en seco: "la política educativa del Gobierno".
- NUNCA digas si se aprobó o se rechazó, ni "se vota si": no lo sabes, y
  el resultado ya se muestra al lado de tu texto.
- Describe QUÉ cambia o QUÉ se pide, no si es bueno o malo.
- Sin valoraciones ("polémica", "necesaria", "criticada", "relevante").
- Sin especular sobre intenciones políticas ni efectos futuros.
- Sin ejemplos hipotéticos que no aparezcan en el texto.
- No copies el lenguaje jurídico: "en aras de la consecución de" es
  "para"; "a los efectos previstos en el artículo" no hace falta.
- Si el texto es tan genérico que no puedes decir NADA concreto, o sólo
  nombra el asunto sin decir qué se pide o qué cambia, responde
  exactamente ``[INSUFICIENT]``.

EJEMPLOS de respuestas adecuadas:

- "Convalidación del decreto ley que da ayudas a la isla de La Palma tras
  la erupción volcánica. Incluye exenciones fiscales para los afectados y
  permite a las comunidades con superávit usarlo en inversiones."
- "Tramitación como proyecto de ley del decreto de medidas para el
  transporte. Abrirlo a enmiendas permite a los grupos cambiar su
  contenido antes de que sea ley definitiva."
- "Moción que pide al Gobierno un plan estatal de vivienda asequible. Pide
  movilizar suelo público, ampliar el parque de alquiler social y publicar
  cada año cuántas viviendas se han entregado."

EJEMPLO de cuándo NO se puede resumir:

- Recibes: "Moción consecuencia de interpelación urgente del Grupo
  Parlamentario X, sobre la nefasta política educativa del Gobierno."
  Eso dice el asunto y nada más: no sabes qué pide la moción. Respondes
  ``[INSUFICIENT]``, no un resumen verosímil.

Devuelve SÓLO el resumen en castellano, sin prólogo y sin disclaimer.
"""

_PROMPT_CA_VOTE = """Ets un redactor que explica en llenguatge planer, en CATALÀ, QUÈ ES
DECIDIA en una votació del Congrés dels Diputats.

Rebràs l'epígraf de la votació i l'assumpte concret que es votava.

**Mana l'assumpte, no l'epígraf.** L'epígraf és el títol del punt de l'ordre
del dia i agrupa votacions diferents: sota "Convalidació o derogació de
Reials Decrets llei" s'hi pot votar la convalidació d'un decret I, tot
seguit, la seva tramitació com a projecte de llei. Si l'assumpte comença per
"Tramitación como Proyecto de Ley…", la decisió és aquesta, encara que
l'epígraf digui una altra cosa.

La majoria són decisions de procediment. Aquestes són les més freqüents i
com anomenar-les:

- "Convalidació o derogació de Reials Decrets llei" → el Congrés decideix
  si manté en vigor un decret que el Govern ja aplica. Anomena-ho:
  "Convalidació del decret llei que…".
- "Tramitació com a Projecte de Llei" → decideix si aquell decret, a més,
  s'obre a esmenes i segueix com a llei. Anomena-ho: "Tramitació com a
  projecte de llei del decret que…".
- "Presa en consideració de Proposicions de Llei" → decideix si una
  proposta de llei comença el seu recorregut. Anomena-ho: "Presa en
  consideració de la proposició que…".
- "Mocions conseqüència d'interpel·lació urgent" → el Congrés fixa una
  posició i demana alguna cosa al Govern. Anomena-ho: "Moció que demana al
  Govern que…".
- Esmenes, vetos del Senat, dictàmens de comissió, avocacions: anomena'ls
  pel que són.

FORMAT, 2-3 frases:

1. Una primera frase que ANOMENI LA DECISIÓ i digui de què va el text.
2. Una o dues frases més amb el que fa o demana aquell text, SI EL TEXT HO
   DIU. Si són diverses peticions, la primera frase ja ha de resumir el
   conjunt i aguantar-se sola (és el titular del llistat); els punts, com
   a màxim quatre, van després, un per línia, començant per "1. ": les mesures concretes, amb les xifres, els terminis i els
   col·lectius **que apareguin literalment al que has rebut**. Quan el
   text dona la dada, tria-la sempre abans que l'abstracció: "300 milions
   per als afectats per la DANA" diu alguna cosa, "mesures de suport
   econòmic" no diu res. Quan el text NO dona la dada, no la posis.

REGLES:

- NO T'INVENTIS RES. Ni una xifra, ni un percentatge, ni un termini, ni un
  organisme, ni una mesura que no sigui al text que reps. No facis servir
  el que et sembli que saps del tema: només el que llegeixis aquí.
- Molts epígrafs només diuen l'ASSUMPTE d'una moció ("sobre la política
  educativa del Govern") i no diuen QUÈ es demana. En aquest cas respon
  exactament ``[INSUFICIENT]``. És la resposta correcta: val més no dir
  res que omplir el buit amb el que se sol demanar.
- No copiïs la càrrega del títol. Els grups titulen les mocions amb
  adjectius ("la nefasta política de…", "la greu situació de…"); tu
  anomena l'assumpte en sec: "la política educativa del Govern".
- MAI diguis si es va aprovar o rebutjar, ni "es vota si": no ho saps, i
  el resultat ja es mostra al costat del teu text.
- Descriu QUÈ canvia o QUÈ es demana, no si és bo o dolent.
- Cap valoració ("polèmica", "necessària", "criticada", "rellevant").
- Cap especulació sobre intencions polítiques ni efectes futurs.
- Cap exemple hipotètic que no aparegui al text.
- No copiïs el llenguatge jurídic: "a l'efecte d'allò previst a l'article"
  no cal.
- Si el text és tan genèric que no pots dir RES concret, o només anomena
  l'assumpte sense dir què es demana o què canvia, respon exactament
  ``[INSUFICIENT]``.

EXEMPLES de respostes adequades:

- "Convalidació del decret llei que dona ajudes a l'illa de La Palma
  després de l'erupció volcànica. Inclou exempcions fiscals per als
  afectats i permet a les comunitats amb superàvit fer-lo servir en
  inversions."
- "Moció que demana al Govern un pla estatal d'habitatge assequible.
  Demana mobilitzar sòl públic, ampliar el parc de lloguer social i
  publicar cada any quants habitatges s'han lliurat."

EXEMPLE de quan NO es pot resumir:

- Reps: "Moción consecuencia de interpelación urgente del Grupo
  Parlamentario X, sobre la nefasta política educativa del Gobierno."
  Això diu l'assumpte i prou: no saps què demana la moció. Respons
  ``[INSUFICIENT]``, no pas un resum versemblant.

Retorna NOMÉS el resum en català, sense pròleg i sense disclaimer.
"""

_VOTE_PROMPTS_BY_LANG: dict[str, str] = {"ca": _PROMPT_CA_VOTE, "es": _PROMPT_ES_VOTE}

# ``kind`` sentinel used by the vote-side job. Not an initiative type: it
# says "this text is a vote", which is a different object from the law or
# the motion behind it.
VOTE_KIND = "vote"

# Initiative types summarised with the "what it asks" prompts.
_MOTION_KINDS = frozenset({"proposicion_no_ley", "mocion"})

# Backwards-compatible alias for callers / tests that still reference the
# Catalan prompt directly.
SYSTEM_PROMPT = _PROMPT_CA


# Translation prompts. We generate the summary ONCE in the source language
# (Spanish — the language of the Congreso source documents) and translate
# the short result into the other UI language. Translating the 2-3 sentence
# summary reads a tiny input instead of re-reading the full bill text, which
# roughly halves the expensive input-token cost and keeps CA/ES consistent.
# The translation must stay strictly literal so it can't smuggle editorial
# framing past the neutrality guard that already vetted the source summary.
_TRANSLATE_PROMPT_CA = """\
Ets un traductor professional. Tradueix al CATALÀ el resum següent, que \
explica en llenguatge planer què fa una iniciativa parlamentària.

REGLES:
- Traducció LITERAL i fidel: mateix contingut, longitud semblant.
- No afegeixis ni treguis informació. No reescriguis ni interpretis.
- No introdueixis cap valoració que no sigui a l'original.
- Conserva els noms de lleis i institucions de manera natural en català.
- Català normatiu central. Subjuntiu correcte: "comparteixi", "exigeixi", \
"garanteixi", "respecti", "convoqui", "dimiteixi" (mai "compartisci", \
"exigisci", "respeti", "convoqua"). "Dimita" és "dimiteixi", no "dimensioni". \
"Maltrato" és "maltractament".

Retorna NOMÉS la traducció al català, sense pròleg, cometes ni disclaimer.
"""

_TRANSLATE_PROMPT_ES = """\
Eres un traductor profesional. Traduce al CASTELLANO el resumen siguiente, \
que explica en lenguaje llano qué hace una iniciativa parlamentaria.

REGLAS:
- Traducción LITERAL y fiel: mismo contenido, longitud parecida.
- No añadas ni quites información. No reescribas ni interpretes.
- No introduzcas ninguna valoración que no esté en el original.
- Conserva los nombres de leyes e instituciones de forma natural.

Devuelve SÓLO la traducción al castellano, sin prólogo, comillas ni disclaimer.
"""

_TRANSLATE_PROMPTS_BY_LANG: dict[str, str] = {
    "ca": _TRANSLATE_PROMPT_CA,
    "es": _TRANSLATE_PROMPT_ES,
}


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
    # Only the evaluative adjective. The bare stem also matched the nouns
    # "perjuicios"/"perjudicis" (damages) and "en perjudici de", which PNL
    # summaries need when they report what a motion asks ("evaluate the
    # economic damages of the blackout").
    "perjudicial",
    # Only the evaluative ADJECTIVE ("es beneficioso/beneficiosa") — NOT the
    # neutral noun "beneficios" (benefits), which is factual and was wrongly
    # rejecting valid summaries like "derechos y beneficios de las familias".
    "beneficioso",
    "beneficiosa",
    # Framing the initiative itself as "a fight" / "a threat". Matched as
    # the indefinite PHRASE, in both languages: "Una lluita contra la
    # corrupció" editorialises, but "reforça la lluita contra els delictes
    # informàtics" only names an existing policy area. Banning the bare
    # words "lluita"/"amenaç" rejected every Catalan translation of such
    # summaries while the Spanish original ("la lucha contra...") passed.
    "una lluita",
    "una lucha",
    "una amenaça",
    "una amenaza",
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


# **bold** / __bold__, or *italic* around a word or phrase.
_MD_EMPHASIS = re.compile(r"(\*\*|__)(.+?)\1|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])")


def _strip_markdown(text: str) -> str:
    """Drop markdown emphasis and inline code marks from a model's output.

    The site renders summaries as plain text, so ``**violencia vicaria**``
    would show its asterisks literally. Newer models add emphasis even
    when the prompt asks for plain prose.
    """

    def _keep_inner(m: re.Match[str]) -> str:
        return m.group(2) if m.group(2) is not None else m.group(3)

    return _MD_EMPHASIS.sub(_keep_inner, text).replace("`", "")


async def generate_plain_summary(
    *,
    title: str,
    body: str | None,
    lang: str = "ca",
    kind: str | None = None,
    settings: Settings | None = None,
) -> PlainSummaryResult:
    """Ask the configured LLM to produce a plain-language summary.

    ``lang`` selects the output language and the prompt language. We
    currently support ``"ca"`` and ``"es"``; an unknown lang raises.
    ``kind`` is the initiative type: proposiciones no de ley and mociones
    get the "what it asks" prompt, since they change no law.

    Returns a :class:`PlainSummaryResult` with ``text=None`` when the
    model declines (``[INSUFICIENT]``) or when validation rejects its
    output. The raw LLM response is always returned for audit even
    when the validated text is rejected.
    """
    s = settings or get_settings()
    if kind == VOTE_KIND:
        prompts = _VOTE_PROMPTS_BY_LANG
    elif kind in _MOTION_KINDS:
        prompts = _MOTION_PROMPTS_BY_LANG
    else:
        prompts = _PROMPTS_BY_LANG
    prompt = prompts.get(lang)
    if prompt is None:
        raise ValueError(f"Unsupported lang for plain summary: {lang!r}")
    if kind in _MOTION_KINDS and not (body and body.strip()):
        # A PNL / motion title ("... relativa a la vivienda") never says what
        # is asked, and the model fills the gap with a plausible guess. Wait
        # for the BOCG text (motion_texts) instead of calling the model.
        return PlainSummaryResult(text=None, provider=_provider_name(s), raw="")

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
    cleaned = _strip_markdown(cleaned)

    if cleaned.upper().startswith(INSUFFICIENT) or not cleaned:
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    try:
        assert_neutral_summary(cleaned)
    except ValueError as e:
        log.warning("plain_summary.editorial_reject", reason=str(e), raw=raw[:200])
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    return PlainSummaryResult(text=cleaned, provider=provider_name, raw=raw)


# ─── Headline ──────────────────────────────────────────────────────────────
#
# The summary and the headline are different texts. A headline has to stand
# alone on one line of a list; an explanation of a motion that asks for eight
# things wants to enumerate them. One field could not be both, and more than
# half the summaries are lists, so half the cards were headlined "Demana al
# Govern que: 1. Obligui… 2. Simplifiqui…".
#
# The headline is written FROM THE SUMMARY, not from the bill text. That is
# the cheap half (a hundred-odd tokens instead of re-reading 2.700), and it
# makes invention structurally impossible: the model can only compress text
# we already generated and validated.

_TITLE_PROMPT_ES = """Recibes un resumen en lenguaje llano de una iniciativa o una votación del
Congreso. Escribe SU TITULAR: una sola línea de 8 a 16 palabras.

- Tiene que sostenerse sola en un listado y nombrar el asunto: "Ley para
  limitar el alquiler turístico en Baleares", "Plan estatal de vivienda
  asequible y más alquiler social".
- Sólo con lo que diga el resumen. No añadas ni una cifra, ni un organismo,
  ni un matiz que no esté ahí.
- Sin dos puntos al final, sin enumerar, sin comillas, sin punto final.
- No empieces por "El Congreso vota", "Se decide" ni "Propuesta de": ve al
  asunto.
- Nunca digas si se aprobó o se rechazó.
- Sin valoraciones ("polémica", "necesaria", "criticada", "relevante") y sin
  copiar adjetivos de carga ("nefasta", "grave").

Devuelve SÓLO el titular.
"""

_TITLE_PROMPT_CA = """Reps un resum en llenguatge planer d'una iniciativa o una votació del
Congrés. Escriu-ne EL TITULAR: una sola línia de 8 a 16 paraules.

- S'ha d'aguantar sola en un llistat i anomenar l'assumpte: "Llei per
  limitar el lloguer turístic a les Balears", "Pla estatal d'habitatge
  assequible i més lloguer social".
- Només amb el que digui el resum. No hi afegeixis ni una xifra, ni un
  organisme, ni un matís que no hi sigui.
- Sense dos punts al final, sense enumerar, sense cometes, sense punt final.
- No comencis per "El Congrés vota", "Es decideix" ni "Proposta de": ves a
  l'assumpte.
- Mai diguis si es va aprovar o rebutjar.
- Cap valoració ("polèmica", "necessària", "criticada", "rellevant") ni
  adjectius de càrrega copiats ("nefasta", "greu").

Retorna NOMÉS el titular.
"""

_TITLE_PROMPTS_BY_LANG: dict[str, str] = {"ca": _TITLE_PROMPT_CA, "es": _TITLE_PROMPT_ES}

# A headline that runs on is a summary; one that is three words is a label.
_TITLE_MIN_CHARS = 25
_TITLE_MAX_CHARS = 140


async def generate_plain_title(
    *,
    summary: str,
    lang: str = "es",
    settings: Settings | None = None,
) -> PlainSummaryResult:
    """One-line headline for an existing plain-language summary.

    Returns ``text=None`` when the model declines, when the neutrality guard
    trips, or when the line comes back too short or too long to be a
    headline; the caller persists NULL and the frontend falls back to
    deriving a headline from the summary itself.
    """
    s = settings or get_settings()
    prompt = _TITLE_PROMPTS_BY_LANG.get(lang)
    if prompt is None:
        raise ValueError(f"Unsupported lang for plain title: {lang!r}")

    raw = await _call_llm_for_text(s, system=prompt, user=summary)
    provider_name = _provider_name(s)

    cleaned = _strip_markdown(raw.strip().strip('"').strip())
    # Models sometimes answer with a label line first ("Titular: …").
    cleaned = re.sub(r"^(titular|título|títol)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.splitlines()[0].strip().rstrip(".").strip() if cleaned else ""

    if not cleaned or cleaned.upper().startswith(INSUFFICIENT):
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)
    if not (_TITLE_MIN_CHARS <= len(cleaned) <= _TITLE_MAX_CHARS):
        log.warning("plain_title.length_reject", length=len(cleaned), raw=raw[:200])
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    try:
        assert_neutral_summary(cleaned)
    except ValueError as e:
        log.warning("plain_title.editorial_reject", reason=str(e), raw=raw[:200])
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    return PlainSummaryResult(text=cleaned, provider=provider_name, raw=raw)


async def translate_summary(
    *,
    text: str,
    target_lang: str,
    settings: Settings | None = None,
) -> PlainSummaryResult:
    """Translate an existing plain-language summary into ``target_lang``.

    Cheap counterpart to :func:`generate_plain_summary`: instead of
    re-reading the full bill text, it translates the short summary we
    already produced in the source language. The neutrality guard runs
    again on the output as defence-in-depth — a faithful translation of
    a clean summary can't introduce banned terms, but we verify anyway.

    Returns ``text=None`` when the model declines or the output trips the
    neutrality filter, so the caller persists ``NULL`` and retries later.
    """
    s = settings or get_settings()
    prompt = _TRANSLATE_PROMPTS_BY_LANG.get(target_lang)
    if prompt is None:
        raise ValueError(f"Unsupported target lang for translation: {target_lang!r}")

    raw = await _call_llm_for_text(s, system=prompt, user=text)
    provider_name = _provider_name(s)

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[1].strip()
    cleaned = _strip_markdown(cleaned)

    if not cleaned or cleaned.upper().startswith(INSUFFICIENT):
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    try:
        assert_neutral_summary(cleaned)
    except ValueError as e:
        log.warning("plain_summary.translate_editorial_reject", reason=str(e), raw=raw[:200])
        return PlainSummaryResult(text=None, provider=provider_name, raw=raw)

    return PlainSummaryResult(text=cleaned, provider=provider_name, raw=raw)


# ---------------------------------------------------------------------------


def _provider_name(settings: Settings) -> str:
    if settings.llm_provider == "mistral":
        # The model actually used, for the audit trail and the "Resumen
        # automático por …" caveat (older rows say "llm:mistral-small").
        return f"llm:{settings.mistral_model}"
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

    from app.services.llm_http import post_llm

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
            r = await post_llm(
                client,
                "https://api.anthropic.com/v1/messages",
                json_body=body,
                headers=headers,
                min_interval_s=settings.llm_min_interval_s,
            )
        blocks = r.json()["content"]
        text: str = next(b["text"] for b in blocks if b.get("type") == "text")
        return text

    # OpenAI-compatible (Mistral or Qwen)
    if settings.llm_provider == "mistral":
        base = "https://api.mistral.ai"
        model = settings.mistral_model
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
        r = await post_llm(
            client,
            f"{base}/v1/chat/completions",
            json_body=body,
            headers=headers,
            min_interval_s=settings.llm_min_interval_s,
        )
    return str(r.json()["choices"][0]["message"]["content"])


def _fold(text: str) -> str:
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))
