"""PNLs and motions are summarised as requests, not as law changes."""

from __future__ import annotations

import pytest

import app.services.plain_summary as ps
from app.models import InitiativeType


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    prompts: list[str] = []

    async def fake_llm(_settings: object, *, system: str, user: str) -> str:
        prompts.append(system)
        return "Pide al Gobierno que elabore un plan."

    monkeypatch.setattr(ps, "_call_llm_for_text", fake_llm)
    return prompts


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", [InitiativeType.PROPOSICION_NO_LEY, "mocion"])
async def test_motions_use_the_what_it_asks_prompt(captured: list[str], kind: str) -> None:
    result = await ps.generate_plain_summary(title="PNL", body="texto", lang="es", kind=kind)
    assert result.text == "Pide al Gobierno que elabore un plan."
    assert "QUÉ PIDE" in captured[0]


@pytest.mark.asyncio
async def test_laws_keep_the_what_it_does_prompt(captured: list[str]) -> None:
    await ps.generate_plain_summary(title="Ley", body="texto", lang="es", kind="proyecto_ley")
    await ps.generate_plain_summary(title="Ley", body="texto", lang="ca")
    assert "QUÉ HACE" in captured[0]
    assert "QUÈ FA" in captured[1]


@pytest.mark.asyncio
async def test_catalan_motion_prompt(captured: list[str]) -> None:
    await ps.generate_plain_summary(title="Moció", body="text", lang="ca", kind="mocion")
    assert "QUÈ DEMANA" in captured[0]
