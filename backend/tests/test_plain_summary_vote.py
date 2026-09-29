"""The vote-side prompt: a vote is not the law behind it.

Votes were summarised with the law prompt ("explica QUÉ HACE"), so the model
wrote "Modifica la ley…" about a vote that modified nothing: it decided
whether to keep a decree-law alive, or whether to let a bill start its
passage. These tests pin the two things that prompt has to keep doing.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import plain_summary as ps

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record the system prompt each call would send, without calling out."""
    seen: list[str] = []

    async def fake(settings: Any, *, system: str, user: str) -> str:
        seen.append(system)
        return "Convalidació del decret llei que dona ajudes a l'illa de La Palma."

    monkeypatch.setattr(ps, "_call_llm_for_text", fake)
    monkeypatch.setattr(ps, "_provider_name", lambda s: "test")
    return seen


async def test_votes_use_the_vote_prompt(captured: list[str]) -> None:
    await ps.generate_plain_summary(
        title="Convalidación o derogación de Reales Decretos-leyes.",
        body="Real Decreto-ley 23/2026, de 8 de septiembre, por el que se adoptan medidas…",
        lang="ca",
        kind=ps.VOTE_KIND,
    )
    assert "QUÈ ES" in captured[0] and "DECIDIA" in captured[0]
    # Not the law prompt, which tells the model the subject "does" things.
    assert "explicar **QUÈ FA**" not in captured[0]


async def test_the_vote_prompt_forbids_stating_the_outcome(captured: list[str]) -> None:
    """The model never sees the result, and the card shows it already."""
    await ps.generate_plain_summary(
        title="Convalidación o derogación de Reales Decretos-leyes.",
        body="Real Decreto-ley 23/2026…",
        lang="es",
        kind=ps.VOTE_KIND,
    )
    prompt = captured[0]
    assert "NUNCA digas si se aprobó o se rechazó" in prompt


async def test_a_vote_with_only_a_generic_title_still_calls_the_model(
    captured: list[str],
) -> None:
    """Unlike a motion, a vote's epigraph plus its subject is enough.

    The motion path skips the model when there is no text, because a PNL
    title never says what is asked. A vote carries its subject in
    ``description``, which is what gets passed as the body here.
    """
    result = await ps.generate_plain_summary(
        title="Mociones consecuencia de interpelaciones urgentes.",
        body="Moción del Grupo Parlamentario Mixto sobre la política de vivienda…",
        lang="ca",
        kind=ps.VOTE_KIND,
    )
    assert captured, "the model should have been called"
    assert result.text
