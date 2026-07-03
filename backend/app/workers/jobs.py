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
    backfill_vote_initiative_links,
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


def classify_initiative(initiative_id: int, kind: str = "theme") -> int:
    """RQ entrypoint: classify one initiative and persist topic assignments.

    ``kind`` selects the taxonomy:
    - ``"theme"`` (default) — editorial 17 topics
    - ``"sdg"`` — UN Agenda 2030 sustainable development goals

    On success we bust the stats + metrics caches — classification flips
    several aggregate counts (initiatives_classified, topics/global) at
    once and the user would otherwise see stale numbers for up to 1h.
    """

    async def _run() -> int:
        async with AsyncSessionLocal() as session:
            classifier = build_classifier()
            service = ClassificationService(session, classifier)
            n = await service.classify_initiative(initiative_id, kind=kind)
        await _invalidate_aggregate_caches()
        return n

    return asyncio.run(_run())


async def _invalidate_aggregate_caches() -> None:
    """Bust + pre-warm the ``stats:*`` and ``metrics:*`` Redis caches.

    Wiping leaves the next user request paying the SQL cost. We
    follow up by re-running the most-hit factories ourselves so the
    cache is warm by the time a real visitor arrives — the dashboard
    on /, /stats and /avui all hit these same keys on first paint.
    """
    from app.services.cache import invalidate

    await invalidate("stats:")
    await invalidate("metrics:")
    await _warm_aggregate_caches()


async def _warm_aggregate_caches() -> None:
    """Populate the expensive aggregate keys for legislature 1.

    The two metric functions below are the slowest queries the API
    serves (full per-legislature aggregation across every vote
    record); the lighter ``stats:*`` keys re-warm cheaply on first
    real request. Failures here are logged and swallowed — warming
    is a nice-to-have, freshness is contractually guaranteed by the
    invalidation step above plus the 24 h TTL safety net.
    """
    from app.metrics import (
        compute_group_coincidence_matrix,
        compute_group_summary,
    )
    from app.services.cache import cached

    try:
        async with AsyncSessionLocal() as session:
            await cached(
                "metrics:group-summary:1",
                86400,
                lambda: compute_group_summary(session, legislature_id=1),
            )
            await cached(
                "metrics:coincidence:1::",
                86400,
                lambda: compute_group_coincidence_matrix(
                    session, legislature_id=1, from_date=None, to_date=None
                ),
            )
        log.info("cache.warmed", scope="aggregates")
    except Exception as e:
        # Warming is best-effort; the user-facing API still works
        # because the next request will re-run the factory through
        # the normal cached() path.
        log.warning("cache.warm.failed", error=str(e))


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
            # Link the freshly-imported votes to their initiatives BEFORE the
            # push fan-out: the fan-out only targets votes already linked to a
            # classified initiative, so without this step a brand-new vote
            # (initiative_id still NULL at this instant) would never notify —
            # the daily ingest_pnl link pass runs too late for that. Idempotent
            # and cheap (only unlinked votes).
            try:
                await backfill_vote_initiative_links()
            except Exception as exc:  # pragma: no cover — defensive
                log.warning("link_votes.after_ingest.failed", error=str(exc))
            try:
                _enqueue_push_fanout_for_recent_votes()
            except Exception as exc:  # pragma: no cover — defensive
                log.warning("push.enqueue.failed", error=str(exc))
            # New votes change every aggregate on /stats — bust the cache.
            await _invalidate_aggregate_caches()
        # Data-quality invariants — runs every tick (a handful of COUNT
        # queries) so a broken invariant screams in the worker logs
        # within 4 h of appearing, whichever ingest introduced it.
        try:
            from app.ingest.quality import run_data_quality_checks

            async with AsyncSessionLocal() as session:
                await run_data_quality_checks(session)
        except Exception as exc:  # pragma: no cover — defensive
            log.warning("data_quality.run_failed", error=str(exc))
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
    """RQ entrypoint: refresh the active deputies snapshot.

    After the roster upsert (which can open mandates for brand-new
    substitutes and close them for departed deputies) we re-scrape the
    official hemicycle image-map so the newcomers get seat coordinates,
    then bust the cached hemicycle layout so the chamber widget reflects
    the change without waiting out the 1 h TTL.
    """

    async def _run() -> int:
        from app.ingest.congreso.bootstrap import import_hemicycle_xv
        from app.services.cache import invalidate

        stats = await import_active_deputies()
        if stats.mandates_created or stats.mandates_closed:
            log.info(
                "ingest.deputies.roster_changed",
                mandates_created=stats.mandates_created,
                mandates_closed=stats.mandates_closed,
            )
        try:
            await import_hemicycle_xv()
        except Exception:
            # Seat coordinates are an enhancement, not a dependency — a
            # scrape hiccup must not fail the roster ingest.
            log.warning("ingest.deputies.hemicycle_refresh_failed", exc_info=True)
        await invalidate("legislatures:")
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


def ingest_pnl() -> dict[str, int]:
    """RQ entrypoint: scrape every Liferay-portlet initiative series.

    The Congreso bulk JSON dataset only covers Proyectos (121),
    Proposiciones de Ley (122) and Reformas (127). The Liferay search
    portlet additionally exposes four series that this job scrapes
    using the shared :func:`import_pnl` machinery:

    * **PNL (162)** — Proposiciones no de Ley. ~half of plenary votes.
    * **Moción (173)** — follow-up motions after interpellations.
    * **Convalidación RDL (130)** — Cortes ratification of Royal
      Decree-Laws within 30 days. The vote IS the convalidation, so
      without this series the corresponding plenary vote has no
      initiative to link to.
    * **Reforma constitucional (102)** — rare but disproportionately
      worth surfacing for civic transparency.

    Three-step body:

    1. Upsert each series into the ``initiatives`` table via the
       series-specific ``import_*_xv`` helpers — all idempotent
       (lookups by ``official_id``) and polite (one-second inter-page
       delay each). The four runs share an :class:`InitiativeImporter`
       upsert path, so per-series caches don't fight each other.
    2. Run :func:`backfill_vote_initiative_links` so any pre-existing
       vote whose ``expediente_raw`` matches a newly-created
       initiative gets its ``initiative_id`` populated. Without this
       step the topics that the next classifier tick assigns sit on
       the Initiative side and never propagate to the votes that
       /avui actually renders.
    3. Bust the aggregate caches so /stats and /avui reflect the
       newly-linked rows on next paint.

    Idempotent: re-runs upsert by ``official_id``; the backfill is a
    cheap no-op when no new initiatives have appeared. XV legislatura
    only for now — earlier legislatures aren't yet imported anywhere.
    """
    from dataclasses import asdict

    from app.ingest.congreso.bootstrap import backfill_vote_initiative_links
    from app.ingest.congreso.pnl import import_pnl_xv
    from app.ingest.congreso.series_search import (
        import_mocion_xv,
        import_rdl_convalidacion_xv,
        import_reforma_constitucional_xv,
    )

    async def _run() -> dict[str, int]:
        # Serialise the four imports to be polite to the upstream
        # portal — the shared 1 s inter-page delay only applies within
        # a single series. Each call commits inside the importer; a
        # crash mid-batch loses at most one series' progress.
        pnl_stats = await import_pnl_xv()
        mocion_stats = await import_mocion_xv()
        rdl_stats = await import_rdl_convalidacion_xv()
        reforma_stats = await import_reforma_constitucional_xv()

        link_stats = await backfill_vote_initiative_links()
        await _invalidate_aggregate_caches()

        # Sum the per-series counters so the response is one tidy
        # dict; per-series detail is still in the structured logs.
        seen = pnl_stats.seen + mocion_stats.seen + rdl_stats.seen + reforma_stats.seen
        created = (
            pnl_stats.created + mocion_stats.created + rdl_stats.created + reforma_stats.created
        )
        updated = (
            pnl_stats.updated + mocion_stats.updated + rdl_stats.updated + reforma_stats.updated
        )
        merged = {"seen": seen, "created": created, "updated": updated}
        # Surface per-series counts too so the RQ dashboard makes the
        # contribution of each series legible at a glance.
        merged["pnl_seen"] = pnl_stats.seen
        merged["mocion_seen"] = mocion_stats.seen
        merged["rdl_seen"] = rdl_stats.seen
        merged["reforma_seen"] = reforma_stats.seen
        merged.update(
            {
                "votes_processed": link_stats.votes_processed,
                "votes_linked": link_stats.votes_linked,
                "votes_unmatched": link_stats.votes_unmatched,
            }
        )
        # Keep the raw PNL fields under their original keys for any
        # log scraper that already consumes them.
        for k, v in asdict(pnl_stats).items():
            merged.setdefault(k, int(v))
        return merged

    return asyncio.run(_run())


def generate_affected_pending(batch_size: int = 200) -> dict[str, int]:
    """RQ entrypoint: extract "who does this affect" for a batch of initiatives.

    Walks initiatives that already carry a plain summary (the input the
    extractor needs) but have ``affected_audiences IS NULL``, newest
    first. Each row commits in its own session; a failed extraction is
    logged and skipped, and rows where the model finds no concrete
    audience persist ``{"ca": [], "es": []}`` so they're never retried.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative
    from app.services.affected import extract_affected_audiences

    async def _run() -> dict[str, int]:
        async with AsyncSessionLocal() as session:
            stmt = (
                _select(Initiative.id)
                .where(Initiative.affected_audiences.is_(None))
                .where(Initiative.plain_summary_es.is_not(None))
                .order_by(Initiative.id.desc())
                .limit(batch_size)
            )
            ids = [int(i) for i in (await session.execute(stmt)).scalars().all()]

        if not ids:
            log.info("affected.pending.empty")
            return {"attempted": 0, "succeeded": 0, "failed": 0}

        succeeded = 0
        failed = 0
        for initiative_id in ids:
            try:
                async with AsyncSessionLocal() as session:
                    initiative = (
                        await session.execute(
                            _select(Initiative).where(Initiative.id == initiative_id)
                        )
                    ).scalar_one_or_none()
                    if initiative is None:
                        continue
                    result = await extract_affected_audiences(
                        title=initiative.title_original,
                        summary=initiative.plain_summary_es,
                    )
                    initiative.affected_audiences = result.audiences
                    await session.commit()
                succeeded += 1
                # Mistral free-tier rate limit: ~1 req/s. Pace the loop
                # so a 200-row batch never trips 429s.
                await asyncio.sleep(1.1)
            except Exception as exc:
                log.warning(
                    "affected.pending.failed",
                    initiative_id=initiative_id,
                    error=str(exc),
                )
                failed += 1

        log.info(
            "affected.pending.done",
            attempted=len(ids),
            succeeded=succeeded,
            failed=failed,
            at=datetime.now(UTC).isoformat(),
        )
        return {"attempted": len(ids), "succeeded": succeeded, "failed": failed}

    return asyncio.run(_run())


def classify_pending_initiatives(batch_size: int = 200, kind: str = "theme") -> dict[str, int]:
    """RQ entrypoint: classify a batch of initiatives that still lack a topic.

    Builds the classifier configured by :data:`Settings.llm_provider`
    (Mistral in production, Keyword fallback in dev) and walks every
    Initiative that has NO :class:`InitiativeTopic` row from that
    classifier in the requested knowledge base. Each row is classified
    in its own DB session so a single failure doesn't roll back the
    whole batch.

    ``batch_size`` caps the work per cron tick so a runaway provider
    can't pin the worker. With ~200 initiatives per run at <1 s/call
    via Mistral the batch finishes well under a minute, and the
    scheduler can catch up over a few ticks even on a backlog of
    several thousand. The classifier service itself is idempotent:
    re-running on an already-classified initiative replaces just that
    row's topic assignments, which is why we filter ahead of time
    here — to actually make forward progress and not burn budget on
    re-classification.

    Returns a small counter dict for RQ dashboard surfacing.
    """
    from sqlalchemy import exists as sql_exists
    from sqlalchemy import select as _select

    from app.classify.service import (
        ClassificationService,
        _classified_by_label,
    )
    from app.models import Initiative, InitiativeTopic

    async def _run() -> dict[str, int]:
        classifier = build_classifier()
        classified_by = _classified_by_label(classifier.name, kind)

        # Pick up to ``batch_size`` initiatives with NO existing topic
        # from this (classifier, kind) pair. Newest first so reading
        # users see fresh classifications on /avui sooner; the
        # scheduler still catches up on the tail across multiple ticks.
        async with AsyncSessionLocal() as session:
            subq = (
                _select(InitiativeTopic.id)
                .where(InitiativeTopic.initiative_id == Initiative.id)
                .where(InitiativeTopic.classified_by == classified_by)
            )
            stmt = (
                _select(Initiative.id)
                .where(~sql_exists(subq))
                .order_by(Initiative.id.desc())
                .limit(batch_size)
            )
            ids = [int(i) for i in (await session.execute(stmt)).scalars().all()]

        if not ids:
            log.info(
                "classify.pending.empty",
                kind=kind,
                classifier=classifier.name,
            )
            return {"attempted": 0, "succeeded": 0, "failed": 0}

        succeeded = 0
        failed = 0
        for initiative_id in ids:
            try:
                async with AsyncSessionLocal() as session:
                    service = ClassificationService(session, classifier)
                    await service.classify_initiative(initiative_id, kind=kind)
                succeeded += 1
            except Exception as exc:
                log.warning(
                    "classify.pending.failed",
                    initiative_id=initiative_id,
                    error=str(exc),
                )
                failed += 1

        # Bust caches once at the end so /avui + /stats + topic globals
        # see the new assignments. Skipping when every row failed would
        # be a premature optimisation — invalidate is cheap.
        await _invalidate_aggregate_caches()

        log.info(
            "classify.pending.done",
            kind=kind,
            classifier=classifier.name,
            attempted=len(ids),
            succeeded=succeeded,
            failed=failed,
        )
        return {"attempted": len(ids), "succeeded": succeeded, "failed": failed}

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


# ---------------------------------------------------------------------------
# Open-data enrichment workers
# ---------------------------------------------------------------------------
#
# Both jobs are best-effort and idempotent: they re-fetch the external
# source on each run and only update rows that gained new information.
# Failures are logged and swallowed so a single misbehaving upstream
# never blocks the cron.


def enrich_persons_wikidata() -> dict[str, int]:
    """Match every Person to a Wikidata Q-id and persist linked URLs.

    Runs the one-shot SPARQL query at query.wikidata.org and pairs
    candidates to local persons via name + birth-year. Updated rows
    pick up Wikipedia URLs (CA/ES/EN), education + profession labels
    and (when missing) birth_year.
    """
    from app.ingest.wikidata import enrich_persons_from_wikidata

    async def _run() -> dict[str, int]:
        async with AsyncSessionLocal() as session:
            counts = await enrich_persons_from_wikidata(session)
        # Persons table is read by the deputies hub + group composition;
        # bust those caches so the next visitor sees the enriched data.
        await _invalidate_aggregate_caches()
        return counts

    return asyncio.run(_run())


def enrich_initiatives_boe() -> dict[str, int]:
    """Match every approved publishable initiative to its BOE entry."""
    from app.ingest.boe import enrich_initiatives_with_boe

    async def _run() -> dict[str, int]:
        async with AsyncSessionLocal() as session:
            counts = await enrich_initiatives_with_boe(session)
        await _invalidate_aggregate_caches()
        return counts

    return asyncio.run(_run())


def enrich_persons_wikipedia() -> dict[str, int]:
    """Fetch Wikipedia summary extracts for every person with a URL.

    Follow-up to :func:`enrich_persons_wikidata`: the Wikidata pass
    sets each person's per-locale Wikipedia URL; this job calls the
    Wikipedia REST summary API to pull the article's first paragraph
    and persists it for in-app display.
    """
    from app.ingest.wikipedia import enrich_persons_wikipedia as _enrich

    async def _run() -> dict[str, int]:
        async with AsyncSessionLocal() as session:
            counts = await _enrich(session)
        await _invalidate_aggregate_caches()
        return counts

    return asyncio.run(_run())


# ---------------------------------------------------------------------------
# Social — Bluesky publisher
# ---------------------------------------------------------------------------

_BLUESKY_STATE_KEY = "social:bluesky:last_posted_vote_id"
_BLUESKY_POST_LIMIT_PER_RUN = 5
_BLUESKY_TITLE_CHAR_BUDGET = 220  # leaves room for URL + spacing under 300


def post_recent_votes_to_bluesky() -> dict[str, int | str]:
    """Publish newly-ingested plenary votes to the project's Bluesky account.

    No-op when ``bluesky_enable`` is false or credentials are missing.
    Otherwise:
      1. Read the last-posted vote id from Redis.
      2. Fetch up to N votes from the DB with id strictly greater.
      3. Post each one (oldest first so the feed reads chronologically).
      4. Update the marker after each successful post so a crash leaves
         state consistent.

    Returns a structured summary the scheduler can log; never raises
    so the cron job keeps firing.
    """
    return asyncio.run(_post_recent_votes_to_bluesky_async())


async def _post_recent_votes_to_bluesky_async() -> dict[str, int | str]:
    from redis import Redis
    from sqlalchemy import select

    from app.models import Session as SessionRow
    from app.models import Vote
    from app.social.bluesky import BlueskyClient, BlueskySocialError

    settings = get_settings()
    if not settings.bluesky_enable:
        log.info("bluesky.skip", reason="disabled")
        return {"status": "disabled", "posted": 0}

    client_or_none = BlueskyClient.from_settings()
    if client_or_none is None:
        log.warning("bluesky.skip", reason="missing_credentials")
        return {"status": "missing_credentials", "posted": 0}

    redis = Redis.from_url(settings.redis_url)
    raw = redis.get(_BLUESKY_STATE_KEY)
    # The redis-py stub overloads `get()` so its return type is
    # Awaitable[Any] | Any; the sync client returns bytes | None. We
    # coerce to a string before parsing so the type checker sees a
    # clean ``int(...)`` call, and any other value (None / awaitable)
    # falls through to 0 — the safer default for a cron worker.
    last_id = 0
    if isinstance(raw, (bytes, bytearray)):
        try:
            last_id = int(raw.decode())
        except ValueError:
            last_id = 0
    elif isinstance(raw, str):
        try:
            last_id = int(raw)
        except ValueError:
            last_id = 0

    async with AsyncSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(Vote)
                    .join(SessionRow, SessionRow.id == Vote.session_id)
                    .where(Vote.id > last_id)
                    .order_by(Vote.id.asc())
                    .limit(_BLUESKY_POST_LIMIT_PER_RUN)
                )
            )
            .scalars()
            .all()
        )

    if not rows:
        log.info("bluesky.skip", reason="no_new_votes", last_id=last_id)
        return {"status": "nothing_new", "posted": 0, "last_id": last_id}

    posted = 0
    skipped = 0
    site_url = settings.public_site_url.rstrip("/")
    try:
        async with client_or_none as client:
            for vote in rows:
                text = _format_bluesky_post(vote, site_url)
                url = f"{site_url}/votes/{vote.id}"
                try:
                    uri = await client.post_with_link(text, url)
                    posted += 1
                    redis.set(_BLUESKY_STATE_KEY, str(vote.id))
                    log.info("bluesky.posted", vote_id=vote.id, at_uri=uri)
                except BlueskySocialError as e:
                    skipped += 1
                    log.warning("bluesky.post.failed", vote_id=vote.id, error=str(e))
                    # Stop after the first failure so we don't burn the
                    # rate budget on a recurring issue (e.g. expired
                    # access token). Next cron tick will retry.
                    break
    except BlueskySocialError as e:
        # Login-level failure: the whole batch is dropped, but state
        # isn't updated so the next run will retry the same window.
        log.error("bluesky.session.failed", error=str(e))
        return {"status": "session_failed", "posted": posted, "skipped": skipped}

    return {"status": "ok", "posted": posted, "skipped": skipped, "last_id": int(rows[-1].id)}


def _format_bluesky_post(vote: object, site_url: str) -> str:
    """Render the post text. Strictly factual: subject + counts + URL.

    Caps the subject at ``_BLUESKY_TITLE_CHAR_BUDGET`` graphemes so the
    final string stays under Bluesky's 300-grapheme limit. No emojis,
    no editorial adjectives.
    """
    # Local import to avoid a circular dep at module load.
    from app.models import Vote, VoteResult

    assert isinstance(vote, Vote)
    raw_subject = (vote.description or vote.title or "").strip()
    subject = (
        raw_subject
        if len(raw_subject) <= _BLUESKY_TITLE_CHAR_BUDGET
        else (raw_subject[: _BLUESKY_TITLE_CHAR_BUDGET - 1].rstrip() + "…")
    )
    result_label = {
        VoteResult.APPROVED: "Aprovada",
        VoteResult.REJECTED: "Rebutjada",
        VoteResult.TIE: "Empat",
    }.get(vote.result, str(vote.result))
    counts = f"{vote.ayes} a favor · {vote.noes} en contra · {vote.abstentions} abst."
    url = f"{site_url}/votes/{vote.id}"
    return f"{result_label} · {subject}\n\n{counts}\n\n{url}"
