"""HTTP client for Congreso open data endpoints.

The Congreso open data portal at https://www.congreso.es/es/opendata does not
expose a versioned REST API. Datasets are published as static files served
under https://www.congreso.es/webpublica/opendata/<section>/, but the filenames
include a timestamp suffix that is regenerated daily and differs between
formats of the same dataset, e.g.::

    DiputadosActivos__20260508050009.csv
    DiputadosActivos__20260508050010.xml
    DiputadosActivos__20260508050011.json

The timestamp is the exact moment each file was rewritten by the portal's
publishing job; it is not predictable from the client side. Therefore, to
locate the current download URL we fetch the listing page for the section and
extract the link whose path matches the expected filename prefix.

URL anatomy::

    Listing pages: /es/opendata/{section}
        section ∈ {diputados, votaciones, iniciativas, intervenciones, organos}
    Static files:  /webpublica/opendata/{section}/<prefix>__<timestamp>.<ext>

Per-vote URLs follow a deterministic directory layout, but the filename also
carries a timestamp::

    /webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/Votacion<NNN>/VOT_<ts>.<ext>

A ZIP bundling all votes for a session lives at the session directory::

    /webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/VOT_<ts>.zip

The vote importer drives session/vote enumeration from the votes listing page
HTML (see :meth:`CongresoClient.fetch_votes_listing_html`); this client stays
deliberately thin and does not parse vote payloads.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal
from urllib.parse import urljoin

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)

FileFormat = Literal["json", "xml", "csv", "zip"]
InitiativeDataset = Literal[
    "approved_legislative",
    "government_bills",
    "parliamentary_bills",
    "statute_reforms",
]

LISTING_PATH_DEPUTIES = "/es/opendata/diputados"
LISTING_PATH_VOTES = "/es/opendata/votaciones"
LISTING_PATH_INITIATIVES = "/es/opendata/iniciativas"
LISTING_PATH_INTERVENTIONS = "/es/opendata/intervenciones"
LISTING_PATH_BODIES = "/es/opendata/organos"
CALENDAR_PATH = "/es/calendario-de-sesiones-plenarias"

FILE_ROOT = "/webpublica/opendata"

# Filename prefixes published by the portal. The portal regenerates each file
# daily, appending a fresh timestamp; we anchor discovery on the prefix only.
_INITIATIVE_PREFIXES: dict[InitiativeDataset, str] = {
    "approved_legislative": "IniciativasLegislativasAprobadas",
    "government_bills": "ProyectosDeLey",
    "parliamentary_bills": "ProposicionesDeLey",
    "statute_reforms": "PropuestasDeReforma",
}


class CongresoOpenDataError(RuntimeError):
    """Raised when the open data portal does not expose an expected resource."""


class CongresoClient:
    """Async HTTP client for the Congreso open data portal.

    Use as an async context manager so the underlying httpx client is reused
    across calls and properly closed::

        async with CongresoClient() as client:
            raw = await client.fetch_active_deputies(fmt="json")
    """

    def __init__(self, base_url: str | None = None, timeout: float = 30.0) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.congreso_opendata_base_url).rstrip("/")
        self.user_agent = settings.congreso_user_agent
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> CongresoClient:
        self._client = httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": self.user_agent},
            follow_redirects=True,
        )
        return self

    async def __aexit__(self, *args: object) -> None:
        if self._client is not None:
            await self._client.aclose()

    # ------------------------------------------------------------------
    # Low-level transport
    # ------------------------------------------------------------------

    async def _get(self, url: str, *, accept: str = "*/*") -> httpx.Response:
        if self._client is None:
            raise RuntimeError("CongresoClient must be used as an async context manager.")

        log.info("congreso.fetch", url=url)
        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(3),
                wait=wait_exponential(multiplier=1, min=2, max=20),
                retry=retry_if_exception_type((httpx.HTTPError,)),
                reraise=True,
            ):
                with attempt:
                    response = await self._client.get(url, headers={"Accept": accept})
                    response.raise_for_status()
                    return response
        except RetryError as e:
            log.error("congreso.fetch.failed", url=url, error=str(e))
            raise
        raise RuntimeError("Unreachable")  # mypy

    def _absolute(self, path_or_url: str) -> str:
        """Return an absolute URL, joining `path_or_url` against the configured base."""
        if path_or_url.startswith(("http://", "https://")):
            return path_or_url
        return urljoin(self.base_url + "/", path_or_url.lstrip("/"))

    async def fetch_bytes(self, path_or_url: str) -> bytes:
        """Fetch raw bytes from a path (relative to base_url) or absolute URL."""
        response = await self._get(self._absolute(path_or_url))
        return response.content

    async def fetch_html(self, path_or_url: str) -> str:
        """Fetch text decoded as HTML."""
        response = await self._get(self._absolute(path_or_url), accept="text/html")
        # Rely on httpx's charset detection; fall back to utf-8.
        return response.text

    async def head_status(self, path_or_url: str) -> int:
        """Send a HEAD request, return the bare HTTP status (no redirect follow).

        Used by the backfill enumerator to discriminate the directory tree
        under ``/webpublica/opendata/votaciones/``: missing folders return
        404, existing ones 301-redirect to the trailing-slash form. We DO
        NOT want httpx to follow the redirect — the redirected GET on the
        directory itself returns 403 (Apache ``Indexes`` is off) which is
        less informative than the 301 itself.
        """
        if self._client is None:
            raise RuntimeError("CongresoClient must be used as an async context manager.")
        url = self._absolute(path_or_url)
        try:
            response = await self._client.request("HEAD", url, follow_redirects=False)
            return response.status_code
        except httpx.HTTPError as e:
            log.warning("congreso.head.error", url=url, error=str(e))
            return 0

    # ------------------------------------------------------------------
    # URL discovery (scrape listing page for the current timestamped link)
    # ------------------------------------------------------------------

    async def discover_dataset_url(
        self, listing_path: str, file_prefix: str, fmt: FileFormat
    ) -> str:
        """Find the current download URL for `<file_prefix>__<ts>.<fmt>` on `listing_path`.

        Raises :class:`CongresoOpenDataError` if no matching link is present.
        """
        html = await self.fetch_html(listing_path)
        match = _LINK_PATTERN(file_prefix, fmt).search(html)
        if not match:
            raise CongresoOpenDataError(
                f"No download link matching {file_prefix}__*.{fmt} on {listing_path}"
            )
        return self._absolute(match.group("href"))

    # ------------------------------------------------------------------
    # Datasets — deputies
    # ------------------------------------------------------------------

    async def fetch_active_deputies(self, fmt: FileFormat = "json") -> bytes:
        """Currently-active deputies of the ongoing legislature."""
        url = await self.discover_dataset_url(LISTING_PATH_DEPUTIES, "DiputadosActivos", fmt)
        return await self.fetch_bytes(url)

    async def fetch_inactive_deputies(self, fmt: FileFormat = "json") -> bytes:
        """Deputies who left mid-legislature (resigned, deceased, etc.)."""
        url = await self.discover_dataset_url(LISTING_PATH_DEPUTIES, "DiputadosDeBaja", fmt)
        return await self.fetch_bytes(url)

    async def fetch_legislature_deputies(
        self, legislature_number: int, fmt: FileFormat = "json"
    ) -> bytes:
        """Historical roster of deputies for a specific legislature.

        ``legislature_number`` follows the Congreso convention:
        00 = Constituyente, 01 = I, …, 14 = XIV. The current (XV) legislature
        is exposed as the live ``DiputadosActivos`` dataset, not as a snapshot.
        """
        if not 0 <= legislature_number <= 99:
            raise ValueError("legislature_number must be in 0..99")
        prefix = f"odsDiputados{legislature_number:02d}"
        url = await self.discover_dataset_url(LISTING_PATH_DEPUTIES, prefix, fmt)
        return await self.fetch_bytes(url)

    # ------------------------------------------------------------------
    # Datasets — initiatives
    # ------------------------------------------------------------------

    async def fetch_initiatives(
        self, dataset: InitiativeDataset, fmt: FileFormat = "json"
    ) -> bytes:
        """Initiatives dataset for the current legislature.

        ``dataset`` selects which initiative type to fetch:

        - ``approved_legislative``: initiatives that have been approved.
        - ``government_bills``: ``Proyectos de Ley`` (executive bills).
        - ``parliamentary_bills``: ``Proposiciones de Ley`` (parliamentary group bills).
        - ``statute_reforms``: ``Propuestas de Reforma de Estatuto``.
        """
        prefix = _INITIATIVE_PREFIXES[dataset]
        url = await self.discover_dataset_url(LISTING_PATH_INITIATIVES, prefix, fmt)
        return await self.fetch_bytes(url)

    # ------------------------------------------------------------------
    # Datasets — votes
    # ------------------------------------------------------------------

    async def fetch_votes_listing_html(self) -> str:
        """Raw HTML of the votes listing page.

        The vote importer parses this page to enumerate sessions and per-vote
        URLs. We expose the HTML rather than baking parsing into the client to
        keep this module a thin transport layer.
        """
        return await self.fetch_html(LISTING_PATH_VOTES)

    async def fetch_latest_session_zip(self) -> SessionZipBundle | None:
        """Discover and download the ZIP bundling the latest session's votes.

        The portal's votes listing page only exposes the most recent session of
        the active legislature. This method scrapes that page, extracts the
        ``(legislature, session_number, date, zip_url)`` tuple, and downloads
        the ZIP bytes. Returns ``None`` if no session is exposed (rare; e.g.
        between legislatures or during a long recess).

        We also parse the listing HTML for ``(Núm. expte. NNN/NNNNNN)`` markers
        next to each vote — see :func:`parse_vote_expedientes`. Without this
        the per-vote XML offers no way to recover the legislative initiative
        each vote refers to.

        For historical sessions of the same or any prior legislature, use
        :meth:`fetch_session_zip_for_date` — it drives the same portlet but
        with a ``targetDate=DD/MM/YYYY`` query parameter so the listing
        renders the requested day's session.
        """
        html = await self.fetch_votes_listing_html()
        ref = parse_latest_session_ref(html)
        if ref is None:
            return None
        zip_bytes = await self.fetch_bytes(ref.zip_url)
        expedientes = parse_vote_expedientes(html)
        graphics = parse_vote_graphic_urls(html, base_url=self.base_url)
        return SessionZipBundle(
            ref=ref,
            zip_bytes=zip_bytes,
            expedientes_by_vote=expedientes,
            graphic_urls_by_vote=graphics,
        )

    async def fetch_votes_listing_html_for_date(
        self, legislature_roman: str, target_date: date
    ) -> str:
        """Raw HTML of the votaciones portlet for one specific session date.

        The portlet's ``onChangeDate`` JS calls
        ``getBaseUrl() + "&targetDate=" + formatDate(date)`` where
        ``formatDate`` produces ``DD/MM/YYYY`` — and the server, when given
        that exact format, renders the requested day's session inline
        (ZIP URL, per-vote XML/PNG/PDF URLs, expediente labels, vote totals).

        Earlier research note in ``docs/research-similar-projects.md``
        recorded ``targetDate=YYYYMMDD`` as silently ignored. That was the
        wrong format — the server only accepts the slash-delimited form
        the JS produces. Verified empirically against legislatures XIV
        and XV across multiple dates.
        """
        path = (
            f"{LISTING_PATH_VOTES}?p_p_id=votaciones&p_p_lifecycle=0"
            f"&p_p_state=normal&p_p_mode=view"
            f"&targetLegislatura={legislature_roman}"
            f"&targetDate={target_date.day:02d}/{target_date.month:02d}/{target_date.year}"
        )
        return await self.fetch_html(path)

    async def fetch_session_zip_for_date(
        self, legislature_roman: str, target_date: date
    ) -> SessionZipBundle | None:
        """Download the per-session ZIP for ``target_date`` of ``legislature_roman``.

        Drives the votaciones portlet at
        ``targetDate=DD/MM/YYYY`` (see
        :meth:`fetch_votes_listing_html_for_date`), parses the inlined
        ``(legislature, session_number, date, zip_url)`` tuple, downloads the
        ZIP, and harvests the same expediente / graphic URL maps the latest-
        session path produces.

        Returns ``None`` if the portlet does not render a session for that
        date — e.g. ``target_date`` was not a plenary-vote day, the day was
        cancelled, or the portlet bounced to a default page. Callers that
        already pulled ``diasVotaciones`` for the legislature can trust that
        every date in that array yields a non-``None`` bundle.

        Args:
            legislature_roman: ``"X"`` .. ``"XV"``. The portlet only
                accepts Roman numerals here; numeric values silently fall
                back to the default current legislature.
            target_date: any plenary-vote date of that legislature.
        """
        html = await self.fetch_votes_listing_html_for_date(legislature_roman, target_date)
        ref = parse_latest_session_ref(html)
        if ref is None:
            return None
        # Sanity check: the rendered session date should match what we asked
        # for. If not, the portlet bounced (probably an unrecognised date)
        # and we'd otherwise re-import the legislature's latest session
        # under the wrong date label.
        if ref.date != target_date:
            log.warning(
                "congreso.session.date_mismatch",
                requested=target_date.isoformat(),
                rendered=ref.date.isoformat(),
                legislature=legislature_roman,
            )
            return None
        zip_bytes = await self.fetch_bytes(ref.zip_url)
        expedientes = parse_vote_expedientes(html)
        graphics = parse_vote_graphic_urls(html, base_url=self.base_url)
        return SessionZipBundle(
            ref=ref,
            zip_bytes=zip_bytes,
            expedientes_by_vote=expedientes,
            graphic_urls_by_vote=graphics,
        )

    # ------------------------------------------------------------------
    # Datasets — upcoming agenda (orden del día)
    # ------------------------------------------------------------------

    async def fetch_calendar_html(self) -> str:
        """Raw HTML of the plenary sessions calendar landing page.

        The agenda parser (see :mod:`app.ingest.congreso.agenda`) consumes this
        to extract the link to the next published orden del día PDF and the
        list of plenary days flagged on the calendar grid.
        """
        return await self.fetch_html(CALENDAR_PATH)

    async def fetch_orden_del_dia_pdf(self, url: str) -> bytes:
        """Download an orden del día PDF.

        ``url`` may be relative (``/backoffice_doc/atp/orden_dia/...``) or
        absolute. The PDF is served as a Word-generated ~1-7 page document
        with selectable text — :func:`app.ingest.congreso.agenda.parse_orden_del_dia_pdf`
        consumes the bytes directly.
        """
        return await self.fetch_bytes(url)


@dataclass(frozen=True, slots=True)
class SessionRef:
    """A session reference extracted from the votes listing page."""

    legislature: int
    session_number: int
    date: date
    zip_url: str


@dataclass(frozen=True, slots=True)
class SessionZipBundle:
    """Latest session ZIP plus the metadata needed to import it.

    ``expedientes_by_vote`` maps the integer vote number within the session
    (1, 2, 3, …) to the initiative's official id (e.g. ``"162/000745"``) when
    one is associated, taken from the listing page's ``(Núm. expte. ...)``
    annotations. Votes with no initiative (some Plenary motions and
    constitutional reform totalidad debates) are absent from the dict.

    ``graphic_urls_by_vote`` maps each vote number to the absolute URL of the
    seat-map PNG the portal renders alongside the vote (deputies plotted as
    green/red/yellow dots in the hemicycle layout). The file is also inside
    the per-session ZIP (``sesionNNNvotacionM.png``); we store the URL so
    the frontend can lazy-load it directly without us re-serving the asset.
    """

    ref: SessionRef
    zip_bytes: bytes
    expedientes_by_vote: dict[int, str]
    graphic_urls_by_vote: dict[int, str]


# ``/webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/VOT_<ts>.zip``
_SESSION_ZIP_RE = re.compile(
    r"/webpublica/opendata/votaciones/Leg(?P<leg>\d+)/Sesion(?P<sesion>\d+)/"
    r"(?P<y>\d{4})(?P<m>\d{2})(?P<d>\d{2})/VOT_\d+\.zip",
    re.IGNORECASE,
)


_EXPTE_RE = re.compile(
    r"N[uú]m\.\s*expte\.\s*(?P<official_id>\d+/\d+(?:/\d+)?)",
    re.IGNORECASE,
)
_VOTACION_DIR_RE = re.compile(r"/Votacion(?P<num>\d+)/", re.IGNORECASE)


def parse_vote_expedientes(html: str) -> dict[int, str]:
    """Extract ``{vote_number: official_id}`` mappings from the votes listing HTML.

    The listing renders one row per vote. Inside the row, an anchor with the
    visible text ``(Núm. expte. NNN/NNNNNN)`` precedes the row's per-vote file
    links such as ``/Votacion001/VOT_*.xml``. We walk the document in order:
    each ``Votacion<N>`` directory reference inherits the most recently seen
    expediente unless we've already mapped that vote number (votes appear
    multiple times — once per file format).

    proyecto-colibri (2014-2018) used the same trick on the previous portal;
    the markup changed in the 2020 redesign but the expediente label format
    is dictated by parliamentary document conventions and survived.
    """
    mapping: dict[int, str] = {}
    current: str | None = None
    for token in re.finditer(
        r"(?:" + _EXPTE_RE.pattern + r"|" + _VOTACION_DIR_RE.pattern + r")",
        html,
        flags=re.IGNORECASE,
    ):
        official_id = token.group("official_id")
        vote_num = token.group("num")
        if official_id is not None:
            current = official_id
        elif vote_num is not None and current is not None:
            n = int(vote_num)
            mapping.setdefault(n, current)
    return mapping


_GRAPHIC_RE = re.compile(
    r'src=["\'](?P<href>[^"\']*?/Votacion(?P<num>\d+)/VOT_\d+\.png)["\']',
    re.IGNORECASE,
)


def parse_vote_graphic_urls(html: str, *, base_url: str = "") -> dict[int, str]:
    """Extract ``{vote_number: png_absolute_url}`` from the votes listing HTML.

    The listing renders one ``<img class="img_graf_vot" src=".../VotacionN/VOT_*.png">``
    per vote — the official seat-map graphic of who voted what. We absolutize
    the href against ``base_url`` so callers can store ready-to-use URLs.
    """
    base = base_url.rstrip("/")
    mapping: dict[int, str] = {}
    for match in _GRAPHIC_RE.finditer(html):
        n = int(match.group("num"))
        href = match.group("href")
        if href.startswith(("http://", "https://")):
            absolute = href
        elif base:
            absolute = f"{base}/{href.lstrip('/')}"
        else:
            absolute = href
        mapping.setdefault(n, absolute)
    return mapping


def parse_latest_session_ref(html: str) -> SessionRef | None:
    """Extract the latest session reference from the votes listing page HTML.

    The page lists the most recent session at the top, so the *first* ZIP link
    we find is the latest one. We do not assume any particular surrounding
    markup: the URL itself encodes legislature, session number and date.
    """
    match = _SESSION_ZIP_RE.search(html)
    if match is None:
        return None
    return SessionRef(
        legislature=int(match.group("leg")),
        session_number=int(match.group("sesion")),
        date=date(int(match.group("y")), int(match.group("m")), int(match.group("d"))),
        zip_url=match.group(0),
    )


def _LINK_PATTERN(file_prefix: str, fmt: FileFormat) -> re.Pattern[str]:  # noqa: N802
    """Build a regex that matches an HTML href to a timestamped opendata file.

    The match captures the href value (relative or absolute) so we can resolve
    it against the configured base URL.
    """
    return re.compile(
        r'href=["\'](?P<href>[^"\']*'
        + re.escape(FILE_ROOT)
        + r'/[^/"\']+/'
        + re.escape(file_prefix)
        + r"__\d+\."
        + re.escape(fmt)
        + r')["\']',
        re.IGNORECASE,
    )
