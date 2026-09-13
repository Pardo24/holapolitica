"""Tests for the CA/ES plain-summary gap repair step.

Same approach as ``test_vote_plain_summary_bootstrap``: the LLM call
(:func:`app.services.plain_summary.translate_summary`) and
:data:`app.ingest.congreso.bootstrap.AsyncSessionLocal` are monkeypatched,
so no model or Postgres is involved. The step runs four passes in a fixed
order (initiatives→CA, votes→CA, initiatives→ES, votes→ES); each pass
opens one listing session and then one session per candidate row.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pytest

from app.ingest.congreso import bootstrap as bootstrap_mod
from app.services.plain_summary import PlainSummaryResult


@dataclass
class _FakeRow:
    id: int
    plain_summary_ca: str | None = None
    plain_summary_es: str | None = None
    plain_summary_provider: str | None = None
    plain_summary_generated_at: datetime | None = None


@dataclass
class _FakeResult:
    payload: Any

    def scalars(self) -> _FakeResult:
        return self

    def all(self) -> Any:
        return self.payload

    def scalar_one(self) -> Any:
        return self.payload


class _FakeSession:
    def __init__(self, responses: list[Any]) -> None:
        self._responses = list(responses)
        self.committed = False

    async def execute(self, _stmt: Any) -> _FakeResult:
        return _FakeResult(self._responses.pop(0))

    async def commit(self) -> None:
        self.committed = True

    async def __aenter__(self) -> _FakeSession:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None


@dataclass
class _SessionFactory:
    sessions: list[_FakeSession] = field(default_factory=list)
    _idx: int = 0

    def __call__(self) -> _FakeSession:
        s = self.sessions[self._idx]
        self._idx += 1
        return s


@pytest.mark.asyncio
async def test_repair_fills_each_missing_language_from_the_other(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    es_only = _FakeRow(id=7, plain_summary_es="Regula el alquiler.")
    ca_only = _FakeRow(id=9, plain_summary_ca="Regula el lloguer.")

    factory = _SessionFactory(
        sessions=[
            _FakeSession([[7]]),  # initiatives -> ca: listing
            _FakeSession([es_only]),  # initiatives -> ca: row 7
            _FakeSession([[]]),  # votes -> ca: listing (none)
            _FakeSession([[9]]),  # initiatives -> es: listing
            _FakeSession([ca_only]),  # initiatives -> es: row 9
            _FakeSession([[]]),  # votes -> es: listing (none)
        ]
    )
    monkeypatch.setattr(bootstrap_mod, "AsyncSessionLocal", factory)
    monkeypatch.setattr(bootstrap_mod, "_LLM_INTER_CALL_DELAY_S", 0)

    calls: list[tuple[str, str]] = []

    async def fake_translate(*, text: str, target_lang: str) -> PlainSummaryResult:
        calls.append((text, target_lang))
        return PlainSummaryResult(
            text=f"[{target_lang}] {text}", provider="llm:mistral-small", raw=text
        )

    monkeypatch.setattr("app.services.plain_summary.translate_summary", fake_translate)

    result = await bootstrap_mod.repair_summary_language_gaps()

    assert calls == [("Regula el alquiler.", "ca"), ("Regula el lloguer.", "es")]
    assert es_only.plain_summary_ca == "[ca] Regula el alquiler."
    assert es_only.plain_summary_es == "Regula el alquiler."
    assert ca_only.plain_summary_es == "[es] Regula el lloguer."
    assert ca_only.plain_summary_provider == "llm:mistral-small"
    assert ca_only.plain_summary_generated_at is not None
    empty = {"seen": 0, "translated": 0, "insufficient": 0, "errors": 0, "aborted": 0}
    one_done = {"seen": 1, "translated": 1, "insufficient": 0, "errors": 0, "aborted": 0}
    assert result == {
        "initiatives_ca": one_done,
        "votes_ca": empty,
        "initiatives_es": one_done,
        "votes_es": empty,
    }


@pytest.mark.asyncio
async def test_repair_leaves_row_null_when_translation_declined(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    es_only = _FakeRow(id=7, plain_summary_es="Regula el alquiler.")
    factory = _SessionFactory(
        sessions=[
            _FakeSession([[7]]),
            _FakeSession([es_only]),
            _FakeSession([[]]),
            _FakeSession([[]]),
            _FakeSession([[]]),
        ]
    )
    monkeypatch.setattr(bootstrap_mod, "AsyncSessionLocal", factory)
    monkeypatch.setattr(bootstrap_mod, "_LLM_INTER_CALL_DELAY_S", 0)

    async def declined(*, text: str, target_lang: str) -> PlainSummaryResult:
        return PlainSummaryResult(text=None, provider="llm:mistral-small", raw="[INSUFICIENT]")

    monkeypatch.setattr("app.services.plain_summary.translate_summary", declined)

    result = await bootstrap_mod.repair_summary_language_gaps()

    # NULL stays NULL so the next daily run retries it.
    assert es_only.plain_summary_ca is None
    assert result["initiatives_ca"] == {
        "seen": 1,
        "translated": 0,
        "insufficient": 1,
        "errors": 0,
        "aborted": 0,
    }


@pytest.mark.asyncio
async def test_repair_stops_a_pass_when_the_llm_has_no_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.llm_http import LLMUnavailableError

    first = _FakeRow(id=7, plain_summary_es="Regula el alquiler.")
    factory = _SessionFactory(
        sessions=[
            _FakeSession([[7, 8]]),  # initiatives -> ca: two candidates
            _FakeSession([first]),  # row 7 hits the zero quota
            # row 8 is never fetched: the pass stops
            _FakeSession([[]]),
            _FakeSession([[]]),
            _FakeSession([[]]),
        ]
    )
    monkeypatch.setattr(bootstrap_mod, "AsyncSessionLocal", factory)
    monkeypatch.setattr(bootstrap_mod, "_LLM_INTER_CALL_DELAY_S", 0)

    async def no_quota(*, text: str, target_lang: str) -> PlainSummaryResult:
        raise LLMUnavailableError("0 requests/minute")

    monkeypatch.setattr("app.services.plain_summary.translate_summary", no_quota)

    result = await bootstrap_mod.repair_summary_language_gaps()

    assert first.plain_summary_ca is None
    assert result["initiatives_ca"] == {
        "seen": 2,
        "translated": 0,
        "insufficient": 0,
        "errors": 0,
        "aborted": 1,
    }
