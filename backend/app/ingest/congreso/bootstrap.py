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
import sys
from dataclasses import asdict, dataclass
from datetime import UTC

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
from app.models import Chamber, Legislature
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
        return await importer.import_payload(payload)


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
                _select(Initiative.official_id, Initiative.id).where(
                    Initiative.chamber_id == chamber.id
                )
            )
        ).all()
        index: dict[str, int] = {}
        for official_id, initiative_id in rows:
            index[official_id] = initiative_id
            stem = strip_zero_subindex(official_id)
            if stem != official_id:
                index.setdefault(stem, initiative_id)

        log.info(
            "bootstrap.link_votes.starting",
            chamber=chamber.slug,
            initiative_keys=len(index),
        )

        # Stream the candidate votes through a dedicated cursor so we don't
        # materialise the entire result set in memory.
        vote_ids_and_exptes = (
            await session.execute(
                _select(Vote.id, Vote.expediente_raw)
                .join(SessionRow, SessionRow.id == Vote.session_id)
                .where(SessionRow.chamber_id == chamber.id)
                .where(Vote.initiative_id.is_(None))
                .where(Vote.expediente_raw.is_not(None))
                .order_by(Vote.id)
            )
        ).all()

        processed = linked = unmatched = 0
        for vote_id, expediente_raw in vote_ids_and_exptes:
            processed += 1
            target_id = index.get(expediente_raw)
            if target_id is None and expediente_raw is not None:
                target_id = index.get(strip_zero_subindex(expediente_raw))
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
    from app.services.plain_summary import generate_plain_summary

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
                # Plain-language summaries (best-effort each lang).
                # Prefer the bill's own "Exposición de motivos" prose
                # over the open-data feed's ``summary`` field (which is
                # almost always NULL): it gives the LLM a much richer
                # input to distil down to 2-3 plain-language sentences.
                body = row.object_text or row.summary
                ca = await generate_plain_summary(title=row.title_original, body=body, lang="ca")
                es = await generate_plain_summary(title=row.title_original, body=body, lang="es")
                row.plain_summary_ca = ca.text
                row.plain_summary_es = es.text
                row.plain_summary_provider = ca.provider
                from datetime import datetime

                row.plain_summary_generated_at = datetime.now(UTC)
                await enrich_session.commit()
                summarised_ca += 1 if ca.text else 0
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
                    body = row.object_text or row.summary
                    result = await generate_plain_summary(
                        title=row.title_original, body=body, lang=lang
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


# Minimum description length we'll feed to the LLM. Below this floor the
# text is almost certainly a procedural label ("Proposiciones no de Ley.")
# and the model would just hallucinate. 60 chars matches what we see in
# the few well-formed orphan-vote descriptions today.
_VOTE_DESCRIPTION_MIN_LEN = 60


async def generate_vote_plain_summaries(lang: str = "ca") -> dict[str, int | str]:
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
    """
    from datetime import datetime

    from sqlalchemy import func as _func
    from sqlalchemy import select as _select

    from app.models import Vote
    from app.services.plain_summary import generate_plain_summary

    target_col_name = f"plain_summary_{lang}"
    if not hasattr(Vote, target_col_name):
        raise ValueError(f"Unsupported lang for plain summary: {lang!r}")
    target_col = getattr(Vote, target_col_name)

    async with AsyncSessionLocal() as session:
        ids = list(
            (
                await session.execute(
                    _select(Vote.id).where(
                        target_col.is_(None),
                        Vote.description.is_not(None),
                        _func.length(Vote.description) > _VOTE_DESCRIPTION_MIN_LEN,
                    )
                )
            )
            .scalars()
            .all()
        )
        log.info("vote_plain_summary.starting", lang=lang, count=len(ids))

        ok = insufficient = errors = 0
        for vid in ids:
            try:
                async with AsyncSessionLocal() as inner:
                    row = (await inner.execute(_select(Vote).where(Vote.id == vid))).scalar_one()
                    result = await generate_plain_summary(
                        title=row.title, body=row.description, lang=lang
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


async def generate_vote_plain_summaries_es() -> dict[str, int | str]:
    """Bootstrap-friendly alias for the Spanish run on votes."""
    return await generate_vote_plain_summaries(lang="es")


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


_STEPS = {
    "deputies": import_active_deputies,
    "initiatives": import_initiatives,
    "enrich_wikidata": _enrich_wikidata_step,
    "enrich_boe": _enrich_boe_step,
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
    "plain_summaries": generate_all_plain_summaries,
    "plain_summaries_es": generate_all_plain_summaries_es,
    "vote_plain_summaries": generate_vote_plain_summaries,
    "vote_plain_summaries_es": generate_vote_plain_summaries_es,
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
