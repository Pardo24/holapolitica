"""Wikipedia REST summary enrichment for :class:`Person` rows.

Companion to :mod:`app.ingest.wikidata`. Wikidata gives us each
deputy's QID and per-locale Wikipedia URL; this module follows up
by fetching the plain-text "extract" (typically the article's first
paragraph) so the frontend can render a short biographical blurb
alongside the profession / education chips on
``/persons/[id]``.

Source: ``https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}``
— Wikimedia's official summary endpoint, returning a small JSON
payload with ``extract`` (plain text) and ``extract_html`` (rich).
We store ``extract`` only; the HTML is heavier and we render the
text in our own typography.

Rate limit: Wikimedia allows up to 200 req/s for anonymous traffic;
we pace at ~2 req/s with a short politeness delay between calls.
The matcher is best-effort: a fetch failure on any one row is
logged and the row is skipped, never aborts the batch.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import Person

log = get_logger(__name__)


USER_AGENT = (
    "monitor-parlamentari/0.1 (+https://www.holapolitica.org; "
    "contact daniel@holapolitica.org) python-httpx"
)

# How long to wait between requests. 0.4 s puts us at 2.5 req/s,
# well under Wikimedia's anonymous quota and gentle on a public
# resource we depend on indefinitely.
INTER_REQUEST_DELAY_S = 0.4

# Truncate guard. Wikipedia ledes occasionally run very long; the
# frontend treatment doesn't need more than this. The article URL
# is always one click away when a reader wants the full text.
MAX_EXTRACT_CHARS = 800


@dataclass(frozen=True, slots=True)
class _SummaryFetch:
    """Outcome of one Wikipedia REST summary fetch."""

    lang: str
    extract: str | None
    error: str | None = None


def _title_from_url(url: str) -> str | None:
    """Pull the article title segment from a Wikipedia URL.

    Wikipedia URLs are ``https://{lang}.wikipedia.org/wiki/{Title}``;
    titles arrive percent-encoded for non-ASCII characters. The REST
    summary endpoint accepts the raw (decoded, underscore-form) title
    in its path, so we decode and strip the leading slash.
    """
    marker = "/wiki/"
    idx = url.find(marker)
    if idx < 0:
        return None
    raw = url[idx + len(marker) :].split("#", 1)[0].split("?", 1)[0]
    if not raw:
        return None
    return unquote(raw)


async def _fetch_one(client: httpx.AsyncClient, lang: str, title: str) -> _SummaryFetch:
    """Fetch a single article's summary; never raises."""
    api = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
    try:
        resp = await client.get(api)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        return _SummaryFetch(lang=lang, extract=None, error=str(e))

    try:
        payload: Any = resp.json()
    except ValueError as e:
        return _SummaryFetch(lang=lang, extract=None, error=f"json: {e}")

    extract = payload.get("extract")
    if not isinstance(extract, str) or not extract.strip():
        return _SummaryFetch(lang=lang, extract=None, error="empty_extract")
    text = extract.strip()
    if len(text) > MAX_EXTRACT_CHARS:
        # Cut at the nearest sentence boundary inside the budget so
        # we don't truncate mid-word. Falls back to a hard cut if no
        # sentence break exists in the visible region.
        window = text[:MAX_EXTRACT_CHARS]
        cut = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
        text = window[: cut + 1] if cut > 200 else window.rstrip() + "…"
    return _SummaryFetch(lang=lang, extract=text)


async def enrich_persons_wikipedia(session: AsyncSession) -> dict[str, int]:
    """Fill ``wikipedia_summary_*`` columns for every person with a URL.

    Operates only on rows where at least one Wikipedia URL is set AND
    the corresponding extract column is still NULL — so re-running is
    idempotent and previously-failed rows pick up on the next pass.

    Returns a counter of ``{fetched, skipped, errors}`` for the
    bootstrap CLI / cron telemetry.
    """
    persons = list(
        (
            await session.execute(
                select(Person).where(
                    or_(
                        Person.wikipedia_url_ca.is_not(None),
                        Person.wikipedia_url_es.is_not(None),
                        Person.wikipedia_url_en.is_not(None),
                    )
                )
            )
        )
        .scalars()
        .all()
    )

    fetched = 0
    errors = 0
    skipped = 0

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
        for person in persons:
            jobs: list[tuple[str, str]] = []
            # Plan: per locale, fetch only when the URL is set and the
            # existing extract is NULL. We never overwrite a populated
            # extract — operator triggers a refresh by NULLing the
            # column out manually.
            for lang, url_attr, summary_attr in (
                ("ca", "wikipedia_url_ca", "wikipedia_summary_ca"),
                ("es", "wikipedia_url_es", "wikipedia_summary_es"),
                ("en", "wikipedia_url_en", "wikipedia_summary_en"),
            ):
                url = getattr(person, url_attr)
                if not url:
                    continue
                if getattr(person, summary_attr):
                    continue
                title = _title_from_url(url)
                if not title:
                    continue
                jobs.append((lang, title))

            if not jobs:
                skipped += 1
                continue

            for lang, title in jobs:
                result = await _fetch_one(client, lang, title)
                if result.extract:
                    setattr(person, f"wikipedia_summary_{lang}", result.extract)
                    fetched += 1
                else:
                    errors += 1
                    log.warning(
                        "wikipedia.fetch.failed",
                        person_id=person.id,
                        lang=lang,
                        title=title,
                        error=result.error,
                    )
                await asyncio.sleep(INTER_REQUEST_DELAY_S)

    await session.commit()
    log.info(
        "wikipedia.enriched",
        fetched=fetched,
        errors=errors,
        skipped=skipped,
        seen=len(persons),
    )
    return {
        "seen": len(persons),
        "fetched": fetched,
        "errors": errors,
        "skipped": skipped,
    }
