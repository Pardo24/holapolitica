"""Search-portlet importers for the three series that complement PNL.

The PNL importer in :mod:`pnl` discovered that the Liferay search
portlet at ``/es/busqueda-de-iniciativas`` is generic over the
``_iniciativas_tipo`` form field. PNLs (162) are the most-voted series
in the Congreso plenary, but three others matter for the vote→initiative
backfill too — they appear in the unmatched bucket every legislature:

* **173 — Moción consecuencia de interpelación**
    Follow-up motion after an interpellation. Usually voted in the
    plenary the next plenary week. Low volume (~50/legislature) but
    politically loaded.

* **130 — Convalidación o derogación de Real Decreto-ley**
    The Cortes must convalidate every Royal Decree-Law within 30 days
    or it expires. The vote *is* the convalidation; without this series
    the corresponding plenary vote has no initiative to link to.

* **102 — Reforma constitucional**
    Rare (one or two per legislature at most), but the only path to
    amend the 1978 Constitution. Linking the vote to the initiative
    here matters disproportionately for civic transparency.

This module is a thin wrapper: every entry point delegates to
:func:`import_pnl` with the right ``tipo`` / ``type_code`` pair, so the
HTTP plumbing, retry policy, pagination and idempotent upsert path are
shared verbatim with the PNL importer. Only the constants differ.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.core.logging import get_logger
from app.ingest.congreso.initiatives import (
    InitiativeImporter,
    InitiativeImportResult,
    InitiativeImportStats,
)
from app.ingest.congreso.pnl import PnlSearchClient, import_pnl

_SeriesImporter = Callable[..., Awaitable[InitiativeImportResult]]

log = get_logger(__name__)


# Initiative type codes for the Liferay portlet ``_iniciativas_tipo`` filter.
# See module docstring above for the meaning of each. Verified by inspecting
# the inline JS of the portal's search form (the codes are hardcoded into
# the type dropdown HTML).
TIPO_MOCION = "173"
TIPO_RDL_CONVALIDACION = "130"
TIPO_REFORMA_CONSTITUCIONAL = "102"


async def import_mocion(
    importer: InitiativeImporter,
    *,
    legislature_roman: str,
    client: PnlSearchClient | None = None,
) -> InitiativeImportResult:
    """Scrape every Moción (series 173) of ``legislature_roman``."""
    return await import_pnl(
        importer,
        legislature_roman=legislature_roman,
        client=client,
        tipo=TIPO_MOCION,
        type_code="mocion",
    )


async def import_rdl_convalidacion(
    importer: InitiativeImporter,
    *,
    legislature_roman: str,
    client: PnlSearchClient | None = None,
) -> InitiativeImportResult:
    """Scrape every RDL convalidation (series 130) of ``legislature_roman``."""
    return await import_pnl(
        importer,
        legislature_roman=legislature_roman,
        client=client,
        tipo=TIPO_RDL_CONVALIDACION,
        type_code="real_decreto_ley",
    )


async def import_reforma_constitucional(
    importer: InitiativeImporter,
    *,
    legislature_roman: str,
    client: PnlSearchClient | None = None,
) -> InitiativeImportResult:
    """Scrape every constitutional reform (series 102) of ``legislature_roman``."""
    return await import_pnl(
        importer,
        legislature_roman=legislature_roman,
        client=client,
        tipo=TIPO_REFORMA_CONSTITUCIONAL,
        # The InitiativeType enum has no dedicated constitutional-reform
        # value (these are vanishingly rare); fall through to OTHER so
        # downstream consumers don't need a special case.
        type_code="other",
    )


# ---------------------------------------------------------------------------
# Bootstrap entry points
# ---------------------------------------------------------------------------
#
# Each entry point opens its own DB session and resolves chamber/legislature
# the same way the other ``bootstrap.import_*`` steps do. Idempotent; safe
# to re-run. The bootstrap CLI prints :class:`InitiativeImportStats` so
# every entry returns the stats counters.


async def _import_xv_step(
    series_fn: _SeriesImporter,
    series_name: str,
) -> InitiativeImportStats:
    """Shared wrapper that all three XV entry points use.

    Keeps the per-series functions to two lines each — only the closure
    over ``series_fn`` differs. Imports lazily to break the circular
    import with ``bootstrap`` (which registers these entries).
    """
    from app.db.session import AsyncSessionLocal
    from app.ingest.congreso.bootstrap import (
        _get_active_legislature,
        _get_congreso_chamber,
    )

    async with AsyncSessionLocal() as session:
        chamber = await _get_congreso_chamber(session)
        legislature = await _get_active_legislature(session, chamber)
        importer = InitiativeImporter(session, chamber, legislature)
        result = await series_fn(importer, legislature_roman="XV")
        log.info(
            "congreso.series.import.done",
            series=series_name,
            **{
                "created": result.stats.created,
                "updated": result.stats.updated,
                "unchanged": result.stats.unchanged,
            },
        )
        return result.stats


async def import_mocion_xv() -> InitiativeImportStats:
    """Bootstrap entry point: import all Mociones (173) of legislature XV."""
    return await _import_xv_step(import_mocion, "mocion_xv")


async def import_rdl_convalidacion_xv() -> InitiativeImportStats:
    """Bootstrap entry point: import all RDL convalidations (130) of XV."""
    return await _import_xv_step(import_rdl_convalidacion, "rdl_convalidacion_xv")


async def import_reforma_constitucional_xv() -> InitiativeImportStats:
    """Bootstrap entry point: import all constitutional reforms (102) of XV."""
    return await _import_xv_step(
        import_reforma_constitucional, "reforma_constitucional_xv"
    )
