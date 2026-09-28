"""The daily job that summarises votes carrying their own text.

Procedural votes (convalidation of a decree-law, motions, amendment
blocks) have no initiative behind them, so ``summarise_pending_initiatives``
never reaches them: the vote-side generator exists, but for a long time it
was only a manual bootstrap step, and the gap reopened after every plenary.
These tests pin the two things that keep it closed:

1. it is on the schedule, in the right order relative to the language
   repair that translates the Spanish summary into Catalan; and
2. the RQ entrypoint asks for Spanish and caps the run — uncapped, it
   would queue an LLM call for every unsummarised vote in a 16k-row
   archive.
"""

from __future__ import annotations

from typing import Any

from app.workers import jobs, schedule


def _definition(job_id: str) -> tuple[Any, ...]:
    for definition in schedule.SCHEDULE_DEFINITIONS:
        if definition[0] == job_id:
            return definition
    raise AssertionError(f"{job_id} is not on the schedule")


def test_vote_summaries_are_scheduled_daily() -> None:
    _job_id, queue_name, cron_string, fn = _definition("monitor-summarise-pending-votes")

    assert queue_name == "ingest"
    assert fn is jobs.summarise_pending_votes
    # Daily, in the morning block with the other summary work.
    minute, hour, *rest = cron_string.split()
    assert rest == ["*", "*", "*"]
    assert hour == "7"
    assert minute.isdigit()


def test_vote_summaries_run_before_the_language_repair() -> None:
    """Generate the Spanish summary first, translate it the same morning.

    The repair job is what fills ``plain_summary_ca``; scheduled before the
    generator it would have nothing to translate and a reader in Catalan
    would wait a day for the summary.
    """
    order = [job_id for job_id, *_ in schedule.SCHEDULE_DEFINITIONS]
    generate = _definition("monitor-summarise-pending-votes")
    repair = _definition("monitor-summary-language-gaps")

    assert order.index(generate[0]) < order.index(repair[0])
    assert int(generate[2].split()[0]) < int(repair[2].split()[0])


def test_entrypoint_asks_for_spanish_and_caps_the_run(monkeypatch: Any) -> None:
    calls: list[dict[str, Any]] = []

    async def _fake(lang: str = "ca", *, limit: int | None = None) -> dict[str, int | str]:
        calls.append({"lang": lang, "limit": limit})
        return {"lang": lang, "seen": 0, "summarised": 0, "insufficient": 0, "errors": 0}

    from app.ingest.congreso import bootstrap

    monkeypatch.setattr(bootstrap, "generate_vote_plain_summaries", _fake)

    jobs.summarise_pending_votes()

    assert calls == [{"lang": "es", "limit": jobs._VOTE_SUMMARY_LIMIT_PER_RUN}]
    assert 0 < jobs._VOTE_SUMMARY_LIMIT_PER_RUN <= 500
