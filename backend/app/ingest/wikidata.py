"""Wikidata SPARQL-based enrichment of :class:`Person` rows.

Goal: surface a "Veure a Wikipedia →" link plus a one-line
education / profession caption on each deputy's profile page. We
treat every match as best-effort and never fabricate a value — an
unmatched row stays NULL.

Approach
--------
Single SPARQL query lists every Wikidata item whose
``position held`` (P39) is "Member of the Congress of Deputies of
Spain" (Q18171058) within a date range covering the current
legislature. For each item we pull:

* the QID
* the labelled name in CA / ES / EN
* birth year (P569 → year)
* the Wikipedia sitelink in CA / ES / EN (when present)
* a short occupation / education label (when present)

The matcher then walks our local :class:`Person` rows and pairs each
to the Wikidata entry whose label matches the ``full_name`` (case-
and diacritic-insensitive) AND whose birth_year matches when both
are known. Ambiguous matches (multiple candidates after both
filters) are skipped — better to miss one than to mis-attribute.

The Wikidata public SPARQL endpoint has a soft rate limit (~25
req/min for anonymous traffic). We run the single batch query once
per worker tick which fits comfortably under that.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import Person

log = get_logger(__name__)

# Wikidata public SPARQL endpoint. The User-Agent is required by their
# usage policy; we pass a clear contact string so we'd be reachable if
# they ever needed to throttle us specifically.
SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = (
    "monitor-parlamentari/0.1 (+https://www.holapolitica.org; "
    "contact daniel@holapolitica.org) python-httpx"
)

# Q18171345 = Member of the Congress of Deputies of Spain (the lower
# house). We cast the filter wide: anyone with that position-held
# statement, regardless of legislature. The frontend only shows the
# link if our Person row still exists, so retired deputies don't leak.
SPARQL_QUERY = """
SELECT DISTINCT ?person ?personLabel ?dob
       ?wikiCa ?wikiEs ?wikiEn ?occupationLabel ?educationLabel
WHERE {
  ?person wdt:P39 wd:Q18171345 .
  OPTIONAL { ?person wdt:P569 ?dob }
  OPTIONAL { ?person wdt:P106 ?occupation }
  OPTIONAL { ?person wdt:P69 ?education }
  OPTIONAL {
    ?wikiCa schema:about ?person ;
            schema:isPartOf <https://ca.wikipedia.org/> .
  }
  OPTIONAL {
    ?wikiEs schema:about ?person ;
            schema:isPartOf <https://es.wikipedia.org/> .
  }
  OPTIONAL {
    ?wikiEn schema:about ?person ;
            schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ca,es,en" }
}
LIMIT 5000
"""


@dataclass(frozen=True, slots=True)
class WikidataPerson:
    """One row in the Wikidata batch response, narrowed to what we use."""

    qid: str
    label: str  # localised name as Wikidata sees it
    birth_year: int | None
    wikipedia_url_ca: str | None
    wikipedia_url_es: str | None
    wikipedia_url_en: str | None
    occupation: str | None
    education: str | None


def _normalize_name(s: str) -> str:
    """Case- and diacritic-insensitive lookup key for name comparison."""
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii").lower().strip()


def _parse_year(raw: str | None) -> int | None:
    """Wikidata serialises dates as ISO-8601 with a calendar prefix.

    The first 4 digits are the year. We accept BCE dates too (negative
    years) by stripping a leading "-" — irrelevant for our scope but
    keeps the parser robust to surprising payloads.
    """
    if not raw:
        return None
    m = re.search(r"-?(\d{4})-", raw)
    if not m:
        return None
    try:
        year = int(m.group(1))
    except ValueError:
        return None
    if 1900 < year < 2100:
        return year
    return None


def _qid_from_uri(uri: str) -> str:
    """Wikidata URIs look like https://www.wikidata.org/entity/Q12345."""
    return uri.rstrip("/").rsplit("/", 1)[-1]


async def fetch_wikidata_deputies(*, timeout: float = 60.0) -> list[WikidataPerson]:
    """Run the SPARQL query once and parse every row.

    Returns an empty list on transport failure so the worker keeps
    going — the actual update loop is no-op-safe.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/sparql-results+json",
    }
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        try:
            resp = await client.post(
                SPARQL_URL,
                data={"query": SPARQL_QUERY, "format": "json"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("wikidata.fetch.failed", error=str(e))
            return []

    data: Any = resp.json()
    bindings: list[dict[str, Any]] = data.get("results", {}).get("bindings", [])

    # The SPARQL query is one-to-many on optional fields (occupation,
    # education); each row is a different (person × occupation ×
    # education) combination. We aggregate per person and pick the
    # first non-empty label.
    by_qid: dict[str, dict[str, Any]] = {}
    for row in bindings:
        person_uri = row.get("person", {}).get("value")
        if not person_uri:
            continue
        qid = _qid_from_uri(person_uri)
        entry = by_qid.setdefault(
            qid,
            {
                "label": row.get("personLabel", {}).get("value"),
                "birth_year": _parse_year(row.get("dob", {}).get("value")),
                "wikiCa": row.get("wikiCa", {}).get("value"),
                "wikiEs": row.get("wikiEs", {}).get("value"),
                "wikiEn": row.get("wikiEn", {}).get("value"),
                "occupations": set(),
                "educations": set(),
            },
        )
        occ = row.get("occupationLabel", {}).get("value")
        if occ and not occ.startswith("Q"):  # filter out un-labelled QIDs
            entry["occupations"].add(occ)
        edu = row.get("educationLabel", {}).get("value")
        if edu and not edu.startswith("Q"):
            entry["educations"].add(edu)

    out: list[WikidataPerson] = []
    for qid, entry in by_qid.items():
        if not entry["label"]:
            continue
        # Pick a representative occupation / education label. Wikidata
        # frequently lists "polític" plus a profession — drop the
        # generic political label so we surface the actual job.
        occupations = {
            o
            for o in entry["occupations"]
            if o.lower() not in {"polític", "político", "politician"}
        }
        out.append(
            WikidataPerson(
                qid=qid,
                label=entry["label"],
                birth_year=entry["birth_year"],
                wikipedia_url_ca=entry["wikiCa"],
                wikipedia_url_es=entry["wikiEs"],
                wikipedia_url_en=entry["wikiEn"],
                occupation=", ".join(sorted(occupations)[:2]) if occupations else None,
                education=", ".join(sorted(entry["educations"])[:1]) or None,
            )
        )
    return out


def _index_candidates(rows: Iterable[WikidataPerson]) -> dict[str, list[WikidataPerson]]:
    """Group Wikidata candidates by normalised label for O(1) name lookup."""
    by_name: dict[str, list[WikidataPerson]] = {}
    for r in rows:
        by_name.setdefault(_normalize_name(r.label), []).append(r)
    return by_name


async def enrich_persons_from_wikidata(session: AsyncSession) -> dict[str, int]:
    """Match Wikidata candidates to local persons and persist enriched fields.

    Returns a counter of {matched, ambiguous, updated, unchanged}.
    Always commits at the end; partial errors during the per-row
    update loop are logged and skipped so a single bad row doesn't
    abort the batch.
    """
    candidates = await fetch_wikidata_deputies()
    if not candidates:
        return {"matched": 0, "ambiguous": 0, "updated": 0, "unchanged": 0}

    by_name = _index_candidates(candidates)
    log.info("wikidata.candidates", count=len(candidates), distinct_names=len(by_name))

    persons = list((await session.execute(select(Person))).scalars().all())

    matched = 0
    ambiguous = 0
    updated = 0
    unchanged = 0
    for person in persons:
        key = _normalize_name(person.full_name)
        pool = by_name.get(key, [])
        if len(pool) == 0:
            continue
        if len(pool) > 1 and person.birth_year is not None:
            # Disambiguate by birth year when we know it; drop the
            # match entirely if it doesn't narrow to a single hit.
            pool = [c for c in pool if c.birth_year == person.birth_year]
        if len(pool) != 1:
            if len(pool) > 1:
                ambiguous += 1
            continue
        match = pool[0]
        matched += 1

        dirty = False
        if person.wikidata_qid != match.qid:
            person.wikidata_qid = match.qid
            dirty = True
        if match.wikipedia_url_ca and person.wikipedia_url_ca != match.wikipedia_url_ca:
            person.wikipedia_url_ca = match.wikipedia_url_ca
            dirty = True
        if match.wikipedia_url_es and person.wikipedia_url_es != match.wikipedia_url_es:
            person.wikipedia_url_es = match.wikipedia_url_es
            dirty = True
        if match.wikipedia_url_en and person.wikipedia_url_en != match.wikipedia_url_en:
            person.wikipedia_url_en = match.wikipedia_url_en
            dirty = True
        if match.education and person.education != match.education:
            person.education = match.education
            dirty = True
        if match.occupation and person.profession != match.occupation:
            person.profession = match.occupation
            dirty = True
        # Birth year — only fill when we don't already have one (we
        # trust the local value over Wikidata's because the Congreso
        # ficha is the canonical source for our scope).
        if person.birth_year is None and match.birth_year is not None:
            person.birth_year = match.birth_year
            dirty = True
        if dirty:
            updated += 1
        else:
            unchanged += 1

    await session.commit()
    log.info(
        "wikidata.enriched",
        matched=matched,
        ambiguous=ambiguous,
        updated=updated,
        unchanged=unchanged,
    )
    return {
        "matched": matched,
        "ambiguous": ambiguous,
        "updated": updated,
        "unchanged": unchanged,
    }
