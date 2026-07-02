"""Importer for the active deputies dataset of the Congreso open data portal.

Idempotency
-----------
The importer is designed to be re-run on the same legislature without creating
duplicates. We dedup using natural keys:

- :class:`Person` by ``full_name`` (homonyms are extremely rare in a single
  active legislature; if they appear we'll add a discriminator at that point).
- :class:`ParliamentaryGroup` by ``(legislature_id, slug)``.
- :class:`Mandate` by ``(person_id, legislature_id, start_date)``.
- :class:`GroupMembership` by ``(mandate_id, group_id, start_date)``.

Group changes mid-legislature
-----------------------------
The active-deputies file only reports the *current* parliamentary group. When a
deputy switches groups, the next import sees the new group as the current one;
we close the previous open ``GroupMembership`` (set ``end_date``) and open a
new one for the new group. Historical attribution of past votes therefore
continues to look up the group that was open on the vote's date — see the
``GroupMembership`` model docstring.

Departures mid-legislature
--------------------------
When a deputy resigns their seat, the portal simply drops them from the
active-deputies file — there is no explicit "left on date X" record. With
``close_missing=True`` (used by the daily active-roster ingest, never by
historical snapshots) any open :class:`Mandate` in this legislature whose
person did NOT appear in the payload gets closed (``end_date = today``),
along with its open :class:`GroupMembership`. Guarded by a minimum roster
size so a truncated/failed download can never mass-close the chamber.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.ingest.congreso.parse import ParsedDeputy, parse_active_deputy
from app.models import (
    Chamber,
    GroupMembership,
    Legislature,
    Mandate,
    ParliamentaryGroup,
    Person,
)

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ImportStats:
    """Counters returned by an importer run, for logging and tests."""

    deputies_seen: int = 0
    persons_created: int = 0
    groups_created: int = 0
    mandates_created: int = 0
    memberships_created: int = 0
    memberships_closed: int = 0
    mandates_closed: int = 0


# ``close_missing`` refuses to close anything when the payload carries fewer
# rows than this. The Congreso has 350 seats; a healthy active-deputies file
# always hovers at 348-350 rows (vacant seats pending substitution). Anything
# materially below that means a truncated download or an upstream incident —
# closing mandates on that evidence would wreck the hemicycle and every
# per-deputy surface, so we skip and log instead.
_CLOSE_MISSING_MIN_ROSTER = 300


class DeputyImporter:
    """Upsert active deputies for a given chamber and legislature."""

    def __init__(self, session: AsyncSession, chamber: Chamber, legislature: Legislature) -> None:
        self.session = session
        self.chamber = chamber
        self.legislature = legislature

    async def import_payload(self, payload: bytes, *, close_missing: bool = False) -> ImportStats:
        """Parse and upsert the active-deputies JSON payload.

        ``payload`` is the raw bytes returned by
        :meth:`CongresoClient.fetch_active_deputies`.

        With ``close_missing=True``, open mandates in this legislature whose
        person did not appear in the payload are closed afterwards (deputy
        left the chamber). Only pass it for the *active* roster dataset —
        historical snapshots must never close anything.
        """
        records = json.loads(payload)
        if not isinstance(records, list):
            raise ValueError(f"Expected a top-level JSON list, got {type(records).__name__}")

        stats = ImportStats()
        # Pre-load existing groups to avoid one extra round-trip per record.
        groups_by_slug = await self._load_groups()

        seen_mandate_ids: set[int] = set()
        for raw in records:
            parsed = parse_active_deputy(raw)
            stats = await self._upsert_one(parsed, groups_by_slug, stats, seen_mandate_ids)

        if close_missing:
            stats = await self._close_missing_mandates(seen_mandate_ids, stats)

        await self.session.commit()
        log.info("congreso.deputies.import.done", **asdict(stats))
        return stats

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _load_groups(self) -> dict[str, ParliamentaryGroup]:
        result = await self.session.execute(
            select(ParliamentaryGroup).where(
                ParliamentaryGroup.legislature_id == self.legislature.id
            )
        )
        return {g.slug: g for g in result.scalars()}

    async def _upsert_one(
        self,
        parsed: ParsedDeputy,
        groups_by_slug: dict[str, ParliamentaryGroup],
        stats: ImportStats,
        seen_mandate_ids: set[int],
    ) -> ImportStats:
        person, person_created = await self._get_or_create_person(parsed)
        group, group_created = self._get_or_create_group(parsed, groups_by_slug)
        if person_created or group_created:
            # Flush so the new rows have ids that downstream queries can use.
            await self.session.flush()

        mandate, mandate_created = await self._get_or_create_mandate(parsed, person)
        if mandate_created:
            await self.session.flush()
        seen_mandate_ids.add(mandate.id)

        membership_created, membership_closed = await self._reconcile_membership(
            parsed, mandate, group
        )

        return ImportStats(
            deputies_seen=stats.deputies_seen + 1,
            persons_created=stats.persons_created + (1 if person_created else 0),
            groups_created=stats.groups_created + (1 if group_created else 0),
            mandates_created=stats.mandates_created + (1 if mandate_created else 0),
            memberships_created=stats.memberships_created + (1 if membership_created else 0),
            memberships_closed=stats.memberships_closed + (1 if membership_closed else 0),
            mandates_closed=stats.mandates_closed,
        )

    async def _close_missing_mandates(
        self, seen_mandate_ids: set[int], stats: ImportStats
    ) -> ImportStats:
        """Close open mandates whose person vanished from the active roster.

        The portal drops departed deputies from the file without any
        explicit end-of-mandate record, so "open in DB but absent from
        today's roster" IS the departure signal. We stamp ``end_date =
        today`` (the real date is within the last day, since this runs
        daily) and close the open group membership alongside so the seat
        frees up on the hemicycle and group counts stay at 350.
        """
        if stats.deputies_seen < _CLOSE_MISSING_MIN_ROSTER:
            log.warning(
                "congreso.deputies.close_missing.skipped_small_roster",
                deputies_seen=stats.deputies_seen,
                minimum=_CLOSE_MISSING_MIN_ROSTER,
            )
            return stats

        result = await self.session.execute(
            select(Mandate, Person.full_name)
            .join(Person, Person.id == Mandate.person_id)
            .where(Mandate.legislature_id == self.legislature.id)
            .where(Mandate.end_date.is_(None))
            .where(Mandate.id.not_in(seen_mandate_ids))
        )
        today = date.today()
        closed = 0
        for mandate, full_name in result.all():
            mandate.end_date = today
            memberships = await self.session.execute(
                select(GroupMembership)
                .where(GroupMembership.mandate_id == mandate.id)
                .where(GroupMembership.end_date.is_(None))
            )
            for m in memberships.scalars():
                m.end_date = today
            closed += 1
            log.info(
                "congreso.deputies.mandate_closed",
                person=full_name,
                mandate_id=mandate.id,
                end_date=today.isoformat(),
            )

        return ImportStats(**{**asdict(stats), "mandates_closed": closed})

    async def _get_or_create_person(self, parsed: ParsedDeputy) -> tuple[Person, bool]:
        result = await self.session.execute(
            select(Person).where(Person.full_name == parsed.name.full_name)
        )
        person = result.scalar_one_or_none()
        if person is not None:
            return person, False

        person = Person(
            full_name=parsed.name.full_name,
            given_names=parsed.name.given_names,
            family_names=parsed.name.family_names,
        )
        self.session.add(person)
        return person, True

    def _get_or_create_group(
        self,
        parsed: ParsedDeputy,
        groups_by_slug: dict[str, ParliamentaryGroup],
    ) -> tuple[ParliamentaryGroup, bool]:
        existing = groups_by_slug.get(parsed.group_slug)
        if existing is not None:
            return existing, False

        group = ParliamentaryGroup(
            legislature_id=self.legislature.id,
            slug=parsed.group_slug,
            name_short=parsed.group_name_short,
            name_long=parsed.group_name_long,
        )
        self.session.add(group)
        groups_by_slug[parsed.group_slug] = group
        return group, True

    async def _get_or_create_mandate(
        self, parsed: ParsedDeputy, person: Person
    ) -> tuple[Mandate, bool]:
        result = await self.session.execute(
            select(Mandate)
            .where(Mandate.person_id == person.id)
            .where(Mandate.legislature_id == self.legislature.id)
            .where(Mandate.start_date == parsed.mandate_start_date)
        )
        mandate = result.scalar_one_or_none()
        if mandate is not None:
            # Refresh mutable fields that may have changed (e.g. constituency
            # corrections published by the portal).
            mandate.constituency = parsed.constituency
            mandate.electoral_list_party = parsed.electoral_list_party
            return mandate, False

        mandate = Mandate(
            person_id=person.id,
            chamber_id=self.chamber.id,
            legislature_id=self.legislature.id,
            start_date=parsed.mandate_start_date,
            end_date=None,
            constituency=parsed.constituency,
            electoral_list_party=parsed.electoral_list_party,
        )
        self.session.add(mandate)
        return mandate, True

    async def _reconcile_membership(
        self, parsed: ParsedDeputy, mandate: Mandate, group: ParliamentaryGroup
    ) -> tuple[bool, bool]:
        """Open the current membership; close any other open membership.

        Returns ``(created, closed)`` flags.
        """
        result = await self.session.execute(
            select(GroupMembership).where(GroupMembership.mandate_id == mandate.id)
        )
        memberships = list(result.scalars())

        for m in memberships:
            if m.group_id == group.id and m.start_date == parsed.group_membership_start_date:
                # Already recorded; keep open.
                if m.end_date is not None:
                    m.end_date = None
                return False, False

        # Close any membership still open with a different group.
        closed = False
        for m in memberships:
            if m.end_date is None and m.group_id != group.id:
                m.end_date = _previous_day(parsed.group_membership_start_date)
                closed = True

        new_membership = GroupMembership(
            mandate_id=mandate.id,
            group_id=group.id,
            start_date=parsed.group_membership_start_date,
            end_date=None,
        )
        self.session.add(new_membership)
        return True, closed


def _previous_day(d: date) -> date:
    """Return the day before ``d`` (used to close out a previous group membership)."""
    return d - timedelta(days=1)
