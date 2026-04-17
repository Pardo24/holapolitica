"""Importer for the Congreso legislative-process initiative datasets.

Three JSON datasets feed this importer (all under
``/webpublica/opendata/iniciativas/``):

- ``ProyectosDeLey`` — government bills (``"Proyecto de ley"``).
- ``ProposicionesDeLey`` — parliamentary group bills.
- ``PropuestasDeReforma`` — reforms of regional autonomy statutes.

Each record is keyed by ``NUMEXPEDIENTE`` (e.g. ``"121/000001/0000"``), which
is the natural ID we store in :class:`Initiative.official_id`. We do not yet
link votes to initiatives by official id — the per-vote XML does not expose
the expediente number — so :class:`Vote.initiative_id` stays NULL until a
backfill task wires the link via the Diario de Sesiones / BOCG references.

The fourth dataset on the portal, ``IniciativasLegislativasAprobadas``, lists
final published laws (BOE references) rather than the parliamentary process,
so it is not handled here.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.parse import ParsedInitiative, parse_initiative
from app.models import (
    Chamber,
    Initiative,
    InitiativeStatus,
    InitiativeType,
    Legislature,
)

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class InitiativeImportStats:
    seen: int = 0
    created: int = 0
    updated: int = 0


@dataclass(frozen=True, slots=True)
class InitiativeImportResult:
    stats: InitiativeImportStats
    # ``official_id`` strings of initiatives created in this run. Callers
    # use this to fire downstream enrichment (classification, plain-language
    # summary) only for the new rows. Updated rows already have their
    # enrichment from prior runs.
    new_official_ids: tuple[str, ...]


class InitiativeImporter:
    """Upsert initiatives for a chamber/legislature from a JSON payload."""

    def __init__(self, session: AsyncSession, chamber: Chamber, legislature: Legislature) -> None:
        self.session = session
        self.chamber = chamber
        self.legislature = legislature

    async def import_payload(self, payload: bytes) -> InitiativeImportResult:
        records = json.loads(payload)
        if not isinstance(records, list):
            raise ValueError(f"Expected JSON list, got {type(records).__name__}")

        existing = await self._load_existing()
        stats = InitiativeImportStats()
        new_ids: list[str] = []
        for raw in records:
            parsed = parse_initiative(raw)
            before_created = stats.created
            stats = self._upsert_one(parsed, raw, existing, stats)
            if stats.created > before_created:
                new_ids.append(parsed.official_id)

        await self.session.commit()
        log.info("congreso.initiatives.import.done", **asdict(stats))
        return InitiativeImportResult(stats=stats, new_official_ids=tuple(new_ids))

    async def _load_existing(self) -> dict[str, Initiative]:
        result = await self.session.execute(
            select(Initiative).where(Initiative.chamber_id == self.chamber.id)
        )
        return {i.official_id: i for i in result.scalars()}

    def _upsert_one(
        self,
        parsed: ParsedInitiative,
        raw: dict[str, str],
        existing: dict[str, Initiative],
        stats: InitiativeImportStats,
    ) -> InitiativeImportStats:
        from app.ingest.congreso.parse import classify_initiative_status

        status = classify_initiative_status(parsed.situation_raw, parsed.result_raw)
        type_enum = InitiativeType(parsed.type_code)
        status_enum = InitiativeStatus(status)

        current = existing.get(parsed.official_id)
        if current is None:
            self.session.add(
                Initiative(
                    chamber_id=self.chamber.id,
                    legislature_id=self.legislature.id,
                    type=type_enum,
                    official_id=parsed.official_id,
                    title_original=parsed.title,
                    status=status_enum,
                    submitted_at=parsed.submitted_at,
                    submitted_by=parsed.submitted_by,
                    source_url=parsed.source_url,
                )
            )
            return InitiativeImportStats(
                seen=stats.seen + 1,
                created=stats.created + 1,
                updated=stats.updated,
            )

        # Refresh mutable fields. The portal occasionally reclassifies an
        # initiative or updates its status as it moves through committee.
        changed = False
        if current.title_original != parsed.title:
            current.title_original = parsed.title
            changed = True
        if current.status is not status_enum:
            current.status = status_enum
            changed = True
        if current.type is not type_enum:
            current.type = type_enum
            changed = True
        if current.submitted_at != parsed.submitted_at:
            current.submitted_at = parsed.submitted_at
            changed = True
        if current.submitted_by != parsed.submitted_by:
            current.submitted_by = parsed.submitted_by
            changed = True
        if current.source_url != parsed.source_url:
            current.source_url = parsed.source_url
            changed = True
        return InitiativeImportStats(
            seen=stats.seen + 1,
            created=stats.created,
            updated=stats.updated + (1 if changed else 0),
        )
