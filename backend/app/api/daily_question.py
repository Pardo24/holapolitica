"""La pregunta del dia — one shared question per day, with community stats.

Each day everyone gets the same question. Some days it's a real, notable vote
from the Congreso (the outcome is real, drawn from our data, with the tally and
plain-language summary as the explanation); other days it's a curated, strictly
neutral civics question. Answers are tallied per option in
:class:`DailyAnswerCount` (counters only, no PII) so the UI can show what share
of people picked each option, and every question reveals a detailed explanation.

The ``key`` fully identifies a question ("vote:<id>" or "civic:<i>"), so the
answer endpoint can resolve and score it without re-deriving "today" — robust
across a midnight rollover.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import DailyAnswerCount, Initiative, ParliamentaryGroup, Vote
from app.models import Session as SessionRow
from app.services.game_pool import not_backwards
from app.services.proposing_group import resolve_proposing_group

router = APIRouter(prefix="/daily-question", tags=["daily-question"])

# How far back the "real vote" pool reaches; today's vote is picked from here.
_VOTE_POOL = 80


def _lang(lang: str | None) -> str:
    return "es" if isinstance(lang, str) and lang.lower().startswith("es") else "ca"


def _day_index(now: datetime) -> int:
    """A monotual day number; its parity alternates vote/civic days."""
    return now.toordinal()


# ── Curated civics bank (detailed explanations). Strictly neutral, verifiable.
class _Civic(BaseModel):
    prompt_ca: str
    prompt_es: str
    options_ca: list[str]
    options_es: list[str]
    correct: int
    exp_ca: str
    exp_es: str


_CIVIC: list[_Civic] = [
    _Civic(
        prompt_ca="En segona votació d'investidura, quina majoria necessita el candidat?",
        prompt_es="En segunda votación de investidura, ¿qué mayoría necesita el candidato?",
        options_ca=["Majoria simple", "Majoria absoluta", "Dos terços", "Unanimitat"],
        options_es=["Mayoría simple", "Mayoría absoluta", "Dos tercios", "Unanimidad"],
        correct=0,
        exp_ca=(
            "A la primera votació cal majoria absoluta (176). Si no s'assoleix, 48 hores "
            "després n'hi ha prou amb majoria simple: més vots a favor que en contra, "
            "comptant les abstencions com el que són, abstencions."
        ),
        exp_es=(
            "En la primera votación hace falta mayoría absoluta (176). Si no se logra, 48 "
            "horas después basta con mayoría simple: más votos a favor que en contra, "
            "contando las abstenciones como lo que son, abstenciones."
        ),
    ),
    _Civic(
        prompt_ca="Què caracteritza una moció de censura a Espanya?",
        prompt_es="¿Qué caracteriza una moción de censura en España?",
        options_ca=[
            "Ha de proposar un candidat alternatiu",
            "Només cal el 10% dels diputats",
            "La decideix el Senat",
            "Es vota en secret",
        ],
        options_es=[
            "Debe proponer un candidato alternativo",
            "Solo hace falta el 10% de los diputados",
            "La decide el Senado",
            "Se vota en secreto",
        ],
        correct=0,
        exp_ca=(
            "És una moció de censura 'constructiva': no n'hi ha prou de tombar el president, "
            "cal proposar alhora un candidat alternatiu que, si la moció prospera, queda "
            "investit. Ho preveu l'article 113 de la Constitució per donar estabilitat."
        ),
        exp_es=(
            "Es una moción de censura 'constructiva': no basta con derribar al presidente, "
            "hay que proponer a la vez un candidato alternativo que, si prospera, queda "
            "investido. Lo prevé el artículo 113 de la Constitución para dar estabilidad."
        ),
    ),
    _Civic(
        prompt_ca="Què és un reial decret llei?",
        prompt_es="¿Qué es un real decreto-ley?",
        options_ca=[
            "Una norma del Govern que el Congrés ha de convalidar",
            "Una llei aprovada pel Senat",
            "Un reglament d'una comunitat autònoma",
            "Una sentència del Tribunal Suprem",
        ],
        options_es=[
            "Una norma del Gobierno que el Congreso debe convalidar",
            "Una ley aprobada por el Senado",
            "Un reglamento de una comunidad autónoma",
            "Una sentencia del Tribunal Supremo",
        ],
        correct=0,
        exp_ca=(
            "El Govern pot dictar reials decrets llei en cas d'urgència, però el Congrés els "
            "ha de convalidar en 30 dies o decauen. Per això sovint veuràs votacions de "
            "'convalidació' de decrets a l'hemicicle."
        ),
        exp_es=(
            "El Gobierno puede dictar reales decretos-leyes por urgencia, pero el Congreso "
            "debe convalidarlos en 30 días o decaen. Por eso a menudo verás votaciones de "
            "'convalidación' de decretos en el hemiciclo."
        ),
    ),
    _Civic(
        prompt_ca="Quants vots formen la majoria absoluta al Congrés?",
        prompt_es="¿Cuántos votos forman la mayoría absoluta en el Congreso?",
        options_ca=["176", "175", "151", "200"],
        options_es=["176", "175", "151", "200"],
        correct=0,
        exp_ca=(
            "El Congrés té 350 diputats, així que la majoria absoluta és la meitat més un: "
            "176. És el llindar per investir en primera votació, aprovar lleis orgàniques o "
            "tombar un decret."
        ),
        exp_es=(
            "El Congreso tiene 350 diputados, así que la mayoría absoluta es la mitad más "
            "uno: 176. Es el umbral para investir en primera votación, aprobar leyes "
            "orgánicas o tumbar un decreto."
        ),
    ),
    _Civic(
        prompt_ca="Si el Senat veta una llei, què passa?",
        prompt_es="Si el Senado veta una ley, ¿qué pasa?",
        options_ca=[
            "El Congrés pot aixecar el veto i aprovar-la",
            "La llei queda anul·lada definitivament",
            "Decideix el Tribunal Constitucional",
            "Es convoquen eleccions",
        ],
        options_es=[
            "El Congreso puede levantar el veto y aprobarla",
            "La ley queda anulada definitivamente",
            "Decide el Tribunal Constitucional",
            "Se convocan elecciones",
        ],
        correct=0,
        exp_ca=(
            "El Senat pot vetar o esmenar, però el Congrés té l'última paraula: pot aixecar "
            "el veto per majoria absoluta, o per majoria simple passats dos mesos. Per això "
            "es diu que el nostre bicameralisme és 'imperfecte'."
        ),
        exp_es=(
            "El Senado puede vetar o enmendar, pero el Congreso tiene la última palabra: "
            "puede levantar el veto por mayoría absoluta, o por mayoría simple pasados dos "
            "meses. Por eso se dice que nuestro bicameralismo es 'imperfecto'."
        ),
    ),
    _Civic(
        prompt_ca="Com es reparteixen els escons a cada circumscripció?",
        prompt_es="¿Cómo se reparten los escaños en cada circunscripción?",
        options_ca=[
            "Amb un sistema proporcional (llei d'Hondt)",
            "El partit més votat s'ho emporta tot",
            "A parts iguals entre partits",
            "Per sorteig",
        ],
        options_es=[
            "Con un sistema proporcional (ley d'Hondt)",
            "El partido más votado se lo lleva todo",
            "A partes iguales entre partidos",
            "Por sorteo",
        ],
        correct=0,
        exp_ca=(
            "S'aplica la regla D'Hondt sobre llistes tancades per província. Com que hi ha "
            "moltes circumscripcions petites, el sistema tendeix a afavorir lleugerament els "
            "partits grans i els que concentren vot al territori."
        ),
        exp_es=(
            "Se aplica la regla D'Hondt sobre listas cerradas por provincia. Como hay muchas "
            "circunscripciones pequeñas, el sistema tiende a favorecer ligeramente a los "
            "partidos grandes y a los que concentran voto en el territorio."
        ),
    ),
    _Civic(
        prompt_ca="Quants estats membres té avui la Unió Europea?",
        prompt_es="¿Cuántos Estados miembros tiene hoy la Unión Europea?",
        options_ca=["27", "28", "25", "30"],
        options_es=["27", "28", "25", "30"],
        correct=0,
        exp_ca=(
            "Són 27 des del 2020, quan el Regne Unit va sortir de la UE (el Brexit). Espanya "
            "en forma part des del 1986. No tots els membres usen l'euro."
        ),
        exp_es=(
            "Son 27 desde 2020, cuando el Reino Unido salió de la UE (el Brexit). España "
            "forma parte desde 1986. No todos los miembros usan el euro."
        ),
    ),
    _Civic(
        prompt_ca="Què és una iniciativa legislativa popular (ILP)?",
        prompt_es="¿Qué es una iniciativa legislativa popular (ILP)?",
        options_ca=[
            "Una proposta de llei avalada per signatures de la ciutadania",
            "Un referèndum vinculant",
            "Una llei que proposa el Rei",
            "Una consulta interna d'un partit",
        ],
        options_es=[
            "Una propuesta de ley avalada por firmas de la ciudadanía",
            "Un referéndum vinculante",
            "Una ley que propone el Rey",
            "Una consulta interna de un partido",
        ],
        correct=0,
        exp_ca=(
            "La ciutadania pot proposar lleis si reuneix 500.000 signatures verificades. El "
            "Congrés debat si la pren en consideració; no és automàtica i hi ha matèries "
            "excloses (com els impostos o la reforma constitucional)."
        ),
        exp_es=(
            "La ciudadanía puede proponer leyes si reúne 500.000 firmas verificadas. El "
            "Congreso debate si la toma en consideración; no es automática y hay materias "
            "excluidas (como los impuestos o la reforma constitucional)."
        ),
    ),
    _Civic(
        prompt_ca="Al Consell de Seguretat de l'ONU, què poden fer els cinc membres permanents?",
        prompt_es="En el Consejo de Seguridad de la ONU, ¿qué pueden hacer los cinco permanentes?",
        options_ca=[
            "Vetar qualsevol resolució",
            "Expulsar estats membres",
            "Nomenar el secretari general sols",
            "Canviar la Carta de l'ONU sols",
        ],
        options_es=[
            "Vetar cualquier resolución",
            "Expulsar a Estados miembros",
            "Nombrar al secretario general solos",
            "Cambiar la Carta de la ONU solos",
        ],
        correct=0,
        exp_ca=(
            "Els cinc permanents (els EUA, Rússia, la Xina, França i el Regne Unit) tenen "
            "dret de veto: un sol vot en contra atura una resolució del Consell de Seguretat, "
            "encara que la resta hi estiguin a favor."
        ),
        exp_es=(
            "Los cinco permanentes (EE. UU., Rusia, China, Francia y el Reino Unido) tienen "
            "derecho de veto: un solo voto en contra detiene una resolución del Consejo de "
            "Seguridad, aunque el resto esté a favor."
        ),
    ),
    _Civic(
        prompt_ca="Qui proposa el candidat a la investidura després d'unes eleccions?",
        prompt_es="¿Quién propone al candidato a la investidura tras unas elecciones?",
        options_ca=[
            "El Rei, després de consultar els grups",
            "El president del Congrés",
            "El partit més votat directament",
            "El Tribunal Constitucional",
        ],
        options_es=[
            "El Rey, tras consultar a los grupos",
            "El presidente del Congreso",
            "El partido más votado directamente",
            "El Tribunal Constitucional",
        ],
        correct=0,
        exp_ca=(
            "El Rei consulta els grups amb representació i proposa un candidat, normalment qui "
            "té més opcions de reunir suports. Després el Congrés el vota: el candidat no és "
            "automàticament el del partit més votat."
        ),
        exp_es=(
            "El Rey consulta a los grupos con representación y propone un candidato, "
            "normalmente quien tiene más opciones de reunir apoyos. Luego el Congreso lo "
            "vota: el candidato no es automáticamente el del partido más votado."
        ),
    ),
    # ── About laws: how they are made, and what makes one count. Laws are
    # what the site is about, so most civic days ask about them.
    _Civic(
        prompt_ca="Quants vots calen al Congrés per aprovar una llei orgànica?",
        prompt_es="¿Cuántos votos hacen falta en el Congreso para aprobar una ley orgánica?",
        options_ca=["176", "Més sís que nos", "210", "233"],
        options_es=["176", "Más síes que noes", "210", "233"],
        correct=0,
        exp_ca=(
            "Les lleis orgàniques (drets fonamentals, règim electoral, estatuts d'autonomia) "
            "necessiten la majoria absoluta: 176 dels 350 diputats, en una votació final sobre "
            "el text sencer. Les lleis ordinàries s'aproven amb més vots a favor que en contra."
        ),
        exp_es=(
            "Las leyes orgánicas (derechos fundamentales, régimen electoral, estatutos de "
            "autonomía) necesitan la mayoría absoluta: 176 de los 350 diputados, en una votación "
            "final sobre el texto entero. Las ordinarias se aprueban con más votos a favor que en contra."
        ),
    ),
    _Civic(
        prompt_ca="Quantes signatures calen perquè la ciutadania proposi una llei al Congrés?",
        prompt_es="¿Cuántas firmas hacen falta para que la ciudadanía proponga una ley al Congreso?",
        options_ca=["50.000", "500.000", "100.000", "1.000.000"],
        options_es=["50.000", "500.000", "100.000", "1.000.000"],
        correct=1,
        exp_ca=(
            "La iniciativa legislativa popular necessita 500.000 signatures (article 87.3 de la "
            "Constitució). No pot tractar d'impostos, de matèries de llei orgànica ni de "
            "relacions internacionals."
        ),
        exp_es=(
            "La iniciativa legislativa popular necesita 500.000 firmas (artículo 87.3 de la "
            "Constitución). No puede tratar de impuestos, de materias de ley orgánica ni de "
            "relaciones internacionales."
        ),
    ),
    _Civic(
        prompt_ca="Un reial decret llei, des de quan té força de llei?",
        prompt_es="Un real decreto-ley, ¿desde cuándo tiene fuerza de ley?",
        options_ca=[
            "Des que es publica al BOE",
            "Des que el convalida el Congrés",
            "Des que el vota el Senat",
            "Un mes després de publicar-se",
        ],
        options_es=[
            "Desde que se publica en el BOE",
            "Desde que lo convalida el Congreso",
            "Desde que lo vota el Senado",
            "Un mes después de publicarse",
        ],
        correct=0,
        exp_ca=(
            "El Govern l'aprova per urgència i s'aplica des que es publica. El Congrés té 30 dies "
            "per convalidar-lo (es queda) o derogar-lo (deixa de valer)."
        ),
        exp_es=(
            "El Gobierno lo aprueba por urgencia y se aplica desde que se publica. El Congreso "
            "tiene 30 días para convalidarlo (se queda) o derogarlo (deja de valer)."
        ),
    ),
    _Civic(
        prompt_ca="Si el Congrés aprova una proposició no de llei, què passa?",
        prompt_es="Si el Congreso aprueba una proposición no de ley, ¿qué pasa?",
        options_ca=[
            "Es converteix en llei",
            "El Govern està obligat a complir-la",
            "És la posició del Congrés, però no obliga el Govern",
            "Passa al Senat",
        ],
        options_es=[
            "Se convierte en ley",
            "El Gobierno está obligado a cumplirla",
            "Es la posición del Congreso, pero no obliga al Gobierno",
            "Pasa al Senado",
        ],
        correct=2,
        exp_ca=(
            "Les PNL demanen coses al Govern o fixen la posició de la cambra, però no canvien "
            "cap llei. Són la votació més freqüent del Ple."
        ),
        exp_es=(
            "Las PNL piden cosas al Gobierno o fijan la posición de la cámara, pero no cambian "
            "ninguna ley. Son la votación más frecuente del Pleno."
        ),
    ),
    _Civic(
        prompt_ca="Què és una esmena?",
        prompt_es="¿Qué es una enmienda?",
        options_ca=[
            "Un canvi que un grup proposa al text d'una llei",
            "La votació final d'una llei",
            "Una sanció a un diputat",
            "Un recurs al Tribunal Constitucional",
        ],
        options_es=[
            "Un cambio que un grupo propone al texto de una ley",
            "La votación final de una ley",
            "Una sanción a un diputado",
            "Un recurso al Tribunal Constitucional",
        ],
        correct=0,
        exp_ca=(
            "Les esmenes es voten una per una abans de la votació final. Que se'n rebutgi una no "
            "vol dir que es rebutgi la llei: la llei es decideix al final, amb el text sencer."
        ),
        exp_es=(
            "Las enmiendas se votan una a una antes de la votación final. Que se rechace una no "
            "significa que se rechace la ley: la ley se decide al final, con el texto entero."
        ),
    ),
    _Civic(
        prompt_ca="Quant temps té el Senat per esmenar o vetar una llei aprovada pel Congrés?",
        prompt_es="¿Cuánto tiempo tiene el Senado para enmendar o vetar una ley aprobada por el Congreso?",
        options_ca=["Dues setmanes", "Dos mesos", "Sis mesos", "Un any"],
        options_es=["Dos semanas", "Dos meses", "Seis meses", "Un año"],
        correct=1,
        exp_ca=(
            "Dos mesos, o vint dies si és urgent. Si la veta o hi fa canvis, el text torna al "
            "Congrés, que té l'última paraula."
        ),
        exp_es=(
            "Dos meses, o veinte días si es urgente. Si la veta o introduce cambios, el texto "
            "vuelve al Congreso, que tiene la última palabra."
        ),
    ),
    _Civic(
        prompt_ca="Si una llei no diu quan entra en vigor, quan ho fa?",
        prompt_es="Si una ley no dice cuándo entra en vigor, ¿cuándo lo hace?",
        options_ca=[
            "L'endemà de publicar-se",
            "Als 20 dies de publicar-se al BOE",
            "Quan l'aprova el Congrés",
            "L'1 de gener següent",
        ],
        options_es=[
            "Al día siguiente de publicarse",
            "A los 20 días de publicarse en el BOE",
            "Cuando la aprueba el Congreso",
            "El 1 de enero siguiente",
        ],
        correct=1,
        exp_ca=(
            "Ho fixa el Codi Civil: vint dies després de la publicació, si la llei no diu una "
            "altra cosa. Moltes lleis fixen la seva pròpia data."
        ),
        exp_es=(
            "Lo fija el Código Civil: veinte días después de la publicación, si la ley no dice "
            "otra cosa. Muchas leyes fijan su propia fecha."
        ),
    ),
    _Civic(
        prompt_ca="Què passa amb les lleis que s'estaven tramitant quan es dissolen les Corts?",
        prompt_es="¿Qué pasa con las leyes que se estaban tramitando cuando se disuelven las Cortes?",
        options_ca=[
            "S'aproven automàticament",
            "La majoria caduquen i s'han de tornar a presentar",
            "Les aprova el Govern per decret",
            "Passen al Senat",
        ],
        options_es=[
            "Se aprueban automáticamente",
            "La mayoría caducan y hay que volver a presentarlas",
            "Las aprueba el Gobierno por decreto",
            "Pasan al Senado",
        ],
        correct=1,
        exp_ca=(
            "Quan es convoquen eleccions, les iniciatives sense acabar decauen. Si algú les vol "
            "tirar endavant, les ha de tornar a presentar a la nova legislatura."
        ),
        exp_es=(
            "Cuando se convocan elecciones, las iniciativas sin terminar decaen. Si alguien "
            "quiere sacarlas adelante, tiene que volver a presentarlas en la nueva legislatura."
        ),
    ),
    _Civic(
        prompt_ca="Qui pot presentar la Llei de Pressupostos Generals de l'Estat?",
        prompt_es="¿Quién puede presentar la Ley de Presupuestos Generales del Estado?",
        options_ca=["Qualsevol grup", "El Govern", "El Senat", "El Banc d'Espanya"],
        options_es=["Cualquier grupo", "El Gobierno", "El Senado", "El Banco de España"],
        correct=1,
        exp_ca=(
            "Només el Govern. Si no s'aproven a temps, es prorroguen els de l'any anterior "
            "fins que n'hi hagi de nous."
        ),
        exp_es=(
            "Solo el Gobierno. Si no se aprueban a tiempo, se prorrogan los del año anterior "
            "hasta que haya unos nuevos."
        ),
    ),
    _Civic(
        prompt_ca="Qui té l'última paraula si una llei sembla contrària a la Constitució?",
        prompt_es="¿Quién tiene la última palabra si una ley parece contraria a la Constitución?",
        options_ca=["El Tribunal Suprem", "El Tribunal Constitucional", "El Senat", "El Rei"],
        options_es=["El Tribunal Supremo", "El Tribunal Constitucional", "El Senado", "El Rey"],
        correct=1,
        exp_ca=(
            "El Tribunal Constitucional pot anul·lar-la. Hi poden recórrer, entre d'altres, el "
            "president del Govern, el Defensor del Poble, 50 diputats o 50 senadors."
        ),
        exp_es=(
            "El Tribunal Constitucional puede anularla. Pueden recurrir, entre otros, el "
            "presidente del Gobierno, el Defensor del Pueblo, 50 diputados o 50 senadores."
        ),
    ),
    _Civic(
        prompt_ca="Per quants vots de diferència es va convalidar la reforma laboral del 2022?",
        prompt_es="¿Por cuántos votos de diferencia se convalidó la reforma laboral de 2022?",
        options_ca=["Per un", "Per deu", "Per cinquanta", "Per unanimitat"],
        options_es=["Por uno", "Por diez", "Por cincuenta", "Por unanimidad"],
        correct=0,
        exp_ca=(
            "175 vots a favor i 174 en contra, el febrer del 2022. Una votació ajustada no fa "
            "la llei menys vigent: n'hi ha prou amb més sís que nos."
        ),
        exp_es=(
            "175 votos a favor y 174 en contra, en febrero de 2022. Una votación ajustada no "
            "hace la ley menos vigente: basta con más síes que noes."
        ),
    ),
    _Civic(
        prompt_ca="Què va establir la Llei del dret a l'habitatge del 2023?",
        prompt_es="¿Qué estableció la Ley por el derecho a la vivienda de 2023?",
        options_ca=[
            "Que es poden contenir els lloguers en zones tensionades",
            "Que es prohibeixen els pisos turístics",
            "Que les hipoteques queden congelades",
            "Que els pisos buits passen a l'Estat",
        ],
        options_es=[
            "Que se pueden contener los alquileres en zonas tensionadas",
            "Que se prohíben los pisos turísticos",
            "Que las hipotecas quedan congeladas",
            "Que los pisos vacíos pasan al Estado",
        ],
        correct=0,
        exp_ca=(
            "Les comunitats autònomes poden declarar zones de mercat tensionat, on es poden "
            "limitar els preus del lloguer. Aplicar-ho depèn de cada comunitat."
        ),
        exp_es=(
            "Las comunidades autónomas pueden declarar zonas de mercado tensionado, donde se "
            "pueden limitar los precios del alquiler. Aplicarlo depende de cada comunidad."
        ),
    ),
]


class DailyOption(BaseModel):
    text: str


class DailyQuestionOut(BaseModel):
    key: str
    kind: str  # "vote" | "civic"
    prompt: str
    options: list[DailyOption]
    context: str | None = None  # plain-language law text, for vote questions
    # The law's short plain title, above the context.
    context_title: str | None = None
    source_id: int | None = None


class DailyAnswerIn(BaseModel):
    key: str
    option: int


class DailyAnswerOut(BaseModel):
    correct_index: int
    explanation: str
    source_id: int | None = None
    counts: list[int]
    total: int


class _Resolved(BaseModel):
    kind: str
    prompt: str
    options: list[str]
    correct_index: int
    explanation: str
    context: str | None = None
    context_title: str | None = None
    source_id: int | None = None


async def _vote_pool_ids(session: AsyncSession) -> list[int]:
    rows = (
        await session.execute(
            select(Vote.id)
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .join(Initiative, Initiative.id == Vote.initiative_id)
            .where(Vote.approved_by_assent.is_(False))
            .where(Vote.result.in_(["approved", "rejected"]))
            # "What did the Congress decide?" must be about the law, not one
            # of its amendments or a totality debate.
            .where(not_backwards(include_taking=False))
            .where(
                (Initiative.plain_summary_ca.is_not(None))
                | (Initiative.plain_summary_es.is_not(None))
            )
            .where(
                (Initiative.plain_title_ca.is_not(None)) | (Initiative.plain_title_es.is_not(None))
            )
            .order_by(Vote.voted_at.desc())
            .limit(_VOTE_POOL)
        )
    ).all()
    return [r[0] for r in rows]


# A vote day asks one of three things about the same real vote, so the
# question changes from day to day: did it pass, who proposed it, how close.
_VOTE_VARIANTS = ("approved", "proposer", "margin")

_MARGIN_BUCKETS = ((0, 10), (10, 50), (50, 150), (150, 10_000))


def _margin_labels(lang: str) -> list[str]:
    if lang == "es":
        return [
            "Por menos de 10 votos",
            "Entre 10 y 49 votos",
            "Entre 50 y 149 votos",
            "Por 150 votos o más",
        ]
    return [
        "Per menys de 10 vots",
        "Entre 10 i 49 vots",
        "Entre 50 i 149 vots",
        "Per 150 vots o més",
    ]


def _short_group(name_short: str) -> str:
    return name_short if name_short == "GP Mixto" else name_short.removeprefix("GP ")


async def _resolve(key: str, lang: str, session: AsyncSession) -> _Resolved | None:
    if key.startswith("vote:"):
        parts = key.split(":")
        try:
            vid = int(parts[1])
        except (IndexError, ValueError):
            return None
        variant = parts[2] if len(parts) > 2 and parts[2] in _VOTE_VARIANTS else "approved"
        row = (
            await session.execute(
                select(
                    Initiative.plain_summary_ca,
                    Initiative.plain_summary_es,
                    Initiative.plain_title_ca,
                    Initiative.plain_title_es,
                    Vote.result,
                    Vote.ayes,
                    Vote.noes,
                    Vote.proposing_group_id,
                    Vote.proposed_by_government,
                    SessionRow.legislature_id,
                    Initiative.submitted_by,
                )
                .join(Initiative, Initiative.id == Vote.initiative_id)
                .join(SessionRow, SessionRow.id == Vote.session_id)
                .where(Vote.id == vid)
            )
        ).first()
        if row is None:
            return None
        sca, ses, tca, tes, result, ayes, noes, gid, by_gov, leg_id, submitted_by = row
        summary = ((ses or sca) if lang == "es" else (sca or ses)) or ""
        title = ((tes or tca) if lang == "es" else (tca or tes)) or None
        ayes, noes = ayes or 0, noes or 0
        approved = (result.value if hasattr(result, "value") else str(result)) == "approved"
        tally = (
            f"{ayes} votos a favor y {noes} en contra"
            if lang == "es"
            else f"{ayes} vots a favor i {noes} en contra"
        )
        base = {
            "kind": "vote",
            "context": summary or None,
            "context_title": title,
            "source_id": vid,
        }

        if variant == "proposer":
            group_rows = list(
                (
                    await session.execute(
                        select(ParliamentaryGroup)
                        .where(ParliamentaryGroup.legislature_id == leg_id)
                        .order_by(ParliamentaryGroup.id)
                    )
                )
                .scalars()
                .all()
            )
            groups = [(g.id, g.name_short) for g in group_rows]
            # A vote on a bill often names no group ("Proposición de Ley…"):
            # the initiative's own "presented by" does.
            if gid is None and not by_gov and submitted_by:
                found = resolve_proposing_group(submitted_by, group_rows)
                if found is not None:
                    gid = found.id
                elif "gobierno" in submitted_by.lower():
                    by_gov = True
        if variant == "proposer" and (gid is not None or by_gov):
            gov = "El Gobierno" if lang == "es" else "El Govern"
            right: str | None
            if by_gov and gid is None:
                right = gov
                others = [_short_group(n) for _i, n in groups]
            else:
                right = next((_short_group(n) for i, n in groups if i == gid), None)
                if right is None:
                    variant = "approved"
                others = [_short_group(n) for i, n in groups if i != gid] + [gov]
            if variant == "proposer" and right is not None:
                pool = [o for o in dict.fromkeys(others) if o != right]
                # Deterministic per vote: the same three distractors for everyone.
                start = vid % max(1, len(pool))
                distractors = (pool[start:] + pool[:start])[:3]
                options = [right, *distractors]
                rot = vid % len(options)
                options = options[rot:] + options[:rot]
                verb = "la propuso" if lang == "es" else "la va proposar"
                return _Resolved(
                    **base,
                    prompt="¿Quién propuso esta iniciativa?"
                    if lang == "es"
                    else "Qui va proposar aquesta iniciativa?",
                    options=options,
                    correct_index=options.index(right),
                    explanation=(
                        f"{right} {verb}. "
                        + (
                            f"El Congreso la {'aprobó' if approved else 'rechazó'}, con {tally}."
                            if lang == "es"
                            else f"El Congrés la va {'aprovar' if approved else 'rebutjar'}, amb {tally}."
                        )
                    ),
                )

        if variant == "margin":
            diff = abs(ayes - noes)
            idx = next(i for i, (lo, hi) in enumerate(_MARGIN_BUCKETS) if lo <= diff < hi)
            if lang == "es":
                exp = f"Terminó con {tally}: {diff} votos de diferencia. Fue {'aprobada' if approved else 'rechazada'}."
            else:
                exp = f"Va acabar amb {tally}: {diff} vots de diferència. Va ser {'aprovada' if approved else 'rebutjada'}."
            return _Resolved(
                **base,
                prompt="¿Por cuántos votos se decidió?"
                if lang == "es"
                else "Per quants vots es va decidir?",
                options=_margin_labels(lang),
                correct_index=idx,
                explanation=exp,
            )

        if lang == "es":
            prompt = "¿El Congreso aprobó esta iniciativa?"
            options = ["Sí", "No"]
            explanation = f"El Congreso la {'aprobó' if approved else 'rechazó'}, con {tally}."
        else:
            prompt = "El Congrés va aprovar aquesta iniciativa?"
            options = ["Sí", "No"]
            explanation = f"El Congrés la va {'aprovar' if approved else 'rebutjar'}, amb {tally}."
        return _Resolved(
            **base,
            prompt=prompt,
            options=options,
            correct_index=0 if approved else 1,
            explanation=explanation,
        )

    if key.startswith("civic:"):
        try:
            i = int(key.split(":", 1)[1])
        except ValueError:
            return None
        if not 0 <= i < len(_CIVIC):
            return None
        c = _CIVIC[i]
        return _Resolved(
            kind="civic",
            prompt=c.prompt_es if lang == "es" else c.prompt_ca,
            options=c.options_es if lang == "es" else c.options_ca,
            correct_index=c.correct,
            explanation=c.exp_es if lang == "es" else c.exp_ca,
        )
    return None


async def _today_key(session: AsyncSession) -> str | None:
    """Pick today's question key: alternate vote/civic days, deterministic."""
    now = datetime.now(UTC)
    day = _day_index(now)
    if day % 2 == 0:
        ids = await _vote_pool_ids(session)
        if ids:
            variant = _VOTE_VARIANTS[(day // 2) % len(_VOTE_VARIANTS)]
            return f"vote:{ids[day % len(ids)]}:{variant}"
        # No votes available — fall back to a civic question.
    if _CIVIC:
        return f"civic:{day % len(_CIVIC)}"
    return None


@router.get("", response_model=DailyQuestionOut | None)
async def get_daily_question(
    lang: str = Query("ca"),
    session: AsyncSession = Depends(get_session),
) -> DailyQuestionOut | None:
    """Today's question (public part only — no answer, no explanation)."""
    lk = _lang(lang)
    key = await _today_key(session)
    if key is None:
        return None
    resolved = await _resolve(key, lk, session)
    if resolved is None:
        return None
    return DailyQuestionOut(
        key=key,
        kind=resolved.kind,
        prompt=resolved.prompt,
        options=[DailyOption(text=t) for t in resolved.options],
        context=resolved.context,
        context_title=resolved.context_title,
        source_id=resolved.source_id,
    )


@router.post("/answer", response_model=DailyAnswerOut)
async def answer_daily_question(
    payload: DailyAnswerIn,
    lang: str = Query("ca"),
    session: AsyncSession = Depends(get_session),
) -> DailyAnswerOut:
    """Record an answer (counter only) and return the result + community tally."""
    lk = _lang(lang)
    resolved = await _resolve(payload.key, lk, session)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Unknown question")
    if not 0 <= payload.option < len(resolved.options):
        raise HTTPException(status_code=422, detail="Invalid option")

    # Increment the counter for this (question, option) — query then upsert,
    # dialect-agnostic so it works on both Postgres (prod) and SQLite (tests).
    existing = (
        await session.execute(
            select(DailyAnswerCount).where(
                DailyAnswerCount.question_key == payload.key,
                DailyAnswerCount.option_index == payload.option,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            DailyAnswerCount(question_key=payload.key, option_index=payload.option, count=1)
        )
    else:
        existing.count += 1
    await session.commit()

    rows = (
        await session.execute(
            select(DailyAnswerCount.option_index, DailyAnswerCount.count).where(
                DailyAnswerCount.question_key == payload.key
            )
        )
    ).all()
    by_opt = {int(idx): int(cnt) for idx, cnt in rows}
    counts = [by_opt.get(i, 0) for i in range(len(resolved.options))]

    return DailyAnswerOut(
        correct_index=resolved.correct_index,
        explanation=resolved.explanation,
        source_id=resolved.source_id,
        counts=counts,
        total=sum(counts),
    )
