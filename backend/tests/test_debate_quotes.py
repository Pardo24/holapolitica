"""Debate quotes: finding a speech in the Diario, choosing a passage, the API.

The model is faked: what is tested is what we do with its answer, above all
that nothing but the speech's own text can come out as a quote.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.db.base import Base
from app.ingest.congreso import debate_quotes as dq
from app.ingest.congreso.debate_quotes import (
    Debate,
    Turn,
    clean_pages,
    fit_passage,
    is_literal,
    is_presentable,
    main_turns,
    page_of,
    parse_choice,
    parse_speaker,
    plan_debates,
    speech_of,
    split_sentences,
)
from app.models import Chamber, DebateQuote, Legislature, ParliamentaryGroup, Vote
from app.models import Session as SessionModel
from app.services.debate_quotes import load_debate_quotes

# As pypdf reads DSCD-15-PL-181 (shortened).
PAGE_13 = """DIARIO DE SESIONES DEL CONGRESO DE LOS DIPUTADOS
PLENO Y DIPUTACIÓN PERMANENTE
Núm. 181 28 de abril de 2026 Pág. 13
Muchas gracias.
El señor VICEPRESIDENTE (Rodríguez Gómez de Celis): Gracias. Tiene la palabra la
señora Velarde Gómez.
La señora VELARDE GÓMEZ: Muchas gracias, presidente. Buenas tardes. Señorías, nosotras,
Podemos, vamos a apoyar esta iniciativa porque va en buena
cve: DSCD-15-PL-181
"""
PAGE_14 = """DIARIO DE SESIONES DEL CONGRESO DE LOS DIPUTADOS
PLENO Y DIPUTACIÓN PERMANENTE
Núm. 181 28 de abril de 2026 Pág. 14
dirección y recoge una necesidad que es real. El señor Pérez dijo: no es verdad.
El señor VICEPRESIDENTE (Rodríguez Gómez de Celis): Señoría, tiene que terminar.
La señora VELARDE GÓMEZ: Termino con esto, que es lo importante del debate de hoy.
(Aplausos).
El señor VICEPRESIDENTE (Rodríguez Gómez de Celis): Gracias. Por el Grupo Socialista,
tiene la palabra la señora Cruz-Guzmán.
La señora CRUZ-GUZMÁN GARCÍA: Votaremos en contra.
cve: DSCD-15-PL-181
"""
PAGES = clean_pages([""] * 12 + [PAGE_13, PAGE_14])


def _row(**overrides: Any) -> dict[str, Any]:
    return {
        "ORGANO": "Pleno",
        "TIPOINTERVENCION": "Intervención",
        "CARGOORADOR": "Diputada",
        "NUMEXPEDIENTE": "122/000262/0000",
        "OBJETOINICIATIVA": "Del Grupo Parlamentario Republicano,\npara un consorcio.",
        "SESION": "28/04/2026",
        "FASE": "Toma en consideración",
        "ORADOR": "Velarde Gómez, Martina (GMx)",
        "INICIOINTERVENCION": "16:00",
        "FININTERVENCION": "16:05",
        "ENLACEPDF": "https://www.congreso.es/public_oficiales/L15/CONG/DS/PL/DSCD-15-PL-181.PDF#page=13",
        **overrides,
    }


def _turn(speaker: str, group: str, minutes: int, page: int = 13) -> Turn:
    return Turn(
        speaker=speaker,
        family=speaker.split(" ", 1)[1],
        group_slug=group,
        dscd_ref="DSCD-15-PL-181",
        page=page,
        minutes=minutes,
        phase="Debate",
    )


def test_parse_speaker() -> None:
    assert parse_speaker("Velarde Gómez, Martina (GMx)") == (
        "Martina Velarde Gómez",
        "Velarde Gómez",
        "gp-mixto",
    )
    # The code with brackets of its own.
    assert parse_speaker("Esteban Bravo, Aitor (GV (EAJ-PNV))") == (
        "Aitor Esteban Bravo",
        "Esteban Bravo",
        "gp-vasco-eaj-pnv",
    )
    assert parse_speaker("Urtasun Domènech, Ernest") is None
    assert parse_speaker(None) is None


def test_plan_keeps_the_debate_behind_a_vote_days_later() -> None:
    voted = {"122/000262": {date(2026, 4, 30)}}
    debates = plan_debates([_row()], voted, since=date(2026, 1, 1))
    assert [(d.expediente, d.debate_date) for d in debates] == [("122/000262", date(2026, 4, 28))]
    assert debates[0].title == "Del Grupo Parlamentario Republicano, para un consorcio."
    turn = debates[0].turns[0]
    assert (turn.dscd_ref, turn.page, turn.minutes) == ("DSCD-15-PL-181", 13, 5)


@pytest.mark.parametrize(
    "voted_on",
    [
        date(2026, 4, 27),  # before the debate
        date(2026, 10, 1),  # a later stage of the same bill, months on
    ],
)
def test_plan_skips_a_vote_outside_the_week(voted_on: date) -> None:
    assert plan_debates([_row()], {"122/000262": {voted_on}}, since=date(2026, 1, 1)) == []


@pytest.mark.parametrize(
    "overrides",
    [
        # A minister with their group's code speaks for the Government.
        {"CARGOORADOR": "Presidente del Gobierno", "ORADOR": "Sánchez Pérez-Castejón, Pedro (GS)"},
        {"TIPOINTERVENCION": "Votación"},
        {"ORGANO": "Comisión de Sanidad"},
        {"NUMEXPEDIENTE": "172/000199/0000"},  # no vote on it
        {"ENLACEPDF": "https://www.congreso.es/elsewhere.pdf"},
    ],
)
def test_plan_skips_what_is_not_a_group_speech_on_a_voted_item(overrides: dict[str, str]) -> None:
    voted = {"122/000262": {date(2026, 4, 28)}}
    assert plan_debates([_row(**overrides)], voted, since=date(2026, 1, 1)) == []


def test_one_speech_per_group_but_every_mixed_group_speaker() -> None:
    debate = Debate(
        expediente="122/000262",
        debate_date=date(2026, 4, 28),
        title="x",
        turns=[
            _turn("Ana Primera", "gp-popular", 10),
            _turn("Eva Segunda", "gp-popular", 3),
            _turn("Néstor Rego", "gp-mixto", 3),
            _turn("Martina Velarde", "gp-mixto", 5),
        ],
    )
    assert {t.speaker for t in main_turns(debate)} == {
        "Ana Primera",
        "Néstor Rego",
        "Martina Velarde",
    }


def test_a_tie_keeps_the_earlier_speech() -> None:
    debate = Debate(
        expediente="122/000262",
        debate_date=date(2026, 4, 28),
        title="x",
        turns=[_turn("Ana Primera", "gp-vox", 5, 20), _turn("Ana Primera", "gp-vox", 5, 40)],
    )
    assert main_turns(debate)[0].page == 20


def test_speech_runs_past_the_page_and_the_chair_but_not_the_next_speaker() -> None:
    speech = speech_of(PAGES, 13, "Velarde Gómez")
    assert speech is not None
    text = " ".join(speech.split())
    assert "vamos a apoyar esta iniciativa porque va en buena dirección" in text
    # The running header between the two pages is gone.
    assert "DIARIO DE SESIONES" not in text and "cve:" not in text
    # A sentence with a colon is not a new speaker.
    assert "El señor Pérez dijo: no es verdad." in text
    # Her words after the chair cuts in stay; the chair's and the next speaker's don't.
    assert "Termino con esto" in text
    assert "tiene que terminar" not in text
    assert "Votaremos en contra" not in text


def test_speech_matches_names_across_accents_and_hyphens() -> None:
    assert speech_of(PAGES, 14, "Cruz-Guzman Garcia") is not None


def test_speech_not_found() -> None:
    assert speech_of(PAGES, 13, "Nadie Nadie") is None


def test_split_sentences_keeps_abbreviations_and_collapses_lines() -> None:
    assert split_sentences("Lo dice el art. 15 de la\nConstitución. ¿Y qué? Nada. (Aplausos).") == [
        "Lo dice el art. 15 de la Constitución.",
        "¿Y qué?",
        "Nada.",
        "(Aplausos).",
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('{"frases": [2, 3]}', [2, 3]),
        ('```json\n{"frases": [2]}\n```', [2]),
        ('{"frases": null}', []),
        ("no json at all", []),
        ('{"frases": [99]}', []),  # out of range
        ('{"frases": ["2"]}', []),
        ('{"frases": [2, 5]}', [2]),  # not consecutive: the first run only
        ('{"frases": [1, 2, 3, 4]}', [1, 2, 3]),
    ],
)
def test_parse_choice(raw: str, expected: list[int]) -> None:
    assert parse_choice(raw, 10) == expected


def test_fit_passage_stops_before_too_long_or_a_stage_direction() -> None:
    long_sentence = "Larga " * 90 + "fin."
    assert fit_passage(["Una frase.", long_sentence]) == "Una frase."
    assert fit_passage(["Una frase.", "(Aplausos).", "Otra."]) == "Una frase."
    assert fit_passage(["Una frase.", "Otra."]) == "Una frase. Otra."
    assert fit_passage([]) == ""


def test_literal_tolerates_whitespace_only() -> None:
    speech = "Vamos a apoyar\nesta   iniciativa porque es real."
    assert is_literal("Vamos a apoyar esta iniciativa", speech)
    assert not is_literal("vamos a apoyar esta iniciativa", speech)
    assert not is_literal("Vamos a respaldar esta iniciativa", speech)
    assert not is_literal("", speech)


@pytest.mark.parametrize(
    ("passage", "ok"),
    [
        ("Votaremos a favor porque la norma introduce las medidas necesarias.", True),
        ("¿Quién puede estar en contra de una norma que introduce estas medidas?", True),
        ("Muy corto.", False),
        ("porque la norma introduce las medidas necesarias para el transporte.", False),
        ("Votaremos a favor porque la norma introduce las medidas necesarias y", False),
        ("Votaremos a favor de la norma, señorías. (Aplausos). Y lo haremos convencidos.", False),
        ("Votaremos a favor. " * 40, False),
    ],
)
def test_is_presentable(passage: str, ok: bool) -> None:
    assert is_presentable(passage) is ok


def test_page_of_finds_where_the_passage_starts() -> None:
    assert page_of("Termino con esto, que es lo importante del debate de hoy.", PAGES, 13) == 14
    assert page_of("Algo que no está en ninguna parte del texto.", PAGES, 13) == 13


def _debate() -> Debate:
    return Debate("122/000262", date(2026, 4, 28), "Consorcio", [])


async def test_pick_quote_cuts_the_passage_from_the_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(settings: Settings, *, system: str, user: str) -> str:
        seen["user"] = user
        number = next(
            line.split("]")[0][1:] for line in user.splitlines() if "Termino con esto" in line
        )
        return f'{{"frases": [{number}]}}'

    monkeypatch.setattr(dq, "_call_llm_for_text", fake_llm)
    monkeypatch.setattr(dq, "_MIN_SPEECH_CHARS", 10)
    picked = await dq.pick_quote(
        Settings(), _debate(), _turn("Martina Velarde Gómez", "gp-mixto", 5), PAGES
    )
    assert picked.status == dq.STATUS_OK
    assert picked.quote == "Termino con esto, que es lo importante del debate de hoy."
    assert picked.page == 14
    assert "ASUNTO: Consorcio" in seen["user"]


async def test_pick_quote_when_the_model_declines(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_llm(settings: Settings, *, system: str, user: str) -> str:
        return '{"frases": null}'

    monkeypatch.setattr(dq, "_call_llm_for_text", fake_llm)
    monkeypatch.setattr(dq, "_MIN_SPEECH_CHARS", 10)
    picked = await dq.pick_quote(
        Settings(), _debate(), _turn("Martina Velarde Gómez", "gp-mixto", 5), PAGES
    )
    assert (picked.status, picked.quote) == (dq.STATUS_NO_PASSAGE, None)


async def test_pick_quote_rejects_a_passage_too_short_to_stand_alone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_llm(settings: Settings, *, system: str, user: str) -> str:
        return '{"frases": [1]}'

    monkeypatch.setattr(dq, "_call_llm_for_text", fake_llm)
    monkeypatch.setattr(dq, "_MIN_SPEECH_CHARS", 10)
    picked = await dq.pick_quote(
        Settings(), _debate(), _turn("Martina Velarde Gómez", "gp-mixto", 5), PAGES
    )
    assert (picked.status, picked.quote) == (dq.STATUS_REJECTED, None)


async def test_pick_quote_skips_the_model_for_a_speech_it_cannot_find(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_llm(settings: Settings, *, system: str, user: str) -> str:
        raise AssertionError("no speech, nothing to ask")

    monkeypatch.setattr(dq, "_call_llm_for_text", fake_llm)
    picked = await dq.pick_quote(Settings(), _debate(), _turn("Nadie Nadie", "gp-vox", 5), PAGES)
    assert picked.status == dq.STATUS_NO_SPEECH


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def _seed(session: AsyncSession, voted_on: date) -> tuple[int, int]:
    chamber = Chamber(
        slug="congreso", name_ca="Congrés", name_es="Congreso", name_en="Congress", level="national"
    )
    session.add(chamber)
    await session.flush()
    legislature = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status="current",
    )
    session.add(legislature)
    await session.flush()
    group = ParliamentaryGroup(
        legislature_id=legislature.id,
        slug="gp-mixto",
        name_short="GP Mixto",
        name_long="Grupo Parlamentario Mixto",
    )
    plenary = SessionModel(chamber_id=chamber.id, legislature_id=legislature.id, date=voted_on)
    session.add_all([group, plenary])
    await session.flush()
    vote = Vote(
        session_id=plenary.id,
        title="x",
        voted_at=datetime(voted_on.year, voted_on.month, voted_on.day, tzinfo=UTC),
        result="approved",
    )
    session.add(vote)
    await session.flush()
    return vote.id, group.id


def _quote(group_id: int, debate_date: date, speaker: str, quote: str | None) -> DebateQuote:
    return DebateQuote(
        expediente="122/000262",
        debate_date=debate_date,
        group_id=group_id,
        speaker_name=speaker,
        dscd_ref="DSCD-15-PL-181",
        page=13,
        source_url="https://www.congreso.es/x.PDF#page=13",
        quote=quote,
        status="ok" if quote else "no_passage",
    )


async def test_load_quotes_from_the_debate_behind_the_vote(db_session: AsyncSession) -> None:
    vote_id, group_id = await _seed(db_session, date(2026, 4, 30))
    db_session.add_all(
        [
            _quote(group_id, date(2026, 4, 28), "Martina Velarde Gómez", "Lo que dijo."),
            _quote(group_id, date(2026, 4, 28), "Néstor Rego Candamil", None),
            # The same bill's earlier stage, and a debate after this vote.
            _quote(group_id, date(2025, 11, 4), "Otra Persona", "Lo de entonces."),
            _quote(group_id, date(2026, 5, 12), "Otra Persona", "Lo de después."),
        ]
    )
    await db_session.commit()
    quotes = await load_debate_quotes(db_session, vote_id, "122/000262/0000")
    assert [(q.speaker_name, q.quote) for q in quotes] == [
        ("Martina Velarde Gómez", "Lo que dijo.")
    ]
    assert quotes[0].group_slug == "gp-mixto"
    assert quotes[0].group_short == "GP Mixto"
    assert quotes[0].dscd_ref == "DSCD-15-PL-181"


async def test_load_quotes_keeps_only_the_latest_debate_in_the_window(
    db_session: AsyncSession,
) -> None:
    vote_id, group_id = await _seed(db_session, date(2026, 4, 30))
    db_session.add_all(
        [
            _quote(group_id, date(2026, 4, 28), "Una Persona", "Primer debate."),
            _quote(group_id, date(2026, 4, 29), "Otra Persona", "Segundo debate."),
        ]
    )
    await db_session.commit()
    quotes = await load_debate_quotes(db_session, vote_id, "122/000262")
    assert [q.quote for q in quotes] == ["Segundo debate."]


async def test_load_quotes_without_an_expediente(db_session: AsyncSession) -> None:
    vote_id, _ = await _seed(db_session, date(2026, 4, 30))
    assert await load_debate_quotes(db_session, vote_id, None) == []
    assert await load_debate_quotes(db_session, vote_id, "122/000999") == []
