"""Job functions enqueued by RQ.

RQ jobs run in a fresh process and re-enter the application via these
top-level functions. Each function:

- Builds its own DB session and HTTP/LLM clients (RQ workers are sync, so we
  use ``asyncio.run`` to run async code).
- Catches and re-raises so RQ records the failure and triggers retries.
- Stays small — the heavy lifting lives in the corresponding services.
"""

from __future__ import annotations

import asyncio
from datetime import UTC

from app.classify.providers import build_classifier
from app.classify.service import ClassificationService
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.ingest.congreso.bootstrap import (
    import_active_deputies,
    import_initiatives,
    import_latest_session_votes,
    import_upcoming_agenda,
)
from app.newsletter.digest import (
    build_digest,
    is_empty,
    summary_counters,
    weekly_campaign_name,
)
from app.newsletter.listmonk import (
    ListmonkClient,
    ListmonkError,
    ListmonkNotConfigured,
)
from app.newsletter.render import render_html, render_subject

configure_logging()
log = get_logger(__name__)


def classify_initiative(initiative_id: int) -> int:
    """RQ entrypoint: classify one initiative and persist topic assignments.

    On success we bust the stats + metrics caches — classification flips
    several aggregate counts (initiatives_classified, topics/global) at
    once and the user would otherwise see stale numbers for up to 1h.
    """

    async def _run() -> int:
        async with AsyncSessionLocal() as session:
            classifier = build_classifier()
            service = ClassificationService(session, classifier)
            n = await service.classify_initiative(initiative_id)
        await _invalidate_aggregate_caches()
        return n

    return asyncio.run(_run())


async def _invalidate_aggregate_caches() -> None:
    """Bust every ``stats:*`` and ``metrics:*`` Redis cache entry."""
    from app.services.cache import invalidate

    await invalidate("stats:")
    await invalidate("metrics:")


def generate_plain_summary_for_initiative(
    initiative_id: int, lang: str = "ca"
) -> dict[str, str | bool]:
    """RQ entrypoint: generate a plain-language summary for one initiative.

    ``lang`` ∈ {``"ca"``, ``"es"``}. Persists ``NULL`` when the LLM
    declines (we preserve the right to refuse rather than emit editorial
    text).
    """

    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative
    from app.services.plain_summary import generate_plain_summary

    target_attr = f"plain_summary_{lang}"

    async def _run() -> dict[str, str | bool]:
        async with AsyncSessionLocal() as session:
            initiative = (
                await session.execute(_select(Initiative).where(Initiative.id == initiative_id))
            ).scalar_one_or_none()
            if initiative is None:
                return {"ok": False, "reason": "not_found", "provider": ""}

            result = await generate_plain_summary(
                title=initiative.title_original,
                body=initiative.summary,
                lang=lang,
            )
            setattr(initiative, target_attr, result.text)
            initiative.plain_summary_provider = result.provider
            initiative.plain_summary_generated_at = datetime.now(UTC)
            await session.commit()
            return {
                "ok": result.text is not None,
                "provider": result.provider,
                "reason": "" if result.text else "insufficient_or_editorial",
            }

    return asyncio.run(_run())


def ingest_latest_votes() -> int | None:
    """RQ entrypoint: pull the latest session of votes from the live portal.

    Side-effect: any vote *newly created* in this run AND already linked to a
    classified Initiative triggers a Web Push fan-out job. The fan-out runs
    in a separate RQ job (fire-and-forget) so a slow push provider can't
    delay the ingest worker.
    """

    async def _run() -> int | None:
        stats = await import_latest_session_votes()
        if stats is not None:
            try:
                _enqueue_push_fanout_for_recent_votes()
            except Exception as exc:  # pragma: no cover — defensive
                log.warning("push.enqueue.failed", error=str(exc))
            # New votes change every aggregate on /stats — bust the cache.
            await _invalidate_aggregate_caches()
        return stats.votes_seen if stats is not None else None

    return asyncio.run(_run())


def _enqueue_push_fanout_for_recent_votes(window_minutes: int = 60) -> None:
    """Find votes inserted in the last ``window_minutes`` that are classifiable
    (i.e. linked to an Initiative that has at least one topic) and enqueue a
    push fan-out job per vote.

    Filtering by ``created_at`` is robust to backfills (older votes won't be
    re-broadcast) and avoids passing a list of ids through the call chain —
    the importer returns counters only, not row ids.
    """

    from datetime import datetime, timedelta

    from sqlalchemy import distinct
    from sqlalchemy import select as _select

    from app.models import Initiative, InitiativeTopic, Vote
    from app.workers.queue import enqueue_push_fanout

    async def _collect() -> list[int]:
        cutoff = datetime.now(UTC) - timedelta(minutes=window_minutes)
        async with AsyncSessionLocal() as session:
            rows = await session.execute(
                _select(distinct(Vote.id))
                .join(Initiative, Initiative.id == Vote.initiative_id)
                .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
                .where(Vote.created_at >= cutoff)
            )
            return [int(r) for r in rows.scalars().all()]

    ids = asyncio.run(_collect())
    for vote_id in ids:
        enqueue_push_fanout(vote_id)
    log.info("push.fanout.enqueued", count=len(ids))


def fan_out_vote_push(vote_id: int) -> dict[str, int]:
    """RQ entrypoint: fan out push notifications for one vote."""

    async def _run() -> dict[str, int]:
        from app.services.push import fan_out_new_vote

        async with AsyncSessionLocal() as session:
            result = await fan_out_new_vote(session, vote_id, site_origin=_site_url())
        return {
            "sent": result.sent,
            "deleted": result.deleted,
            "failed": result.failed,
            "skipped": result.skipped,
        }

    return asyncio.run(_run())


def ingest_active_deputies() -> int:
    """RQ entrypoint: refresh the active deputies snapshot."""

    async def _run() -> int:
        stats = await import_active_deputies()
        return stats.deputies_seen

    return asyncio.run(_run())


def ingest_initiatives() -> int:
    """RQ entrypoint: refresh all three initiative datasets."""

    async def _run() -> int:
        results = await import_initiatives()
        total = sum(s.seen for s in results.values())
        await _invalidate_aggregate_caches()
        return total

    return asyncio.run(_run())


def ingest_upcoming_agenda() -> dict[str, int]:
    """RQ entrypoint: refresh the upcoming agenda (calendar + next orden del día).

    The agenda feeds the "qui proposa aquest tema" panel via initiative
    references on each item, so we invalidate the stats cache on every
    successful run.
    """
    from dataclasses import asdict

    async def _run() -> dict[str, int]:
        stats = await import_upcoming_agenda()
        await _invalidate_aggregate_caches()
        return {k: int(v) for k, v in asdict(stats).items()}

    return asyncio.run(_run())


def send_weekly_digest(period_days: int = 7, dry_run: bool = False) -> dict[str, int | str]:
    """RQ entrypoint: build the weekly digest and dispatch it via Listmonk.

    Behaviour:

    - Empty digest (no votes AND no initiatives in the period) → log
      ``newsletter.empty.skip`` and return without touching Listmonk.
    - Listmonk env vars missing → log a warning and return without
      crashing. Useful for dev environments without a Listmonk instance.
    - ``dry_run=True`` → render and create a *draft* campaign in
      Listmonk (so a human can preview it in the admin) but do NOT
      trigger the send. Idempotent across re-runs in the same week.
    - ``dry_run=False`` (default) → create-or-reuse the campaign and
      flip its status to ``running``. Idempotent: re-running in the
      same ISO week returns the existing campaign id without
      double-sending.

    The job returns a small dict of counters so RQ surfaces useful
    results in the dashboard.
    """

    async def _run() -> dict[str, int | str]:
        async with AsyncSessionLocal() as session:
            digest = await build_digest(session, period_days=period_days)
        counters: dict[str, int | str] = {k: int(v) for k, v in summary_counters(digest).items()}
        if is_empty(digest):
            log.info("newsletter.empty.skip", **counters)
            return {"status": "skipped_empty", **counters}

        subject = render_subject(digest)
        body_html = render_html(digest, site_url=_site_url())
        campaign_name = weekly_campaign_name(digest.period_to)

        try:
            client = ListmonkClient()
        except ListmonkNotConfigured as e:
            log.warning("newsletter.listmonk.unavailable", reason=str(e), **counters)
            return {"status": "skipped_no_listmonk", "reason": str(e), **counters}

        from_email = get_settings().smtp_from_email

        if dry_run:
            try:
                campaign_id = await client.create_draft_campaign(
                    name=campaign_name,
                    subject=subject,
                    body_html=body_html,
                    from_email=from_email,
                )
            except ListmonkError as e:
                log.error(
                    "newsletter.digest.dry_run_failed",
                    reason=str(e),
                    campaign_name=campaign_name,
                    **counters,
                )
                return {
                    "status": "dry_run_failed",
                    "reason": str(e),
                    "campaign_name": campaign_name,
                    **counters,
                }
            log.info(
                "newsletter.digest.dry_run",
                campaign_id=campaign_id,
                campaign_name=campaign_name,
                subject=subject,
                body_html_chars=len(body_html),
                **counters,
            )
            return {
                "status": "dry_run",
                "campaign_id": campaign_id,
                "campaign_name": campaign_name,
                "subject": subject,
                "body_html_chars": len(body_html),
                **counters,
            }

        try:
            campaign_id = await client.send_campaign(
                name=campaign_name,
                subject=subject,
                body_html=body_html,
                from_email=from_email,
            )
        except ListmonkError as e:
            log.error("newsletter.digest.send_failed", reason=str(e), **counters)
            return {"status": "send_failed", "reason": str(e), **counters}

        log.info(
            "newsletter.digest.sent",
            campaign_id=campaign_id,
            campaign_name=campaign_name,
            **counters,
        )
        return {
            "status": "sent",
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            **counters,
        }

    return asyncio.run(_run())


def _site_url() -> str:
    """Best-effort site URL for absolute links in the digest."""
    s = get_settings()
    origin = s.backend_cors_origins.split(",")[0].strip().rstrip("/")
    return origin or "http://localhost:3000"
