"""Google News RSS aggregator per topic.

Pulls recent press mentions of a topic from the public Google News
RSS feed and returns a normalised list the frontend can render
inside the Topic Hub page. No editorial curation — Google News
aggregates across thousands of outlets and we pass-through
whatever it returns, in publication order. The neutrality stance
this protects is the project's "mirror not megaphone": we surface
WHO is talking about a topic, never WHAT is important about it.

Source:
  https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=<country>&ceid=<country>:<lang>

Parsing: Google News' RSS is stable, well-formed XML with one
``<item>`` per news article carrying ``<title>``, ``<link>``,
``<pubDate>``, ``<source url="…">name</source>``. We use the
stdlib ElementTree parser — no extra dependency.

Caching: the result is cached per (slug, locale) for 1 h via the
shared Redis cache. Google News updates within minutes for major
stories; an hour-stale view is far better than hammering Google's
RSS host on every Topic Hub render.

Failure mode: any error (network, parse, empty feed) returns an
empty list rather than raising. The Topic Hub renders without a
news section in that case — same gracious degradation as the rest
of the open-data enrichments.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Final
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

import httpx

from app.core.logging import get_logger

log = get_logger(__name__)

USER_AGENT = (
    "monitor-parlamentari/0.1 (+https://www.holapolitica.org; " "contact daniel@holapolitica.org)"
)

NEWS_BASE_URL = "https://news.google.com/rss/search"

# Maximum items returned to the frontend. Tight cap because the
# Topic Hub renders all of them as a list (no infinite scroll), and
# Google News quality degrades past the first page anyway.
MAX_ITEMS: Final[int] = 8

# Locale → (hl, gl, ceid) for Google News. These must be the
# canonical edition triples: any other combination (e.g. ``hl=ca``
# without ``ceid``, or ``hl=es-419``) gets a 302 to the canonical
# URL. Google has no Spain-targeted English edition — ``ceid=ES:en``
# is bounced to ``US:en`` — so English uses the US edition; the
# query itself still pins results to the Spanish Congress.
_LOCALE_PARAMS: Final[dict[str, tuple[str, str, str]]] = {
    "ca": ("ca-ES", "ES", "ES:ca"),
    "es": ("es", "ES", "ES:es"),
    "en": ("en-US", "US", "US:en"),
}


@dataclass(frozen=True, slots=True)
class NewsItem:
    """One news article from Google News, normalised for the API."""

    title: str
    url: str
    source: str
    published_at: datetime | None


def _build_query(topic_name: str) -> str:
    """Compose a Google News query for a topic name.

    We pin every search to the Spanish Congress context so a topic
    like "Habitatge" doesn't surface housing news from anywhere in
    the world. ``"Congreso"`` works for both Catalan and Spanish
    queries because the term itself is a proper noun (Congreso de
    los Diputados); English speakers searching the same hit
    English-language coverage of the Spanish parliament.
    """
    return f"{topic_name} Congreso España"


def _build_feed_url(topic_name: str, locale: str) -> str:
    """Google News RSS search URL for ``topic_name`` in ``locale``.

    Unknown locales fall back to Catalan, the project's default UI
    language.
    """
    hl, gl, ceid = _LOCALE_PARAMS.get(locale, _LOCALE_PARAMS["ca"])
    params = urlencode({"q": _build_query(topic_name), "hl": hl, "gl": gl, "ceid": ceid})
    return f"{NEWS_BASE_URL}?{params}"


def _parse_pubdate(raw: str | None) -> datetime | None:
    """RFC-2822 publication date → datetime, defensive."""
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None


_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _clean_title(raw: str) -> str:
    """Strip HTML tags that Google News sometimes leaves embedded
    in titles (rare but happens on aggregated headlines)."""
    return _HTML_TAG_RE.sub("", raw).strip()


def _parse_feed(xml: bytes) -> list[NewsItem]:
    """Walk the RSS document and yield up to :data:`MAX_ITEMS` items.

    Tolerant of malformed entries: each ``<item>`` is wrapped in a
    try/except so one bad row doesn't kill the batch. We require a
    title + link as the minimum useful payload; everything else is
    optional and the caller can render around missing pieces.
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        log.warning("news.parse.failed", error=str(e))
        return []

    items: list[NewsItem] = []
    # The RSS spec puts items under <channel><item>...; tolerate
    # documents that nest differently by walking findall on the
    # root tree.
    for item in root.iter("item"):
        try:
            title_el = item.find("title")
            link_el = item.find("link")
            if title_el is None or link_el is None:
                continue
            title = _clean_title(title_el.text or "")
            url = (link_el.text or "").strip()
            if not title or not url:
                continue
            source_el = item.find("source")
            source = (source_el.text or "").strip() if source_el is not None else ""
            pub_el = item.find("pubDate")
            published = _parse_pubdate(pub_el.text if pub_el is not None else None)
            items.append(
                NewsItem(
                    title=title,
                    url=url,
                    source=source,
                    published_at=published,
                )
            )
            if len(items) >= MAX_ITEMS:
                break
        except Exception as e:
            log.warning("news.item.parse.failed", error=str(e))
            continue
    return items


async def fetch_topic_news(
    topic_name: str,
    locale: str,
    *,
    timeout: float = 15.0,
) -> list[NewsItem]:
    """Query Google News RSS for ``topic_name`` in ``locale``.

    Returns ``[]`` on any failure (network, HTTP error, parse error,
    empty feed). The caller treats an empty list as "no news section
    on this Topic Hub render" — same null-tolerant contract as the
    Wikidata / BOE enrichers.
    """
    url = _build_feed_url(topic_name, locale)

    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml"}
    # Follow redirects as a safety net: Google canonicalises edition
    # params with a 302, which httpx treats as an error by default.
    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("news.fetch.failed", topic=topic_name, error=str(e))
            return []

    return _parse_feed(resp.content)
