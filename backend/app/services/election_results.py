"""A snapshot of the Congress count: what the results page shows.

The source only has to fill one ``ProvinceCount`` per constituency (app/
ingest/infoelectoral.py): the 2023 replay does, and so will the reader of
the ministry's feed on 29 November. From those this builds one JSON
payload, stored as an ``ElectionResultSnapshot``:

- the national totals per list as it adds up nationally (PSC counts as
  PSOE, SUMAR ANDALUCÍA as SUMAR), with seats;
- each constituency's lists, votes and seats.

Seats come from the source when it gives them (the ministry's provisional
seats, the official result), else from the D'Hondt rule over the votes
counted so far (app/services/dhondt.py), which is how the ministry
computes them too. Percentages are of valid votes (lists plus blank), as
the ministry gives them.
"""

from __future__ import annotations

import unicodedata
from datetime import datetime
from typing import Any

from app.ingest.infoelectoral import PROVINCES, ListInfo, ProvinceCount
from app.services.dhondt import allocate
from app.services.election_parties import party_for_list


def party_of(info: ListInfo) -> str | None:
    """The party slug of a national list, as the site colours and filters
    them. SUMAR, the 2023 list of the parties that run as Frente Amplio in
    2026, takes its slug so the two elections compare (Podemos ran inside it
    then; the page says so)."""
    # The ministry dots some initials (U.P.N., B.N.G.); the BOE does not.
    return party_for_list(info.name, info.acronym.replace(".", "")) or (
        "frente-amplio" if info.acronym.upper() == "SUMAR" else None
    )


def _alpha(name: str) -> str:
    """Alphabetical order as readers expect it: Ávila with the A's."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    ).lower()


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 2) if whole else 0.0


def build(
    election: str,
    provinces: dict[str, ProvinceCount],
    lists: dict[str, ListInfo],
    *,
    official: bool,
    taken_at: datetime,
) -> dict[str, Any]:
    national_votes: dict[str, int] = {}
    national_seats: dict[str, int] = {}
    constituencies: list[dict[str, Any]] = []
    census_counted = census_total = voters = blank = null = 0

    for ine, name in sorted(PROVINCES.items(), key=lambda kv: _alpha(kv[1])):
        p = provinces.get(ine)
        if p is None:
            continue
        seats = p.seats_by_list if p.seats_by_list else allocate(p.seats, p.votes, p.blank)
        valid = sum(p.votes.values()) + p.blank
        rows: list[dict[str, Any]] = []
        for code, v in p.votes.items():
            info = lists.get(code) or ListInfo(code, code, code, code)
            key = info.national_code
            national_votes[key] = national_votes.get(key, 0) + v
            national_seats[key] = national_seats.get(key, 0) + seats.get(code, 0)
            rows.append(
                {
                    "key": key,
                    "acronym": info.acronym,
                    "name": info.name,
                    "party": party_of(lists.get(key, info)),
                    "votes": v,
                    "pct": _pct(v, valid),
                    "seats": seats.get(code, 0),
                }
            )
        rows.sort(key=lambda r: (-r["seats"], -r["votes"]))
        constituencies.append(
            {
                "name": name,
                "ine": ine,
                "seats": p.seats,
                "counted_pct": _pct(p.census_counted, p.census_total),
                "turnout_pct": _pct(p.voters, p.census_counted),
                "blank": p.blank,
                "null": p.null,
                # Lists with no votes yet are noise early in the count.
                "lists": [r for r in rows if r["votes"] > 0],
            }
        )
        census_counted += p.census_counted
        census_total += p.census_total
        voters += p.voters
        blank += p.blank
        null += p.null

    valid = sum(national_votes.values()) + blank
    parties: list[dict[str, Any]] = []
    for key, v in national_votes.items():
        if v <= 0:
            continue
        info = lists.get(key) or ListInfo(key, key, key, key)
        parties.append(
            {
                "key": key,
                "acronym": info.acronym,
                "name": info.name,
                "party": party_of(info),
                "votes": v,
                "pct": _pct(v, valid),
                "seats": national_seats.get(key, 0),
            }
        )
    parties.sort(key=lambda r: (-r["seats"], -r["votes"]))

    return {
        "election": election,
        "official": official,
        "taken_at": taken_at.isoformat(),
        "counted_pct": _pct(census_counted, census_total),
        "turnout_pct": _pct(voters, census_counted),
        "voters": voters,
        "blank": blank,
        "blank_pct": _pct(blank, valid),
        "null": null,
        "seats_total": sum(national_seats.values()),
        "parties": parties,
        "constituencies": constituencies,
    }
