"""Tests for the vote-side plain-summary bootstrap step.

We don't exercise Mistral or a real Postgres here. Instead we monkeypatch
:func:`app.services.plain_summary.generate_plain_summary` (so the LLM is
never called) and :data:`app.ingest.congreso.bootstrap.AsyncSessionLocal`
(so we control which rows the function sees and can observe the writes).

The behaviours under test are the load-bearing contract of the step:

1. Eligible votes (NULL target column, non-NULL description, length above
   the floor) are passed to the summariser and the resulting text is
   persisted on the right column.
2. Re-running is idempotent — once a row's target column is populated,
   the second run skips it (the candidate query filters it out).
3. The audit metadata (``plain_summary_provider`` and
   ``plain_summary_generated_at``) is stamped on the row when a summary
   lands.

We don't go through the live ``Vote`` SQLAlchemy mapper — instead we use
a stand-in object that exposes the same attributes the function sets, and
fake Result/Session classes that return what the function expects.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pytest

from app.ingest.congreso import bootstrap as bootstrap_mod
from app.services.plain_summary import PlainSummaryResult


@dataclass
class _FakeVote:
    """Stand-in for the Vote SQLAlchemy row used by the bootstrap step."""

    id: int
    title: str
    description: str
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
    """Mimics the slice of AsyncSession the bootstrap step calls.

    Two calls happen on every session: one ``execute`` then either
    ``commit`` (inner per-row session) or nothing (outer listing
    session). We pre-program the responses with a queue.
    """

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
    """Hands out :class:`_FakeSession` instances in order."""

    sessions: list[_FakeSession] = field(default_factory=list)
    _idx: int = 0

    def __call__(self) -> _FakeSession:
        s = self.sessions[self._idx]
        self._idx += 1
        return s


@pytest.mark.asyncio
async def test_generate_vote_plain_summaries_populates_target_column(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One eligible row gets summarised; columns + audit fields are set."""
    vote = _FakeVote(
        id=42,
        title="Convalidación o derogación de Reales Decretos-leyes.",
        description=(
            "Real Decreto-ley 9/2026, de 14 de abril, de medidas urgentes "
            "en materia de transporte."
        ),
    )

    factory = _SessionFactory(
        sessions=[
            _FakeSession([[42]]),  # listing query: list of vote ids
            _FakeSession([vote]),  # per-row inner session: Vote row
        ]
    )
    monkeypatch.setattr(bootstrap_mod, "AsyncSessionLocal", factory)

    async def fake_summary(*, title: str, body: str | None, lang: str) -> PlainSummaryResult:
        assert title == vote.title
        assert body == vote.description
        assert lang == "ca"
        return PlainSummaryResult(
            text="Modifica normes urgents del sector del transport.",
            provider="llm:mistral-small",
            raw="Modifica normes urgents del sector del transport.",
        )

    # The function imports ``generate_plain_summary`` lazily at call
    # site — patch it on the source module so the rebound symbol is
    # what the inner import resolves to.
    monkeypatch.setattr("app.services.plain_summary.generate_plain_summary", fake_summary)

    stats = await bootstrap_mod.generate_vote_plain_summaries(lang="ca")

    assert stats == {
        "lang": "ca",
        "seen": 1,
        "summarised": 1,
        "insufficient": 0,
        "errors": 0,
    }
    assert vote.plain_summary_ca == "Modifica normes urgents del sector del transport."
    assert vote.plain_summary_provider == "llm:mistral-small"
    assert vote.plain_summary_generated_at is not None
    assert factory.sessions[1].committed


@pytest.mark.asyncio
async def test_generate_vote_plain_summaries_is_idempotent_on_empty_candidate_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Second run sees an empty candidate list — no LLM calls, no writes."""
    factory = _SessionFactory(sessions=[_FakeSession([[]])])
    monkeypatch.setattr(bootstrap_mod, "AsyncSessionLocal", factory)

    calls = {"count": 0}

    async def fake_summary(*, title: str, body: str | None, lang: str) -> PlainSummaryResult:
        calls["count"] += 1
        return PlainSummaryResult(text="should not be called", provider="x", raw="x")

    monkeypatch.setattr("app.services.plain_summary.generate_plain_summary", fake_summary)

    stats = await bootstrap_mod.generate_vote_plain_summaries(lang="ca")

    assert stats == {
        "lang": "ca",
        "seen": 0,
        "summarised": 0,
        "insufficient": 0,
        "errors": 0,
    }
    assert calls["count"] == 0
