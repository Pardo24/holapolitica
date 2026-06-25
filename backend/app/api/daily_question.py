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
from app.models import DailyAnswerCount, Initiative, Vote
from app.models import Session as SessionRow

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
]


class DailyOption(BaseModel):
    text: str


class DailyQuestionOut(BaseModel):
    key: str
    kind: str  # "vote" | "civic"
    prompt: str
    options: list[DailyOption]
    context: str | None = None  # plain-language law text, for vote questions
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
    source_id: int | None = None


async def _vote_pool_ids(session: AsyncSession) -> list[int]:
    rows = (
        await session.execute(
            select(Vote.id)
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .join(Initiative, Initiative.id == Vote.initiative_id)
            .where(Vote.approved_by_assent.is_(False))
            .where(Vote.result.in_(["approved", "rejected"]))
            .where(
                (Initiative.plain_summary_ca.is_not(None))
                | (Initiative.plain_summary_es.is_not(None))
            )
            .order_by(Vote.voted_at.desc())
            .limit(_VOTE_POOL)
        )
    ).all()
    return [r[0] for r in rows]


async def _resolve(key: str, lang: str, session: AsyncSession) -> _Resolved | None:
    if key.startswith("vote:"):
        try:
            vid = int(key.split(":", 1)[1])
        except ValueError:
            return None
        row = (
            await session.execute(
                select(
                    Initiative.plain_summary_ca,
                    Initiative.plain_summary_es,
                    Vote.result,
                    Vote.ayes,
                    Vote.noes,
                )
                .join(Initiative, Initiative.id == Vote.initiative_id)
                .where(Vote.id == vid)
            )
        ).first()
        if row is None:
            return None
        sca, ses, result, ayes, noes = row
        summary = ((ses or sca) if lang == "es" else (sca or ses)) or ""
        approved = (result.value if hasattr(result, "value") else str(result)) == "approved"
        if lang == "es":
            prompt = "¿El Congreso aprobó esta iniciativa?"
            options = ["Sí", "No"]
            verb = "aprobó" if approved else "rechazó"
            explanation = (
                f"El Congreso la {verb}, con {ayes or 0} votos a favor y {noes or 0} en contra."
            )
        else:
            prompt = "El Congrés va aprovar aquesta iniciativa?"
            options = ["Sí", "No"]
            verb = "aprovar" if approved else "rebutjar"
            explanation = (
                f"El Congrés la va {verb}, amb {ayes or 0} vots a favor i {noes or 0} en contra."
            )
        return _Resolved(
            kind="vote",
            prompt=prompt,
            options=options,
            correct_index=0 if approved else 1,
            explanation=explanation,
            context=summary or None,
            source_id=vid,
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
            return f"vote:{ids[day % len(ids)]}"
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
