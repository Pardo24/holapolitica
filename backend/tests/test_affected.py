"""Tests for the affected-audiences extraction service."""

from __future__ import annotations

import pytest

import app.services.affected as affected_mod
from app.services.affected import _validate, extract_affected_audiences

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_validate_accepts_clean_payload() -> None:
    out = _validate({"es": ["Inquilinos", "propietarios."], "ca": ["llogaters", "propietaris"]})
    assert out == {"es": ["inquilinos", "propietarios"], "ca": ["llogaters", "propietaris"]}


def test_validate_caps_at_four_and_drops_junk() -> None:
    out = _validate(
        {
            "es": ["a" * 60, "autónomos", 42, "pensionistas", "familias", "jóvenes", "extra"],
            "ca": [],
        }
    )
    assert out is not None
    # Slice takes the first 4 RAW slots; the over-long tag and the
    # non-string inside that window are then dropped.
    assert out["es"] == ["autónomos", "pensionistas"]
    assert out["ca"] == []


def test_validate_rejects_wrong_shapes() -> None:
    assert _validate(["inquilinos"]) is None
    assert _validate({"es": "inquilinos", "ca": []}) is None
    assert _validate({"es": []}) is None  # missing "ca"


async def test_extract_parses_fenced_json(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_llm(settings, *, system, user):
        return '```json\n{"es": ["inquilinos"], "ca": ["llogaters"]}\n```'

    monkeypatch.setattr(affected_mod, "_call_llm_for_text", fake_llm)
    monkeypatch.setattr(affected_mod, "_provider_name", lambda s: "test")
    result = await extract_affected_audiences(title="Ley de alquileres", summary=None)
    assert result.audiences == {"es": ["inquilinos"], "ca": ["llogaters"]}


async def test_extract_bad_output_yields_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_llm(settings, *, system, user):
        return "No puedo ayudarte con eso."

    monkeypatch.setattr(affected_mod, "_call_llm_for_text", fake_llm)
    monkeypatch.setattr(affected_mod, "_provider_name", lambda s: "test")
    result = await extract_affected_audiences(title="X", summary=None)
    assert result.audiences == {"es": [], "ca": []}
