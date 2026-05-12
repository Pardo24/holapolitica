"""Backfill ``Initiative.object_text`` by fetching the BOCG PDF and parsing it.

Why a separate module from :mod:`app.ingest.congreso.initiatives`:

- The initiatives importer is fast (pure JSON, no PDF I/O): the full XV
  dataset is ~1500 records and imports in a few seconds. Downloading
  one PDF per record (1500 × ~150 KB at 0.5s politeness) would
  inflate that to ~15 minutes — unacceptable for the live forward
  ingest path that runs after every plenary session.
- PDF extraction is best-effort and inherently lossy: some
  initiatives have no BOCG URL, some PDFs are malformed, some use
  non-standard headings. Isolating that risk in a dedicated backfill
  step keeps the import path clean.

The backfill targets every :class:`Initiative` where:

- ``object_text IS NULL`` (skip rows we've already processed) **and**
- ``source_url IS NOT NULL`` (we need a PDF URL to fetch) **and**
- the URL looks like a BOCG PDF (``.pdf`` after stripping anchors).

Politeness:

- 0.5 s between HTTP requests (well under Congreso's tolerated rate).
- The user-agent string is the project's configured
  :attr:`Settings.congreso_user_agent`.

Idempotent: re-running the step picks up only the rows still missing
``object_text``. Rows that yielded ``None`` last run are retried (a
later pypdf release or a republished PDF could fix the extraction).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.client import CongresoClient
from app.ingest.congreso.object_extractor import (
    extract_object_text_from_pdf_bytes,
    first_pdf_url,
)
from app.models import Initiative

log = get_logger(__name__)


# Seconds between PDF fetches. 0.5 s is conservative; the Congreso portal
# serves static PDFs from a CDN-like layer and we've never seen rate-
# limiting at this cadence. Tune via ``INITIATIVE_OBJECTS_DELAY_S`` env
# in the future if needed.
_FETCH_DELAY_S = 0.5


@dataclass(frozen=True, slots=True)
class InitiativeObjectsBackfillStats:
    """Counters returned by :func:`backfill_initiative_objects`."""

    seen: int = 0
    fetched: int = 0
    extracted: int = 0
    skipped_no_url: int = 0
    skipped_not_pdf: int = 0
    errors: int = 0


async def backfill_initiative_objects(
    *,
    only_first_n: int | None = None,
    session_factory: object | None = None,
) -> InitiativeObjectsBackfillStats:
    """Populate ``Initiative.object_text`` for every row currently NULL.

    Args:
        only_first_n: process at most this many rows. ``None`` (default)
            processes everything. Useful for smoke tests before a full
            run on production.
        session_factory: optional override of the async sessionmaker.
            Defaults to the application-wide
            :data:`app.db.session.AsyncSessionLocal`. Tests inject a
            SQLite-backed factory here.

    Behaviour:

    - Streams candidate initiative IDs in a single query, then opens a
      fresh session per row so a transient DB hiccup costs at most one
      row of progress.
    - Per-row try/except wraps both the HTTP fetch and the PDF parse,
      so a single bad URL or malformed PDF never aborts the batch.
    - Sleeps :data:`_FETCH_DELAY_S` between successful fetches only;
      we don't sleep for rows we skip (no URL, non-PDF URL) since
      those don't touch the network.
    """
    if session_factory is None:
        # Imported here to break a circular import in test environments
        # that swap out AsyncSessionLocal via this kwarg.
        from app.db.session import AsyncSessionLocal as _SessionLocal

        session_factory = _SessionLocal

    # Find candidates: ``object_text IS NULL AND source_url IS NOT NULL``.
    # We don't filter on initiative ``type`` because the BOCG-PDF
    # convention holds for all three legislative-process series we
    # import today (121, 122, 127). PNL series (162) never have a
    # ``source_url`` populated by the scraper, so they're naturally
    # excluded by the WHERE clause.
    candidate_ids: list[int]
    async with session_factory() as session:  # type: ignore[operator]
        assert isinstance(session, AsyncSession)
        rows = (
            await session.execute(
                select(Initiative.id)
                .where(Initiative.object_text.is_(None))
                .where(Initiative.source_url.is_not(None))
                .order_by(Initiative.id)
            )
        ).all()
        candidate_ids = [row[0] for row in rows]

    if only_first_n is not None:
        candidate_ids = candidate_ids[:only_first_n]

    log.info(
        "congreso.initiative_objects.starting",
        candidate_count=len(candidate_ids),
        only_first_n=only_first_n,
    )

    seen = fetched = extracted = skipped_no_url = skipped_not_pdf = errors = 0

    async with CongresoClient() as client:
        for iid in candidate_ids:
            seen += 1
            hit_network = False
            try:
                async with session_factory() as session:  # type: ignore[operator]
                    assert isinstance(session, AsyncSession)
                    initiative = (
                        await session.execute(select(Initiative).where(Initiative.id == iid))
                    ).scalar_one_or_none()
                    if initiative is None:
                        # Deleted between candidate enumeration and now.
                        continue
                    if initiative.object_text is not None:
                        # Filled by a parallel writer; nothing to do.
                        continue
                    pdf_url = first_pdf_url(initiative.source_url)
                    if pdf_url is None:
                        if not initiative.source_url:
                            skipped_no_url += 1
                        else:
                            skipped_not_pdf += 1
                        continue

                    hit_network = True
                    pdf_bytes = await client.fetch_bytes(pdf_url)
                    fetched += 1
                    text = extract_object_text_from_pdf_bytes(pdf_bytes)
                    if text:
                        initiative.object_text = text
                        await session.commit()
                        extracted += 1
                    else:
                        log.info(
                            "congreso.initiative_objects.no_text",
                            initiative_id=iid,
                            official_id=initiative.official_id,
                            pdf_url=pdf_url,
                        )
            except Exception as exc:
                errors += 1
                log.warning(
                    "congreso.initiative_objects.error",
                    initiative_id=iid,
                    error=str(exc),
                )

            # Politeness: pace network requests, but don't waste time
            # sleeping for rows that never touched the wire.
            if hit_network and seen != len(candidate_ids):
                await asyncio.sleep(_FETCH_DELAY_S)

    stats = InitiativeObjectsBackfillStats(
        seen=seen,
        fetched=fetched,
        extracted=extracted,
        skipped_no_url=skipped_no_url,
        skipped_not_pdf=skipped_not_pdf,
        errors=errors,
    )
    log.info("congreso.initiative_objects.done", **stats.__dict__)
    return stats
