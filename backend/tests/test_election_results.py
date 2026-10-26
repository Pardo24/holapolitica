"""Election-night results: the D'Hondt rule and the snapshot the page shows.

The whole 2023 count was checked against the ministry's official files when
this was written: D'Hondt over each constituency's votes gives the official
seats in all 52, and the national totals add up to PP 137, PSOE 121, VOX 33,
SUMAR 31 (app/ingest/infoelectoral.py, app/ingest/results_replay.py).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.ingest.infoelectoral import ListInfo, ProvinceCount
from app.services.dhondt import allocate
from app.services.election_results import build


def test_dhondt_textbook_case() -> None:
    # The usual worked example: 7 seats, A 340k, B 280k, C 160k, D 60k.
    votes = {"A": 340_000, "B": 280_000, "C": 160_000, "D": 60_000}
    assert allocate(7, votes, blank=0) == {"A": 3, "B": 3, "C": 1, "D": 0}


def test_dhondt_three_percent_counts_blank_votes() -> None:
    # 2.9% of valid votes (lists + blank): no seat, however the quotients fall.
    votes = {"A": 9_000, "B": 300}
    assert allocate(30, votes, blank=1_000)["B"] == 0
    # 3% exactly is enough.
    assert allocate(40, {"A": 9_700, "B": 300}, blank=0)["B"] == 1


def test_dhondt_tie_goes_to_more_votes_then_lower_code() -> None:
    # A/2 == B/1 for the last seat: A has more votes.
    assert allocate(3, {"A": 200, "B": 100, "C": 10}, blank=0) == {"A": 2, "B": 1, "C": 0}
    # Same votes: the law draws lots; the lower code wins here, every time.
    assert allocate(1, {"B": 100, "A": 100}, blank=0) == {"A": 1, "B": 0}


def test_build_adds_lists_up_nationally() -> None:
    lists = {
        "000002": ListInfo("000002", "PSOE", "PARTIDO SOCIALISTA OBRERO ESPAÑOL", "000002"),
        "000003": ListInfo("000003", "PSC-PSOE", "PARTIT DELS SOCIALISTES DE CATALUNYA", "000002"),
        "000010": ListInfo("000010", "SUMAR", "SUMAR", "000010"),
        "000012": ListInfo("000012", "U.P.N.", "UNIÓN DEL PUEBLO NAVARRO", "000012"),
    }
    provinces = {
        "08": ProvinceCount(
            ine="08",
            seats=3,
            census_counted=1000,
            census_total=2000,
            voters=700,
            blank=10,
            null=5,
            votes={"000003": 400, "000010": 285},
        ),
        "28": ProvinceCount(
            ine="28",
            seats=2,
            census_counted=1000,
            census_total=1000,
            voters=600,
            blank=0,
            null=0,
            votes={"000002": 300, "000010": 300},
        ),
        "31": ProvinceCount(
            ine="31",
            seats=1,
            census_counted=10,
            census_total=10,
            voters=5,
            blank=0,
            null=0,
            votes={"000012": 5},
        ),
    }
    snap = build(
        "2023-07", provinces, lists, official=False, taken_at=datetime(2023, 7, 23, tzinfo=UTC)
    )
    assert snap["counted_pct"] == 66.78
    parties = {p["acronym"]: p for p in snap["parties"]}
    assert parties["PSOE"]["votes"] == 700 and parties["PSOE"]["party"] == "psoe"
    # SUMAR compares with Frente Amplio, the 2026 list of its parties.
    assert parties["SUMAR"]["party"] == "frente-amplio"
    assert parties["U.P.N."]["party"] == "upn"
    assert snap["seats_total"] == 6
    barcelona = next(c for c in snap["constituencies"] if c["ine"] == "08")
    assert barcelona["name"] == "Barcelona" and barcelona["counted_pct"] == 50.0
    assert [r["acronym"] for r in barcelona["lists"]] == ["PSC-PSOE", "SUMAR"]
    # Alphabetical without accents: Barcelona, Madrid, Navarra.
    assert [c["ine"] for c in snap["constituencies"]] == ["08", "28", "31"]
