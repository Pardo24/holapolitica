"""The Ministry of the Interior's result files (infoelectoral), Congress only.

The ministry publishes every past election's results as a zip of fixed-width
ASCII files, described in the FICHEROS.doc inside it:
https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/02YYYYMM_MESA.zip

Four of them matter here (``nn`` = file type, ``02`` = Congress):

- ``03`` the lists: code, initials, name and the code of the list each one
  adds up to nationally (SUMAR ANDALUCÍA → SUMAR).
- ``07`` / ``08`` per constituency: census, voters, blank and null votes,
  seats; then each list's votes and seats. The official result.
- ``09`` / ``10`` the same per polling station (mesa), plus the votes from
  abroad (C.E.R.A., municipality 999), which are counted days later.

The 2023 general election is replayed from the polling stations to build
and test the 29-N results page (``replay``). The ministry's feed on the
night itself is another format, described to accredited media only;
app/services/election_results.py takes both through the same structures.
"""

from __future__ import annotations

import io
import math
import random
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Final

#: INE province code → constituency name as the site uses it (the Congress
#: open data's, app/ingest/candidacies.py ``SEATS``).
PROVINCES: Final[dict[str, str]] = {
    "01": "Araba/Álava", "02": "Albacete", "03": "Alicante/Alacant", "04": "Almería",
    "05": "Ávila", "06": "Badajoz", "07": "Balears (Illes)", "08": "Barcelona",
    "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón/Castelló",
    "13": "Ciudad Real", "14": "Córdoba", "15": "Coruña (A)", "16": "Cuenca",
    "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa",
    "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
    "26": "Rioja (La)", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
    "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia",
    "35": "Palmas (Las)", "36": "Pontevedra", "37": "Salamanca", "38": "S/C Tenerife",
    "39": "Cantabria", "40": "Segovia", "41": "Sevilla", "42": "Soria",
    "43": "Tarragona", "44": "Teruel", "45": "Toledo", "46": "Valencia/València",
    "47": "Valladolid", "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza",
    "51": "Ceuta", "52": "Melilla",
}  # fmt: skip

URL: Final[str] = (
    "https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/02{yyyymm}_MESA.zip"
)


@dataclass(frozen=True)
class ListInfo:
    code: str
    acronym: str
    name: str
    #: The list it adds up to nationally (itself for a national list).
    national_code: str


@dataclass
class ProvinceCount:
    """One constituency's count, whole or in progress. Shared with the
    ministry's live feed (app/services/election_results.py)."""

    ine: str
    seats: int
    #: Census of the polling stations counted so far, and of all of them.
    census_counted: int
    census_total: int
    voters: int
    blank: int
    null: int
    #: List code → votes.
    votes: dict[str, int] = field(default_factory=dict)
    #: List code → seats when the source gives them (the official files, the
    #: ministry's feed); None to compute them by D'Hondt.
    seats_by_list: dict[str, int] | None = None


@dataclass
class _Station:
    ine: str
    municipality: str
    abroad: bool
    census: int
    voters: int
    blank: int
    null: int
    votes: dict[str, int] = field(default_factory=dict)


def _int(s: str) -> int:
    s = s.strip()
    return int(s) if s else 0


def _lines(z: zipfile.ZipFile, kind: str) -> list[str]:
    name = next(
        n for n in z.namelist() if n.upper().startswith(kind) and n.upper().endswith(".DAT")
    )
    return z.read(name).decode("cp1252").splitlines()


def parse_lists(z: zipfile.ZipFile) -> dict[str, ListInfo]:
    """File 03: every list, keyed by its code."""
    out: dict[str, ListInfo] = {}
    for line in _lines(z, "03"):
        if len(line) < 232:
            continue
        code = line[8:14]
        out[code] = ListInfo(
            code=code,
            acronym=line[14:64].strip(),
            name=line[64:214].strip(),
            national_code=line[226:232],
        )
    return out


def parse_official(z: zipfile.ZipFile) -> dict[str, ProvinceCount]:
    """Files 07 and 08: the official result of each constituency."""
    out: dict[str, ProvinceCount] = {}
    for line in _lines(z, "07"):
        ine, district = line[11:13], line[13]
        if ine not in PROVINCES or district != "9":
            continue
        census = _int(line[85:93])
        out[ine] = ProvinceCount(
            ine=ine,
            seats=_int(line[149:155]),
            census_counted=census,
            census_total=census,
            # Voters = valid + null; the file carries no total of its own.
            voters=_int(line[125:133]) + _int(line[133:141]) + _int(line[141:149]),
            blank=_int(line[125:133]),
            null=_int(line[133:141]),
            seats_by_list={},
        )
    for line in _lines(z, "08"):
        ine, district = line[11:13], line[13]
        if ine not in out or district != "9":
            continue
        code = line[14:20]
        out[ine].votes[code] = _int(line[20:28])
        seats = out[ine].seats_by_list
        if seats is not None:
            seats[code] = _int(line[28:33])
    return out


def parse_stations(z: zipfile.ZipFile) -> list[_Station]:
    """Files 09 and 10: every polling station, and the votes from abroad."""
    stations: dict[str, _Station] = {}
    for line in _lines(z, "09"):
        ine = line[11:13]
        if ine not in PROVINCES:
            continue
        key = line[11:23]
        stations[key] = _Station(
            ine=ine,
            municipality=line[11:16],
            abroad=line[13:16] == "999",
            census=_int(line[30:37]),
            voters=_int(line[65:72]) + _int(line[72:79]) + _int(line[79:86]),
            blank=_int(line[65:72]),
            null=_int(line[72:79]),
        )
    for line in _lines(z, "10"):
        st = stations.get(line[11:23])
        if st is not None:
            st.votes[line[23:29]] = st.votes.get(line[23:29], 0) + _int(line[29:36])
    return list(stations.values())


def replay(
    z: zipfile.ZipFile, seats: dict[str, int], steps: int = 20
) -> list[dict[str, ProvinceCount]]:
    """The count as it could have come in on the night, in ``steps`` stages
    plus the official result.

    Polling stations report in an order that favours small municipalities
    (they count fewer ballots and report first), with noise so every
    constituency moves at once, as on the night. Votes from abroad are not
    in the night's count, nor in its "% counted"; the last stage is the
    official result (files 07/08), which has them and the scrutiny's
    corrections.
    """
    stations = parse_stations(z)
    muni_census: dict[str, int] = defaultdict(int)
    for st in stations:
        muni_census[st.municipality] += st.census
    rng = random.Random(2023)
    home = [st for st in stations if not st.abroad]
    home.sort(key=lambda st: math.log(1 + muni_census[st.municipality]) + rng.gauss(0, 1.5))
    census_total: dict[str, int] = defaultdict(int)
    for st in home:
        census_total[st.ine] += st.census

    def snapshot(counted: list[_Station]) -> dict[str, ProvinceCount]:
        out = {
            ine: ProvinceCount(
                ine=ine,
                seats=seats[PROVINCES[ine]],
                census_counted=0,
                census_total=census_total[ine],
                voters=0,
                blank=0,
                null=0,
            )
            for ine in PROVINCES
        }
        for st in counted:
            p = out[st.ine]
            p.census_counted += st.census
            p.voters += st.voters
            p.blank += st.blank
            p.null += st.null
            for code, v in st.votes.items():
                p.votes[code] = p.votes.get(code, 0) + v
        return out

    stages: list[dict[str, ProvinceCount]] = []
    for k in range(1, steps + 1):
        stages.append(snapshot(home[: round(len(home) * k / steps)]))
    stages.append(parse_official(z))
    return stages


def open_zip(data: bytes) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(data))
