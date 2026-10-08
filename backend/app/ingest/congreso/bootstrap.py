"""One-shot bootstrap importer for the Congreso current legislature.

Run with::

    docker compose exec backend python -m app.ingest.congreso.bootstrap

By default the script runs every available step (active deputies, then the
latest published session of votes). A subcommand can be passed to run a
single step::

    python -m app.ingest.congreso.bootstrap deputies
    python -m app.ingest.congreso.bootstrap latest_votes
    python -m app.ingest.congreso.bootstrap pnl_xv

The vote importer is forward-only: it captures the most recent session
exposed by the votes listing page. Comprehensive backfill of older sessions
is deferred — see ``docs/STATUS.md``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import asdict, dataclass
from datetime import UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.ingest.congreso.agenda import (
    parse_calendar_html,
    parse_orden_del_dia_pdf,
)
from app.ingest.congreso.agenda_importer import AgendaImporter, AgendaImportStats
from app.ingest.congreso.backfill import BackfillStats, backfill_legislature
from app.ingest.congreso.client import CongresoClient, InitiativeDataset
from app.ingest.congreso.deputies import DeputyImporter, ImportStats
from app.ingest.congreso.hemicycle import HemicycleImportStats, import_hemicycle_seats
from app.ingest.congreso.initiative_objects import (
    InitiativeObjectsBackfillStats,
    backfill_initiative_objects,
)
from app.ingest.congreso.initiatives import InitiativeImporter, InitiativeImportStats
from app.ingest.congreso.photos import PhotoBackfillStats, backfill_photos
from app.ingest.congreso.pnl import import_pnl_xv
from app.ingest.congreso.series_search import (
    import_mocion_xv,
    import_rdl_convalidacion_xv,
    import_reforma_constitucional_xv,
)
from app.ingest.congreso.votes import VoteImporter, VoteImportStats
from app.models import Chamber, Initiative, Legislature
from app.models import Session as SessionRow

configure_logging()
log = get_logger(__name__)


async def _get_congreso_chamber(session: AsyncSession) -> Chamber:
    result = await session.execute(select(Chamber).where(Chamber.slug == "es-congreso"))
    chamber = result.scalar_one_or_none()
    if chamber is None:
        raise RuntimeError("Chamber 'es-congreso' not found. Did the seed migration run?")
    return chamber


async def _get_active_legislature(session: AsyncSession, chamber: Chamber) -> Legislature:
    result = await session.execute(
        select(Legislature)
        .where(Legislature.chamber_id == chamber.id)
        .where(Legislature.status == "active")
    )
    leg = result.scalar_one_or_none()
    if leg is None:
        raise RuntimeError(f"No active legislature found for chamber {chamber.slug}.")
    return leg


async def import_active_deputies() -> ImportStats:
    """Fetch and upsert the active deputies for the active legislature."""
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)

        log.info(
            "bootstrap.deputies.starting",
            chamber=chamber.slug,
            legislature=legislature.number,
        )

        async with CongresoClient() as client:
            payload = await client.fetch_active_deputies(fmt="json")

        importer = DeputyImporter(session, chamber, legislature)
        # close_missing: the active roster is authoritative for who holds a
        # seat TODAY, so a deputy absent from it has left the chamber and
        # their open mandate must be closed (otherwise the hemicycle and
        # every "350 diputats" count silently drifts upward substitution
        # after substitution).
        return await importer.import_payload(payload, close_missing=True)


async def import_legislature_deputies(roman: str, number: int) -> ImportStats:
    """Import the deputy roster of a concluded legislature (XIV…X).

    Uses the per-legislature snapshot dataset (``odsDiputados{NN}``) rather than
    the live active-deputies file, creating Person / Mandate / GroupMembership
    rows for a past legislature — without which a vote backfill can't attribute
    its ``vote_records`` to deputies or groups. ``number`` follows the Congreso
    convention (14 = XIV). Idempotent: ``DeputyImporter`` upserts. The legislature
    spec comes from ``_HISTORICAL_LEGISLATURES``.
    """
    spec = _HISTORICAL_LEGISLATURES.get(roman)
    if spec is None:
        raise ValueError(f"Unknown legislature {roman!r}. Add it to _HISTORICAL_LEGISLATURES.")
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        leg = await _ensure_legislature(
            session,
            chamber,
            number=roman,
            name_ca=str(spec["name_ca"]),
            name_es=str(spec["name_es"]),
            name_en=str(spec["name_en"]),
            start_iso=str(spec["start"]),
            end_iso=str(spec["end"]) if spec["end"] else None,
            status="concluded",
        )
        log.info("bootstrap.legislature_deputies.starting", legislature=roman, number=number)
        async with CongresoClient() as client:
            payload = await client.fetch_legislature_deputies(number)
        importer = DeputyImporter(session, chamber, leg)
        return await importer.import_payload(payload)


async def import_deputies_xiv() -> ImportStats:
    """Import the XIV-legislature deputy roster (Dec 2019 – Aug 2023)."""
    return await import_legislature_deputies("XIV", 14)


async def import_deputies_xiii() -> ImportStats:
    """Import the XIII-legislature deputy roster (May 2019 – Sept 2019)."""
    return await import_legislature_deputies("XIII", 13)


async def import_deputies_xii() -> ImportStats:
    """Import the XII-legislature deputy roster (Jul 2016 – Mar 2019)."""
    return await import_legislature_deputies("XII", 12)


async def import_deputies_xi() -> ImportStats:
    """Import the XI-legislature deputy roster (Jan 2016 – May 2016)."""
    return await import_legislature_deputies("XI", 11)


async def import_deputies_x() -> ImportStats:
    """Import the X-legislature deputy roster (Dec 2011 – Jan 2016)."""
    return await import_legislature_deputies("X", 10)


async def import_latest_session_votes() -> VoteImportStats | None:
    """Fetch and upsert the latest session's votes.

    Returns ``None`` if the listing page does not currently expose a session
    (e.g. between legislatures or during a long recess).
    """
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)

        async with CongresoClient() as client:
            bundle = await client.fetch_latest_session_zip()

        if bundle is None:
            log.warning("bootstrap.votes.no_session_exposed")
            return None

        log.info(
            "bootstrap.votes.starting",
            session=bundle.ref.session_number,
            date=bundle.ref.date.isoformat(),
            zip_bytes=len(bundle.zip_bytes),
        )

        importer = VoteImporter(session, chamber, legislature)
        return await importer.import_session_zip(
            session_number=bundle.ref.session_number,
            vote_date=bundle.ref.date,
            zip_bytes=bundle.zip_bytes,
            expedientes_by_vote=bundle.expedientes_by_vote,
            graphic_urls_by_vote=bundle.graphic_urls_by_vote,
        )


@dataclass(frozen=True, slots=True)
class VoteInitiativeBackfillStats:
    """Counters returned by :func:`backfill_vote_initiative_links`."""

    votes_processed: int = 0
    votes_linked: int = 0
    votes_unmatched: int = 0


# Batch size used by :func:`backfill_vote_initiative_links`. Tuned to keep
# memory bounded on legislatures with tens of thousands of votes while
# committing often enough that a transient connection drop loses at most
# this many rows of progress.
_BACKFILL_COMMIT_BATCH = 500


async def backfill_vote_initiative_links() -> VoteInitiativeBackfillStats:
    """Backfill ``votes.initiative_id`` for every vote with a known expediente.

    Scope: all :class:`Vote` rows whose ``initiative_id IS NULL`` AND
    ``expediente_raw IS NOT NULL``. Each row's ``expediente_raw`` is
    matched against the chamber's initiatives indexed by both the raw
    ``official_id`` and its 2-part stem (see
    :func:`app.ingest.congreso.parse.strip_zero_subindex`), so 2-part vote
    expedientes (``"121/000262"``) resolve against 3-part initiative ids
    (``"121/000262/0000"``).

    Idempotent: re-running picks up only the still-unlinked votes.
    Commits in batches of ``_BACKFILL_COMMIT_BATCH`` rows so a transient
    failure costs at most one batch's worth of progress.

    Series we cannot link today (PNL ``162/…``, Moción ``173/…``, RDL
    convalidation ``130/…``, constitutional reform ``102/…``) stay
    unmatched because the Congreso opendata portal does not publish those
    initiative types as bulk datasets — only ``Proyectos de Ley`` (121),
    ``Proposiciones de Ley`` (122) and ``Propuestas de Reforma`` (127) are
    exposed. See ``docs/STATUS.md`` § pending item 2.
    """
    from sqlalchemy import select as _select

    from app.ingest.congreso.parse import strip_zero_subindex
    from app.models import Initiative, Vote

    stats = VoteInitiativeBackfillStats()
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)

        # Build a one-shot lookup keyed by both the raw official_id and the
        # 2-part stem (when the sub-index is ``0000``).
        rows = (
            await session.execute(
                _select(
                    Initiative.official_id,
                    Initiative.legislature_id,
                    Initiative.id,
                ).where(Initiative.chamber_id == chamber.id)
            )
        ).all()
        # Keyed by (legislature_id, official_id): the Congreso RESETS
        # expediente numbers every term, so the same number (e.g. 130/000047)
        # names a different initiative in 2014, 2018, 2021 and 2026. Matching
        # without the legislature cross-linked votes from every term onto the
        # newest law with that number.
        index: dict[tuple[int, str], int] = {}
        for official_id, leg_id, initiative_id in rows:
            index[(leg_id, official_id)] = initiative_id
            stem = strip_zero_subindex(official_id)
            if stem != official_id:
                index.setdefault((leg_id, stem), initiative_id)

        log.info(
            "bootstrap.link_votes.starting",
            chamber=chamber.slug,
            initiative_keys=len(index),
        )

        # Stream the candidate votes through a dedicated cursor so we don't
        # materialise the entire result set in memory.
        vote_ids_and_exptes = (
            await session.execute(
                _select(Vote.id, Vote.expediente_raw, SessionRow.legislature_id)
                .join(SessionRow, SessionRow.id == Vote.session_id)
                .where(SessionRow.chamber_id == chamber.id)
                .where(Vote.initiative_id.is_(None))
                .where(Vote.expediente_raw.is_not(None))
                .order_by(Vote.id)
            )
        ).all()

        processed = linked = unmatched = 0
        for vote_id, expediente_raw, leg_id in vote_ids_and_exptes:
            processed += 1
            target_id = index.get((leg_id, expediente_raw))
            if target_id is None and expediente_raw is not None:
                target_id = index.get((leg_id, strip_zero_subindex(expediente_raw)))
            if target_id is None:
                unmatched += 1
            else:
                vote = (await session.execute(_select(Vote).where(Vote.id == vote_id))).scalar_one()
                vote.initiative_id = target_id
                linked += 1
            if processed % _BACKFILL_COMMIT_BATCH == 0:
                await session.commit()
                log.info(
                    "bootstrap.link_votes.progress",
                    processed=processed,
                    linked=linked,
                    unmatched=unmatched,
                )
        await session.commit()
        stats = VoteInitiativeBackfillStats(
            votes_processed=processed,
            votes_linked=linked,
            votes_unmatched=unmatched,
        )
        log.info("bootstrap.link_votes.done", **asdict(stats))
        return stats


_INITIATIVE_DATASETS: tuple[InitiativeDataset, ...] = (
    "government_bills",
    "parliamentary_bills",
    "statute_reforms",
)


async def import_initiatives() -> dict[str, InitiativeImportStats]:
    """Fetch and upsert initiatives from the three legislative-process datasets.

    For every initiative *newly* created in this run we trigger downstream
    enrichment: topic classification + plain-language summary in CA + ES.
    Updated rows are NOT re-enriched (prior LLM output stays in place).
    """
    from sqlalchemy import select as _select

    from app.classify.providers import build_classifier
    from app.classify.service import ClassificationService
    from app.models import Initiative
    from app.services.plain_summary import generate_plain_summary, translate_summary

    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)

        stats_by_dataset: dict[str, InitiativeImportStats] = {}
        all_new_ids: list[str] = []
        async with CongresoClient() as client:
            for dataset in _INITIATIVE_DATASETS:
                payload = await client.fetch_initiatives(dataset, fmt="json")
                importer = InitiativeImporter(session, chamber, legislature)
                result = await importer.import_payload(payload)
                stats_by_dataset[dataset] = result.stats
                all_new_ids.extend(result.new_official_ids)

        if not all_new_ids:
            return stats_by_dataset

    # First enrichment pass: download the BOCG PDFs for newly-created
    # rows and extract their "Exposición de motivos" prose into
    # ``object_text``. We do this *before* plain-language summaries so
    # those can use the prose as input — yielding much better
    # summaries than what we'd get from the legalese title alone.
    # ``backfill_initiative_objects`` scopes to ``object_text IS NULL``
    # rows globally, which is wider than ``all_new_ids`` but cheap to
    # repeat (idempotent) and ensures any previously-failed rows get a
    # retry on every fresh import.
    try:
        await backfill_initiative_objects()
    except Exception as e:
        log.warning("bootstrap.initiatives.object_text.error", error=str(e))

    # Second enrichment pass: classification + plain-language summary.
    # We open fresh sessions so the failure of one enrichment doesn't
    # roll back the upserts above.
    log.info("bootstrap.initiatives.enrich.starting", new_count=len(all_new_ids))
    classifier = build_classifier()
    enriched = 0
    summarised_ca = 0
    summarised_es = 0
    for official_id in all_new_ids:
        try:
            async with AsyncSessionLocal() as enrich_session:
                row = (
                    await enrich_session.execute(
                        _select(Initiative).where(
                            Initiative.chamber_id == chamber.id,
                            Initiative.official_id == official_id,
                        )
                    )
                ).scalar_one_or_none()
                if row is None:
                    continue
                # Topic classification
                service = ClassificationService(enrich_session, classifier)
                await service.classify_initiative(row.id)
                enriched += 1
                # Plain-language summaries, CA + ES only (the English
                # site reads the Spanish one). Same summarise-once-then-
                # translate pipeline as the bootstrap steps: summarise
                # the source into Spanish, then translate that into
                # Catalan. Two independent summaries used to fail
                # independently and leave one-language rows behind; now
                # a Catalan summary only exists alongside its Spanish
                # source, and ``repair_summary_language_gaps`` fills a
                # failed translation on its next daily run.
                # Prefer the bill's own "Exposición de motivos" prose
                # over the open-data feed's ``summary`` field (which is
                # almost always NULL): it gives the LLM a much richer
                # input to distil down to 2-3 plain-language sentences.
                body = initiative_summary_body(row, "es")
                es = await generate_plain_summary(
                    title=row.title_original, body=body, lang="es", kind=row.type
                )
                ca_text: str | None = None
                if es.text:
                    ca_text = (await translate_summary(text=es.text, target_lang="ca")).text
                row.plain_summary_es = es.text
                row.plain_summary_ca = ca_text
                row.plain_summary_provider = es.provider
                from datetime import datetime

                row.plain_summary_generated_at = datetime.now(UTC)
                await enrich_session.commit()
                summarised_ca += 1 if ca_text else 0
                summarised_es += 1 if es.text else 0
        except Exception as e:
            log.warning(
                "bootstrap.initiatives.enrich.error",
                official_id=official_id,
                error=str(e),
            )
    log.info(
        "bootstrap.initiatives.enrich.done",
        new_count=len(all_new_ids),
        classified=enriched,
        summarised_ca=summarised_ca,
        summarised_es=summarised_es,
    )
    return stats_by_dataset


async def import_initiative_objects(
    *, only_first_n: int | None = None
) -> InitiativeObjectsBackfillStats:
    """Backfill ``Initiative.object_text`` from BOCG PDFs for every NULL row.

    Idempotent: targets rows where ``object_text IS NULL`` and a
    ``source_url`` is set. 0.5 s politeness delay between fetches; per-
    row try/except so a malformed PDF never aborts the batch. See
    :func:`app.ingest.congreso.initiative_objects.backfill_initiative_objects`
    for the full contract.
    """
    return await backfill_initiative_objects(only_first_n=only_first_n)


async def import_initiative_objects_smoke() -> InitiativeObjectsBackfillStats:
    """Smoke-test variant: backfill object_text for the first 5 candidates.

    Use this before triggering a full backfill to confirm the pipeline
    works end-to-end against the live PDFs. Idempotent.
    """
    return await backfill_initiative_objects(only_first_n=5)


async def _classify_all_initiatives_by_kind(kind: str) -> dict[str, int | str]:
    """Run a classification knowledge base across every ``Initiative``.

    Uses the keyword classifier as a fallback when no LLM API key is set
    (which yields zero rows for ``kind='sdg'`` — keyword-matching is not a
    credible SDG classifier; see :class:`KeywordClassifier`). Idempotent
    per ``(initiative, classifier, kind)``: re-running replaces only that
    triple's prior rows. Switching classifiers leaves both sets in
    ``initiative_topics`` — the source is recorded in ``classified_by`` so
    the frontend can pick.

    Robust to transient provider errors (Mistral's 429 rate-limit in
    particular): each row is wrapped in try/except so a single failure
    doesn't kill the batch. A short inter-call sleep keeps us under
    Mistral's per-second budget for the free / starter tiers.
    """
    import asyncio as _asyncio

    from sqlalchemy import select as _select

    from app.classify.providers import build_classifier
    from app.classify.service import ClassificationService
    from app.models import Initiative

    # Conservative pacing: ~1 req/s well under Mistral's free-tier budget.
    inter_call_delay_s = 1.0

    async with AsyncSessionLocal() as session:
        ids = list((await session.execute(_select(Initiative.id))).scalars().all())
        log.info("bootstrap.classify.starting", count=len(ids), kind=kind)

        classifier = build_classifier()
        log.info("bootstrap.classify.provider", name=classifier.name, kind=kind)

        seen = 0
        topics_added = 0
        errors = 0
        for iid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    service = ClassificationService(inner, classifier)
                    topics_added += await service.classify_initiative(iid, kind=kind)
            except Exception as e:
                errors += 1
                log.warning(
                    "bootstrap.classify.error",
                    initiative_id=iid,
                    kind=kind,
                    error=str(e),
                )
            seen += 1
            if inter_call_delay_s > 0:
                await _asyncio.sleep(inter_call_delay_s)
        log.info(
            "bootstrap.classify.done",
            kind=kind,
            seen=seen,
            topics_added=topics_added,
            errors=errors,
        )
        return {
            "kind": kind,
            "initiatives_seen": seen,
            "topics_assigned": topics_added,
            "errors": errors,
        }


async def classify_all_initiatives() -> dict[str, int | str]:
    """Classify every Initiative against the editorial 17-topic taxonomy.

    Thin wrapper around :func:`_classify_all_initiatives_by_kind` so the
    bootstrap CLI keeps its short, stable ``classify`` entry point.
    """
    return await _classify_all_initiatives_by_kind("theme")


async def classify_initiatives_by_sdg() -> dict[str, int | str]:
    """Classify every Initiative against the 17 UN SDGs.

    Mirrors :func:`classify_all_initiatives` but feeds the SDG taxonomy +
    SDG system prompt to the configured classifier. With Mistral Small as
    the provider, ~430 calls cost on the order of €0.20 — negligible — and
    the run is idempotent, so re-runs are cheap and safe.
    """
    return await _classify_all_initiatives_by_kind("sdg")


async def backfill_legislature_xv(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature XV.

    Drives the votaciones portlet at
    ``?targetLegislatura=XV&targetDate=DD/MM/YYYY`` for every date in the
    portlet's inlined ``diasVotaciones`` array. Each per-date listing
    yields a per-session ZIP URL plus the same expediente / graphic URL
    metadata the latest-session pipeline consumes. Rate-limited 1 req/s.

    Idempotent: dates already in the DB are skipped, and re-running upserts
    existing rows.

    Args:
        only_first_n: process at most this many dates from the calendar.
            ``None`` (default) processes the full set. Set to a small
            integer (5-10) for smoke tests before a full run.
    """
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)
        log.info(
            "bootstrap.backfill.starting",
            chamber=chamber.slug,
            legislature=legislature.number,
            only_first_n=only_first_n,
        )
        return await backfill_legislature(
            db_session=session,
            chamber=chamber,
            legislature=legislature,
            legislature_id="XV",
            only_first_n=only_first_n,
        )


async def backfill_legislature_xv_smoke() -> BackfillStats:
    """Smoke-test variant: backfill the first 5 unimported XV plenary dates.

    Use this before triggering a full backfill to confirm the pipeline
    works end-to-end against the live DB. Idempotent.
    """
    return await backfill_legislature_xv(only_first_n=5)


async def _ensure_legislature(
    session: AsyncSession,
    chamber: Chamber,
    *,
    number: str,
    name_ca: str,
    name_es: str,
    name_en: str,
    start_iso: str,
    end_iso: str | None,
    status: str,
) -> Legislature:
    """Find or create a Legislature row for an arbitrary roman number.

    Used by historical backfills (XIV, XIII, …) to give imported sessions
    a stable FK target. Idempotent: re-running returns the same row.
    """
    from datetime import date as _date

    existing = (
        await session.execute(
            select(Legislature).where(
                Legislature.chamber_id == chamber.id, Legislature.number == number
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    leg = Legislature(
        chamber_id=chamber.id,
        number=number,
        name_ca=name_ca,
        name_es=name_es,
        name_en=name_en,
        start_date=_date.fromisoformat(start_iso),
        end_date=_date.fromisoformat(end_iso) if end_iso else None,
        status=status,
    )
    session.add(leg)
    await session.commit()
    await session.refresh(leg)
    log.info(
        "bootstrap.legislature.created",
        number=number,
        status=status,
    )
    return leg


# Historical legislature spec — Spanish Congress dates from official records.
# These are the parliaments whose vote portlet ``diasVotaciones`` array we
# can scrape via the same pattern as XV.
_HISTORICAL_LEGISLATURES: dict[str, dict[str, str | None]] = {
    "XIV": {
        "name_ca": "XIV legislatura",
        "name_es": "XIV legislatura",
        "name_en": "14th legislature",
        "start": "2019-12-03",
        "end": "2023-08-16",
    },
    "XIII": {
        "name_ca": "XIII legislatura",
        "name_es": "XIII legislatura",
        "name_en": "13th legislature",
        "start": "2019-05-21",
        "end": "2019-09-24",
    },
    "XII": {
        "name_ca": "XII legislatura",
        "name_es": "XII legislatura",
        "name_en": "12th legislature",
        "start": "2016-07-19",
        "end": "2019-03-05",
    },
    "XI": {
        "name_ca": "XI legislatura",
        "name_es": "XI legislatura",
        "name_en": "11th legislature",
        "start": "2016-01-13",
        "end": "2016-05-03",
    },
    "X": {
        "name_ca": "X legislatura",
        "name_es": "X legislatura",
        "name_en": "10th legislature",
        "start": "2011-12-13",
        "end": "2016-01-12",
    },
}


async def _backfill_historical(roman: str, *, only_first_n: int | None = None) -> BackfillStats:
    """Generic historical-legislature backfill driver.

    Looks up (or creates) the Legislature row, then runs the same
    ``backfill_legislature`` driver as XV. The Roman numeral is what's
    passed to the votaciones portlet's ``targetLegislatura`` param.
    """
    spec = _HISTORICAL_LEGISLATURES.get(roman)
    if spec is None:
        raise ValueError(f"Unknown legislature {roman!r}. Add it to _HISTORICAL_LEGISLATURES.")
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        leg = await _ensure_legislature(
            session,
            chamber,
            number=roman,
            name_ca=str(spec["name_ca"]),
            name_es=str(spec["name_es"]),
            name_en=str(spec["name_en"]),
            start_iso=str(spec["start"]),
            end_iso=str(spec["end"]) if spec["end"] else None,
            status="concluded",
        )
        log.info(
            "bootstrap.backfill.starting",
            chamber=chamber.slug,
            legislature=leg.number,
            only_first_n=only_first_n,
        )
        return await backfill_legislature(
            db_session=session,
            chamber=chamber,
            legislature=leg,
            legislature_id=roman,
            only_first_n=only_first_n,
        )


async def backfill_legislature_xiv(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature XIV (Dec 2019 – Aug 2023)."""
    return await _backfill_historical("XIV", only_first_n=only_first_n)


async def backfill_legislature_xiii(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature XIII (May 2019 – Sept 2019)."""
    return await _backfill_historical("XIII", only_first_n=only_first_n)


async def backfill_legislature_xii(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature XII (Jul 2016 – Mar 2019)."""
    return await _backfill_historical("XII", only_first_n=only_first_n)


async def backfill_legislature_xi(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature XI (Jan 2016 – May 2016)."""
    return await _backfill_historical("XI", only_first_n=only_first_n)


async def backfill_legislature_x(*, only_first_n: int | None = None) -> BackfillStats:
    """Backfill every plenary-vote session of legislature X (Dec 2011 – Jan 2016)."""
    return await _backfill_historical("X", only_first_n=only_first_n)


async def import_hemicycle_xv() -> HemicycleImportStats:
    """Fetch the hemicycle image-map and persist seat positions per Person.

    Re-running is idempotent: it overwrites ``seat_x`` / ``seat_y`` for
    every matched person against the current snapshot of the page.
    Re-run whenever a deputy is substituted in mid-legislature — the
    Mesa reassigns the vacated seat and the rest of the layout is
    typically stable until the next general election.

    See :mod:`app.ingest.congreso.hemicycle` for the data shape and
    matching strategy.
    """
    async with AsyncSessionLocal() as session:
        return await import_hemicycle_seats(session=session)


async def enrich_deputy_photos() -> PhotoBackfillStats:
    """Probe the Congreso website for each deputy's codParlamentario + photo URL.

    One-shot; takes ~2 minutes at 0.2s/request × 600 codes. Re-run after a
    new mandate cycle. See ``app.ingest.congreso.photos`` for licensing.
    """
    async with AsyncSessionLocal() as session:
        return await backfill_photos(session=session)


async def generate_all_plain_summaries(lang: str = "ca") -> dict[str, int | str]:
    """Generate plain-language summaries for every initiative that lacks one.

    ``lang`` ∈ {``"ca"``, ``"es"``} — selects which column we fill. The
    function only processes initiatives where the target column is NULL,
    so re-running is idempotent and refilling another language doesn't
    overwrite the first.

    A single transient timeout no longer kills the batch (try/except per
    row); rows that errored stay NULL and the next run picks them up.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative
    from app.services.plain_summary import generate_plain_summary

    target_col_name = f"plain_summary_{lang}"
    if not hasattr(Initiative, target_col_name):
        raise ValueError(f"Unsupported lang for plain summary: {lang!r}")
    target_col = getattr(Initiative, target_col_name)

    async with AsyncSessionLocal() as session:
        ids = list(
            (await session.execute(_select(Initiative.id).where(target_col.is_(None))))
            .scalars()
            .all()
        )
        log.info("bootstrap.plain_summary.starting", lang=lang, count=len(ids))

        ok = insufficient = errors = 0
        for iid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (
                        await inner.execute(_select(Initiative).where(Initiative.id == iid))
                    ).scalar_one()
                    # Prefer the bill's own preamble prose over the
                    # mostly-NULL ``summary`` field; see comment in
                    # ``import_initiatives``.
                    body = initiative_summary_body(row, lang)
                    result = await generate_plain_summary(
                        title=row.title_original, body=body, lang=lang, kind=row.type
                    )
                    setattr(row, target_col_name, result.text)
                    # We only update provider/generated_at when we got a
                    # real summary OR when there wasn't one for any lang
                    # yet — auditing the LATEST attempt is enough.
                    if result.text or row.plain_summary_provider is None:
                        row.plain_summary_provider = result.provider
                        row.plain_summary_generated_at = datetime.now(UTC)
                    await inner.commit()
                    if result.text:
                        ok += 1
                    else:
                        insufficient += 1
            except Exception as e:
                errors += 1
                log.warning(
                    "plain_summary.error",
                    initiative_id=iid,
                    lang=lang,
                    error=str(e),
                )
            await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)
        return {
            "lang": lang,
            "seen": len(ids),
            "summarised": ok,
            "insufficient": insufficient,
            "errors": errors,
        }


async def generate_all_plain_summaries_es() -> dict[str, int | str]:
    """Bootstrap-friendly alias for the Spanish run."""
    return await generate_all_plain_summaries(lang="es")


async def translate_initiative_summaries_ca_from_es() -> dict[str, int | str]:
    """Fill the Catalan summary by translating the Spanish one.

    The cheap half of the summarise-once-then-translate pipeline: instead
    of re-reading the full bill text to produce a Catalan summary, we
    translate the short Spanish summary we already generated. Run AFTER
    ``plain_summaries_es``.

    Targets initiatives where ``plain_summary_es IS NOT NULL`` and
    ``plain_summary_ca IS NULL``. Idempotent and per-row guarded, so a
    transient failure just leaves that row for the next run.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative
    from app.services.plain_summary import translate_summary

    async with AsyncSessionLocal() as session:
        ids = list(
            (
                await session.execute(
                    _select(Initiative.id).where(
                        Initiative.plain_summary_es.is_not(None),
                        Initiative.plain_summary_ca.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        log.info("bootstrap.translate_summary.starting", target="ca", count=len(ids))

        ok = insufficient = errors = 0
        for iid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (
                        await inner.execute(_select(Initiative).where(Initiative.id == iid))
                    ).scalar_one()
                    source = row.plain_summary_es
                    if not source:
                        continue
                    result = await translate_summary(text=source, target_lang="ca")
                    row.plain_summary_ca = result.text
                    if result.text or row.plain_summary_provider is None:
                        row.plain_summary_provider = result.provider
                        row.plain_summary_generated_at = datetime.now(UTC)
                    await inner.commit()
                    if result.text:
                        ok += 1
                    else:
                        insufficient += 1
            except Exception as e:
                errors += 1
                log.warning("translate_summary.error", initiative_id=iid, target="ca", error=str(e))
            await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)
        log.info(
            "bootstrap.translate_summary.done",
            target="ca",
            seen=len(ids),
            translated=ok,
            insufficient=insufficient,
            errors=errors,
        )
        return {
            "target": "ca",
            "seen": len(ids),
            "translated": ok,
            "insufficient": insufficient,
            "errors": errors,
        }


# Minimum description length we'll feed to the LLM. Below this floor the
# text is almost certainly a procedural label ("Proposiciones no de Ley.")
# and the model would just hallucinate. 60 chars matches what we see in
# the few well-formed orphan-vote descriptions today.
_VOTE_DESCRIPTION_MIN_LEN = 60

# Inter-call pacing for the summary/translate batches — ~1 req/s keeps us
# under Mistral's free-tier budget so a full run doesn't get throttled
# into a retry-storm. Matches the classifier's own pacing.
# Extra pause between rows, ON TOP of the process-wide spacing in
# llm_http (``Settings.llm_min_interval_s``). It exists because the two were
# written months apart; keeping it at 0 leaves ONE knob for the rate, which
# is what a per-model limit needs:
#
#   ministral-14b       120 req/min   → 0.5 s
#   mistral-small       100 req/min   → 0.65 s
#   mistral-large        15 req/min   → 4.2 s
#
# Read from the environment so a bulk run can be paced without a deploy.
_LLM_INTER_CALL_DELAY_S = float(os.environ.get("LLM_ROW_DELAY_S", "0"))


async def generate_vote_plain_summaries(
    lang: str = "ca", *, limit: int | None = None
) -> dict[str, int | str]:
    """Generate plain-language summaries for *votes* that lack one.

    Mirrors :func:`generate_all_plain_summaries` but operates on the
    ``votes`` table for rows whose ``initiative_id IS NULL`` workflow
    means the API has nothing to fall back on. Specifically targets
    every vote where:

    - the language-specific column is NULL **and**
    - ``description`` is non-NULL **and**
    - ``length(description) > 60`` (skips procedural-label rows).

    Idempotent: rows already populated for ``lang`` are skipped, so
    re-running picks up failures and leaves successes untouched.

    Per-row try/except — a single LLM hiccup doesn't kill the batch.

    ``limit`` caps one run and is what the daily cron uses: the archive
    holds 16k votes across six legislatures, so an uncapped pass would
    queue thousands of LLM calls. Newest first, because an unexplained
    vote hurts most on the day it is on the front page — the older tail
    is reached run by run, or in one manual pass with ``limit=None``.
    """
    from datetime import datetime

    from sqlalchemy import func as _func
    from sqlalchemy import select as _select

    from app.models import Vote
    from app.services.plain_summary import VOTE_KIND, generate_plain_summary

    target_col_name = f"plain_summary_{lang}"
    if not hasattr(Vote, target_col_name):
        raise ValueError(f"Unsupported lang for plain summary: {lang!r}")
    target_col = getattr(Vote, target_col_name)

    async with AsyncSessionLocal() as session:
        stmt = (
            _select(Vote.id)
            .where(
                target_col.is_(None),
                Vote.description.is_not(None),
                _func.length(Vote.description) > _VOTE_DESCRIPTION_MIN_LEN,
            )
            .order_by(Vote.voted_at.desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        ids = list((await session.execute(stmt)).scalars().all())
        log.info("vote_plain_summary.starting", lang=lang, count=len(ids), limit=limit)

        ok = insufficient = errors = 0
        for vid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (await inner.execute(_select(Vote).where(Vote.id == vid))).scalar_one()
                    result = await generate_plain_summary(
                        title=row.title,
                        body=row.description,
                        lang=lang,
                        # A vote is not the law behind it. Without this the
                        # law prompt was used and the model wrote "Modifica
                        # la ley…" about a vote that decided whether to keep
                        # a decree alive.
                        kind=VOTE_KIND,
                    )
                    setattr(row, target_col_name, result.text)
                    # Match the initiative-side rule: refresh the audit
                    # metadata when we got a real summary, or when nothing
                    # has been recorded yet for this row.
                    if result.text or row.plain_summary_provider is None:
                        row.plain_summary_provider = result.provider
                        row.plain_summary_generated_at = datetime.now(UTC)
                    await inner.commit()
                    if result.text:
                        ok += 1
                    else:
                        insufficient += 1
            except Exception as e:
                errors += 1
                log.warning(
                    "vote_plain_summary.error",
                    vote_id=vid,
                    lang=lang,
                    error=str(e),
                )
            await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)
        log.info(
            "vote_plain_summary.done",
            lang=lang,
            seen=len(ids),
            summarised=ok,
            insufficient=insufficient,
            errors=errors,
        )
        return {
            "lang": lang,
            "seen": len(ids),
            "summarised": ok,
            "insufficient": insufficient,
            "errors": errors,
        }


async def _translate_missing_summaries(model: type[Any], *, target_lang: str) -> dict[str, int]:
    """Translate the summary into ``target_lang`` for rows that only have the other language.

    Works on any table with ``plain_summary_ca`` / ``plain_summary_es``
    columns (initiatives and votes). Targets rows where the source
    language is set and the target is NULL; per-row guarded, so a
    failure just leaves that row for the next run.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.services.llm_http import LLMUnavailableError
    from app.services.plain_summary import translate_summary

    source_attr = "plain_summary_es" if target_lang == "ca" else "plain_summary_ca"
    target_attr = f"plain_summary_{target_lang}"

    async with AsyncSessionLocal() as session:
        ids = list(
            (
                await session.execute(
                    _select(model.id).where(
                        getattr(model, source_attr).is_not(None),
                        getattr(model, target_attr).is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )

    ok = insufficient = errors = aborted = 0
    for row_id in ids:
        try:
            async with AsyncSessionLocal() as inner:
                row = (await inner.execute(_select(model).where(model.id == row_id))).scalar_one()
                source = getattr(row, source_attr)
                if not source:
                    continue
                result = await translate_summary(text=source, target_lang=target_lang)
                setattr(row, target_attr, result.text)
                if result.text or row.plain_summary_provider is None:
                    row.plain_summary_provider = result.provider
                    row.plain_summary_generated_at = datetime.now(UTC)
                await inner.commit()
                if result.text:
                    ok += 1
                else:
                    insufficient += 1
        except LLMUnavailableError as e:
            # Zero quota: every remaining row would fail the same way, so
            # stop and leave them for the next daily run.
            log.error("summary_gap.llm_unavailable", target=target_lang, error=str(e))
            aborted = 1
            break
        except Exception as e:
            errors += 1
            log.warning(
                "summary_gap.translate_error", row_id=row_id, target=target_lang, error=str(e)
            )
        await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)
    return {
        "seen": len(ids),
        "translated": ok,
        "insufficient": insufficient,
        "errors": errors,
        "aborted": aborted,
    }


def initiative_summary_body(row: Initiative, lang: str = "es") -> str | None:
    """What the summary model reads for ``row``: its text's measures first."""
    from app.services.plain_summary import summary_input_body

    return summary_input_body(
        text_points=row.text_points, object_text=row.object_text, summary=row.summary, lang=lang
    )


async def rewrite_initiative_summary(row: Initiative, *, lang_source: str = "es") -> bool:
    """Rewrite ``row``'s summary, its translation and both headlines, in place.

    The input is :func:`initiative_summary_body`, so a bill whose text has
    been read is summarised from its measures. Returns ``False`` and leaves
    the row alone when the model declines or the neutrality guard rejects the
    new summary: a worse version is still better than an empty page. When
    only the translation fails, the other language's summary and headline
    are cleared rather than left saying something the new one no longer
    says; ``repair_summary_language_gaps`` and ``backfill_plain_titles``
    fill them on their next run. The caller commits.

    The translation runs on the large model, like every
    :func:`translate_summary` call.
    """
    from datetime import datetime

    from app.services.plain_summary import (
        generate_plain_summary,
        generate_plain_title,
        translate_summary,
    )

    target_lang = "ca" if lang_source == "es" else "es"
    fresh = await generate_plain_summary(
        title=row.title_original,
        body=initiative_summary_body(row, lang_source),
        lang=lang_source,
        kind=row.type,
    )
    if not fresh.text:
        return False

    setattr(row, f"plain_summary_{lang_source}", fresh.text)
    title = await generate_plain_title(summary=fresh.text, lang=lang_source)
    setattr(row, f"plain_title_{lang_source}", title.text)

    translated = await translate_summary(text=fresh.text, target_lang=target_lang)
    setattr(row, f"plain_summary_{target_lang}", translated.text)
    other_title: str | None = None
    if translated.text:
        other_title = (await generate_plain_title(summary=translated.text, lang=target_lang)).text
    setattr(row, f"plain_title_{target_lang}", other_title)

    row.plain_summary_provider = fresh.provider
    row.plain_summary_generated_at = datetime.now(UTC)
    return True


async def regenerate_initiative_summaries(
    *, limit: int | None = None, lang_source: str = "es"
) -> dict[str, int | str]:
    """Rewrite summary, translation and both headlines for initiatives, in place.

    A one-off for the day the model or the prompt changes: the daily jobs
    only ever touch NULL columns, so nothing would otherwise revisit the
    1.5k summaries written by an older model.

    Every row is done end to end inside one transaction — Spanish summary,
    Catalan translation, both headlines — so a reader never meets a law with
    half its text missing. A row is only overwritten when the new summary
    comes back valid; a rejection leaves the old one alone, because a worse
    version is still better than an empty page.
    """
    from sqlalchemy import select as _select

    from app.core.config import get_settings
    from app.services.plain_summary import _provider_name

    stats: dict[str, int | str] = {"seen": 0, "rewritten": 0, "kept": 0, "errors": 0}
    # Rows this model has already rewritten are skipped, so the pass resumes
    # where it stopped instead of paying for the same six hours twice.
    provider = _provider_name(get_settings())
    stats["provider"] = provider

    async with AsyncSessionLocal() as session:
        stmt = (
            _select(Initiative.id)
            .where(
                getattr(Initiative, f"plain_summary_{lang_source}").is_not(None),
                Initiative.plain_summary_provider.is_distinct_from(provider),
            )
            .order_by(Initiative.id.desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        ids = list((await session.execute(stmt)).scalars().all())

    log.info("initiative_resummary.starting", count=len(ids))
    for iid in ids:
        stats["seen"] = int(stats["seen"]) + 1
        try:
            async with AsyncSessionLocal() as inner:
                row = (
                    await inner.execute(_select(Initiative).where(Initiative.id == iid))
                ).scalar_one()
                if not await rewrite_initiative_summary(row, lang_source=lang_source):
                    stats["kept"] = int(stats["kept"]) + 1
                    continue
                await inner.commit()
                stats["rewritten"] = int(stats["rewritten"]) + 1
        except Exception as e:
            stats["errors"] = int(stats["errors"]) + 1
            log.warning("initiative_resummary.error", initiative_id=iid, error=str(e))
        await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)

    log.info("initiative_resummary.done", **stats)
    return stats


async def generate_plain_titles(
    *, lang: str = "es", limit: int | None = None
) -> dict[str, int | str]:
    """Write the one-line headline for rows that have a summary but no title.

    Separate from the summary generation on purpose: it is idempotent, it
    catches the ~1.5k summaries written before the field existed, and it
    costs almost nothing — the model reads our own short summary instead of
    re-reading a 2.700-token bill.

    Per-row try/except, newest first, capped like the summary job.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative, Vote
    from app.services.plain_summary import generate_plain_title

    summary_attr = f"plain_summary_{lang}"
    title_attr = f"plain_title_{lang}"
    totals: dict[str, int | str] = {"lang": lang, "titled": 0, "skipped": 0, "errors": 0}

    for model, order_col in ((Vote, "voted_at"), (Initiative, "id")):
        if not hasattr(model, title_attr):
            raise ValueError(f"Unsupported lang for plain title: {lang!r}")
        async with AsyncSessionLocal() as session:
            stmt = (
                _select(model.id)
                .where(
                    getattr(model, summary_attr).is_not(None),
                    getattr(model, title_attr).is_(None),
                )
                .order_by(getattr(model, order_col).desc())
            )
            if limit is not None:
                stmt = stmt.limit(limit)
            ids = list((await session.execute(stmt)).scalars().all())

        log.info("plain_title.starting", lang=lang, table=model.__tablename__, count=len(ids))
        for row_id in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (
                        await inner.execute(_select(model).where(model.id == row_id))
                    ).scalar_one()
                    source = getattr(row, summary_attr)
                    if not source:
                        continue
                    result = await generate_plain_title(summary=source, lang=lang)
                    if result.text:
                        setattr(row, title_attr, result.text)
                        # The loop is generic over Initiative and Vote; mypy
                        # only sees their common Base, which has no columns.
                        row.plain_summary_generated_at = datetime.now(  # type: ignore[attr-defined]
                            UTC
                        )
                        await inner.commit()
                        totals["titled"] = int(totals["titled"]) + 1
                    else:
                        totals["skipped"] = int(totals["skipped"]) + 1
            except Exception as e:
                totals["errors"] = int(totals["errors"]) + 1
                log.warning("plain_title.error", row_id=row_id, lang=lang, error=str(e))
            await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)

    log.info("plain_title.done", **totals)
    return totals


async def repair_summary_language_gaps() -> dict[str, dict[str, int]]:
    """Make every plain summary exist in both Catalan and Spanish.

    The site is bilingual for summaries (the English locale reads the
    Spanish one), so a row with only one language shows a summary in one
    locale and the raw official title in the other. This fills each gap
    by translating the language that does exist: cheap (one short LLM
    call per gap), idempotent, and a near no-op once the backlog is
    clear. Scheduled daily after the morning ingests.
    """
    from app.models import Initiative, Vote

    result = {
        "initiatives_ca": await _translate_missing_summaries(Initiative, target_lang="ca"),
        "votes_ca": await _translate_missing_summaries(Vote, target_lang="ca"),
        "initiatives_es": await _translate_missing_summaries(Initiative, target_lang="es"),
        "votes_es": await _translate_missing_summaries(Vote, target_lang="es"),
    }
    log.info("summary_gap.done", **result)
    return result


async def normalise_audiences_all() -> dict[str, int]:
    """Rewrite every stored ``affected_audiences`` into canonical tags.

    The extractor now normalises on the way in, but ~1.5k initiatives were
    tagged before that, so the filter offered "administracions públiques"
    and "administració pública" as separate collectives. One pass, idempotent:
    re-running it changes nothing once the rows are canonical.
    """
    from app.db.session import AsyncSessionLocal
    from app.models import Initiative
    from app.services.affected import normalise_audience_tags

    stats = {"seen": 0, "changed": 0}
    async with AsyncSessionLocal() as session:
        rows = (
            (
                await session.execute(
                    select(Initiative).where(Initiative.affected_audiences.is_not(None))
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            data = row.affected_audiences
            if not isinstance(data, dict):
                continue
            stats["seen"] += 1
            before = {lang: list(data.get(lang) or []) for lang in ("ca", "es")}
            after = {
                lang: normalise_audience_tags([t for t in before[lang] if isinstance(t, str)])
                for lang in ("ca", "es")
            }
            if after != before:
                row.affected_audiences = after
                stats["changed"] += 1
        await session.commit()
    log.info("audiences.normalised", **stats)
    return stats


async def summarise_pending_initiatives(limit: int = 100) -> dict[str, int]:
    """Plain summaries for initiatives that have official text but no summary.

    Daily companion of ``motion_texts``: once a PNL's BOCG text lands, this
    writes its summary (Spanish from the text, with the prompt for its type,
    then Catalan translated from it). Newest first, capped per run for the
    free LLM plan, and stops at a zero quota.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Initiative
    from app.services.llm_http import LLMUnavailableError
    from app.services.plain_summary import generate_plain_summary, translate_summary

    async with AsyncSessionLocal() as session:
        ids = list(
            (
                await session.execute(
                    _select(Initiative.id)
                    .where(
                        Initiative.plain_summary_es.is_(None),
                        Initiative.object_text.is_not(None),
                    )
                    .order_by(Initiative.id.desc())
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )

    ok = insufficient = errors = 0
    for iid in ids:
        try:
            async with AsyncSessionLocal() as inner:
                row = (
                    await inner.execute(_select(Initiative).where(Initiative.id == iid))
                ).scalar_one()
                es = await generate_plain_summary(
                    title=row.title_original, body=row.object_text, lang="es", kind=row.type
                )
                ca_text: str | None = None
                if es.text:
                    ca_text = (await translate_summary(text=es.text, target_lang="ca")).text
                row.plain_summary_es = es.text
                row.plain_summary_ca = ca_text
                row.plain_summary_provider = es.provider
                row.plain_summary_generated_at = datetime.now(UTC)
                await inner.commit()
                if es.text:
                    ok += 1
                else:
                    insufficient += 1
        except LLMUnavailableError as e:
            log.error("summarise_pending.llm_unavailable", error=str(e))
            break
        except Exception as e:
            errors += 1
            log.warning("summarise_pending.error", initiative_id=iid, error=str(e))
    result = {"seen": len(ids), "summarised": ok, "insufficient": insufficient, "errors": errors}
    log.info("summarise_pending.done", **result)
    return result


async def enrich_motion_texts_all() -> dict[str, int]:
    """Backfill: BOCG text for every current-legislature PNL / motion without it."""
    from app.ingest.congreso.motion_texts import enrich_motion_texts

    return await enrich_motion_texts(limit=5000)


async def generate_vote_plain_summaries_es() -> dict[str, int | str]:
    """Bootstrap-friendly alias for the Spanish run on votes."""
    return await generate_vote_plain_summaries(lang="es")


async def translate_vote_summaries_ca_from_es() -> dict[str, int | str]:
    """Fill the Catalan vote summary by translating the Spanish one.

    Vote-side counterpart to
    :func:`translate_initiative_summaries_ca_from_es`. Run AFTER
    ``vote_plain_summaries_es``. Targets votes where
    ``plain_summary_es IS NOT NULL`` and ``plain_summary_ca IS NULL``.
    """
    from datetime import datetime

    from sqlalchemy import select as _select

    from app.models import Vote
    from app.services.plain_summary import translate_summary

    async with AsyncSessionLocal() as session:
        ids = list(
            (
                await session.execute(
                    _select(Vote.id).where(
                        Vote.plain_summary_es.is_not(None),
                        Vote.plain_summary_ca.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        log.info("vote_translate_summary.starting", target="ca", count=len(ids))

        ok = insufficient = errors = 0
        for vid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (await inner.execute(_select(Vote).where(Vote.id == vid))).scalar_one()
                    source = row.plain_summary_es
                    if not source:
                        continue
                    result = await translate_summary(text=source, target_lang="ca")
                    row.plain_summary_ca = result.text
                    if result.text or row.plain_summary_provider is None:
                        row.plain_summary_provider = result.provider
                        row.plain_summary_generated_at = datetime.now(UTC)
                    await inner.commit()
                    if result.text:
                        ok += 1
                    else:
                        insufficient += 1
            except Exception as e:
                errors += 1
                log.warning("vote_translate_summary.error", vote_id=vid, target="ca", error=str(e))
            await asyncio.sleep(_LLM_INTER_CALL_DELAY_S)
        log.info(
            "vote_translate_summary.done",
            target="ca",
            seen=len(ids),
            translated=ok,
            insufficient=insufficient,
            errors=errors,
        )
        return {
            "target": "ca",
            "seen": len(ids),
            "translated": ok,
            "insufficient": insufficient,
            "errors": errors,
        }


async def import_upcoming_agenda() -> AgendaImportStats:
    """Fetch the calendar + next orden del día PDF and upsert scheduled rows.

    Source: ``https://www.congreso.es/es/calendario-de-sesiones-plenarias`` and
    the per-session ``/backoffice_doc/atp/orden_dia/pleno_<NNN>_<DDMMYYYY>.pdf``
    URL the calendar links to. See ``docs/upcoming-votes-source.md``.

    The function commits within :class:`AgendaImporter`. It is safe to run
    repeatedly; idempotent on ``(chamber, legislature, session_number)``.
    Sessions that disappear from the calendar between runs are flipped to
    ``cancelled``.
    """
    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)

        async with CongresoClient() as client:
            html = await client.fetch_calendar_html()
            calendar = parse_calendar_html(html)
            orden = None
            if calendar.next_pdf_url is not None:
                pdf_bytes = await client.fetch_orden_del_dia_pdf(calendar.next_pdf_url)
                try:
                    orden = parse_orden_del_dia_pdf(pdf_bytes)
                except ValueError as e:
                    # Some PDFs (e.g. extraordinary "PUNTO ÚNICO" sessions
                    # with no proper header) may not parse. We still record
                    # the calendar markers; re-run will pick them up later.
                    log.warning(
                        "bootstrap.agenda.pdf_unparseable",
                        url=calendar.next_pdf_url,
                        error=str(e),
                    )

        log.info(
            "bootstrap.agenda.starting",
            next_pdf_url=calendar.next_pdf_url,
            next_session_number=calendar.next_pdf_session_number,
            plenary_days=len(calendar.plenary_days),
            items=len(orden.items) if orden else 0,
        )
        importer = AgendaImporter(session, chamber, legislature)
        return await importer.import_calendar(calendar, orden)


async def send_weekly_digest_now(
    period_days: int = 7, dry_run: bool = True
) -> dict[str, int | str]:
    """Manual trigger for the weekly digest, runnable from the bootstrap CLI.

    Defaults to ``dry_run=True`` because this entrypoint is meant for
    humans verifying that the pipeline works end-to-end. Pass
    ``dry_run=False`` (or use ``send_weekly_digest_now_send``) to
    actually fire the campaign — but **don't do that during
    development**, per the brief.

    Wraps the synchronous RQ ``send_weekly_digest`` job in a thin
    coroutine so the bootstrap CLI can ``asyncio.run`` it like every
    other step. The job itself runs its own ``asyncio.run`` internally;
    we hop out and back in via ``asyncio.to_thread`` to keep that
    isolated.
    """
    from app.workers.jobs import send_weekly_digest

    log.info("bootstrap.newsletter.dispatch", period_days=period_days, dry_run=dry_run)
    return await asyncio.to_thread(send_weekly_digest, period_days=period_days, dry_run=dry_run)


async def send_weekly_digest_now_send() -> dict[str, int | str]:
    """Manual trigger that actually sends. Use only after a successful dry-run."""
    return await send_weekly_digest_now(dry_run=False)


async def send_weekly_digest_preview_30() -> dict[str, int | str]:
    """30-day-window dry-run — useful when the past 7 days are empty (recess)."""
    return await send_weekly_digest_now(period_days=30, dry_run=True)


async def _run_all() -> None:
    await import_active_deputies()
    await import_initiatives()
    await import_latest_session_votes()


async def _enrich_wikidata_step() -> dict[str, int]:
    """Bootstrap entry — run the Wikidata enrichment once.

    Same code path as the recurring worker job; we just expose it as
    a one-shot via the CLI so an operator can backfill or rerun
    after a schema change without waiting for the cron.
    """
    from app.ingest.wikidata import enrich_persons_from_wikidata

    async with AsyncSessionLocal() as session:
        return await enrich_persons_from_wikidata(session)


async def _enrich_boe_step() -> dict[str, int]:
    """Bootstrap entry — run the BOE matcher once."""
    from app.ingest.boe import enrich_initiatives_with_boe

    async with AsyncSessionLocal() as session:
        return await enrich_initiatives_with_boe(session)


async def _enrich_wikipedia_step() -> dict[str, int]:
    """Bootstrap entry — fetch Wikipedia summary extracts for every
    person with a Wikipedia URL set but no extract yet.
    """
    from app.ingest.wikipedia import enrich_persons_wikipedia

    async with AsyncSessionLocal() as session:
        return await enrich_persons_wikipedia(session)


async def _reset_boe_step() -> dict[str, int]:
    """Bootstrap entry — clear every BOE match so the next enrichment
    re-runs from scratch.

    Useful after a matcher-logic change (e.g. tightening the ambito
    filter or lowering the score threshold) so existing rows are
    re-evaluated against the new rules. Operates only on rows that
    have a non-NULL ``boe_id``; rows that were already empty are
    left alone.
    """
    from sqlalchemy import update

    from app.models import Initiative

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            update(Initiative)
            .where(Initiative.boe_id.is_not(None))
            .values(boe_id=None, boe_url=None, boe_entry_in_force=None)
        )
        await session.commit()
        reset_count = getattr(result, "rowcount", 0) or 0
        return {"reset": int(reset_count)}


_STEPS = {
    "deputies": import_active_deputies,
    "deputies_xiv": import_deputies_xiv,
    "deputies_xiii": import_deputies_xiii,
    "deputies_xii": import_deputies_xii,
    "deputies_xi": import_deputies_xi,
    "deputies_x": import_deputies_x,
    "initiatives": import_initiatives,
    "enrich_wikidata": _enrich_wikidata_step,
    "enrich_boe": _enrich_boe_step,
    "enrich_wikipedia": _enrich_wikipedia_step,
    "reset_boe": _reset_boe_step,
    "pnl_xv": import_pnl_xv,
    "mocion_xv": import_mocion_xv,
    "rdl_xv": import_rdl_convalidacion_xv,
    "rdl_convalidacion_xv": import_rdl_convalidacion_xv,
    "reforma_xv": import_reforma_constitucional_xv,
    "reforma_constitucional_xv": import_reforma_constitucional_xv,
    "latest_votes": import_latest_session_votes,
    "link_votes_xv": backfill_vote_initiative_links,
    "backfill_vote_initiative_links": backfill_vote_initiative_links,
    "backfill_xv": backfill_legislature_xv,
    "backfill_legislature_xv": backfill_legislature_xv,
    "backfill_xv_smoke": backfill_legislature_xv_smoke,
    "backfill_xiv": backfill_legislature_xiv,
    "backfill_xiii": backfill_legislature_xiii,
    "backfill_xii": backfill_legislature_xii,
    "backfill_xi": backfill_legislature_xi,
    "backfill_x": backfill_legislature_x,
    "photos": enrich_deputy_photos,
    "hemicycle_xv": import_hemicycle_xv,
    "initiative_objects": import_initiative_objects,
    "initiative_objects_smoke": import_initiative_objects_smoke,
    "classify": classify_all_initiatives,
    "classify_initiatives_by_sdg": classify_initiatives_by_sdg,
    # Summaries follow a summarise-once-then-translate pipeline to save
    # tokens on the (free-plan) LLM: generate the Spanish summary from the
    # source text, then translate the short result into Catalan. Run order:
    #   plain_summaries_es  →  plain_summaries_ca
    #   vote_plain_summaries_es  →  vote_plain_summaries_ca
    "plain_summaries_es": generate_all_plain_summaries_es,
    "plain_summaries_ca": translate_initiative_summaries_ca_from_es,
    "vote_plain_summaries_es": generate_vote_plain_summaries_es,
    "vote_plain_summaries_ca": translate_vote_summaries_ca_from_es,
    # Fill any row that has a summary in only one of CA/ES (both tables,
    # both directions). Also runs daily from the scheduler.
    "summary_gaps": repair_summary_language_gaps,
    # PNL / motion text from the BOCG (all of the current legislature), and
    # summaries for any initiative that has text but no summary yet.
    "motion_texts": enrich_motion_texts_all,
    "summarise_pending": summarise_pending_initiatives,
    # One-off (idempotent) cleanup of the audience tags behind the /lleis
    # "who it affects" filter.
    "normalise_audiences": normalise_audiences_all,
    # Legacy step names: the bare names now point at the cheap Catalan
    # translation pass (was: re-summarise from source). The original
    # from-source Catalan summariser is still reachable as a function for
    # tests; the CLI nudges everyone onto the translate path.
    "plain_summaries": translate_initiative_summaries_ca_from_es,
    "vote_plain_summaries": translate_vote_summaries_ca_from_es,
    "upcoming_agenda": import_upcoming_agenda,
    # Newsletter manual triggers — defaults to a dry run that creates a
    # draft campaign in Listmonk. Use ``send_weekly_digest_now_send``
    # only after verifying the draft.
    "send_weekly_digest_now": send_weekly_digest_now,
    "send_weekly_digest_preview_30": send_weekly_digest_preview_30,
    "send_weekly_digest_now_send": send_weekly_digest_now_send,
    "all": _run_all,
}


def main() -> None:
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    fn = _STEPS.get(step)
    if fn is None:
        valid = ", ".join(_STEPS)
        raise SystemExit(f"Unknown step {step!r}. Choose from: {valid}")
    result = asyncio.run(fn())
    if result is not None:
        # Bootstrap steps that return useful summary data — print it for
        # the human invoking the CLI.
        log.info("bootstrap.step.result", step=step, result=result)


if __name__ == "__main__":
    main()
