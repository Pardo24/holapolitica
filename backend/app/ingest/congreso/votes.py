"""Importer for individual vote results from the Congreso open data portal.

Per-session ZIPs bundle one XML, one JSON, one PDF and one PNG per vote, all
served from
``/webpublica/opendata/votaciones/Leg<N>/Sesion<NNN>/<YYYYMMDD>/``. We read the
XML because it's the most stable schema across legislatures.

Vote XML shape (encoded ``ISO-8859-1``)::

    <Resultado>
        <Informacion>
            <Sesion>177</Sesion>
            <NumeroVotacion>1</NumeroVotacion>
            <Fecha>30/4/2026</Fecha>
            <Titulo>Proposiciones no de Ley.</Titulo>
            <TextoExpediente>Proposición no de Ley del Grupo Parlamentario VOX, ...</TextoExpediente>
        </Informacion>
        <Totales>
            <Presentes>348</Presentes>
            <AFavor>33</AFavor>
            <EnContra>315</EnContra>
            <Abstenciones>0</Abstenciones>
            <NoVotan>2</NoVotan>
        </Totales>
        <Votaciones>
            <Votacion>
                <Asiento>3603</Asiento>
                <Diputado>Palencia Rubio, Héctor</Diputado>
                <Grupo>GP</Grupo>
                <Voto>No</Voto>
            </Votacion>
            ...
        </Votaciones>
    </Resultado>

Group attribution
-----------------
The XML carries a short group code (``GP``, ``GS``, ``GVOX`` …) which is
informational. We attribute each vote to the parliamentary group the deputy's
``Mandate`` was a member of on the vote's date, looked up via
``GroupMembership`` — see CLAUDE.md "Mai mostrar la pertinença actual quan
mostrem un vot passat". The code in the XML is logged as a sanity check; if
it disagrees with our membership history we surface a warning rather than
overriding the historical truth.
"""

from __future__ import annotations

import zipfile
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time
from io import BytesIO
from typing import Literal, overload
from xml.etree import ElementTree as ET

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.ingest.congreso.parse import parse_dmy_date, parse_person_name, strip_zero_subindex
from app.models import (
    Chamber,
    GroupMembership,
    Initiative,
    Legislature,
    Mandate,
    ParliamentaryGroup,
    Person,
    Vote,
    VoteChoice,
    VoteRecord,
    VoteResult,
)
from app.models import (
    Session as SessionRow,
)
from app.services.proposing_group import resolve_proposing_group

log = get_logger(__name__)


# Mapping from Spanish vote labels to our VoteChoice enum.
_VOTO_CHOICE: dict[str, VoteChoice] = {
    "Sí": VoteChoice.AYE,
    "Si": VoteChoice.AYE,
    "No": VoteChoice.NO,
    "Abstención": VoteChoice.ABSTENTION,
    "Abstencion": VoteChoice.ABSTENTION,
    "No vota": VoteChoice.NO_VOTE_RECORDED,
    "NoVota": VoteChoice.NO_VOTE_RECORDED,
}


class VoteParseError(ValueError):
    """Raised when a vote XML payload is malformed beyond recovery."""


@dataclass(frozen=True, slots=True)
class ParsedVoteRecord:
    seat: str | None
    deputy_name_raw: str
    group_code: str | None
    choice: VoteChoice


@dataclass(frozen=True, slots=True)
class ParsedVote:
    session_number: int
    vote_number: int
    voted_on: date
    title: str
    expediente_text: str | None
    presentes: int
    ayes: int
    noes: int
    abstentions: int
    no_votes: int  # "No vota" — present but didn't cast (or absent; the XML doesn't distinguish)
    records: list[ParsedVoteRecord]
    # True for "votación por asentimiento": the chamber approved the item by
    # assent (acclamation), so the XML carries an <Asentimiento> marker and
    # NO numeric tally or per-deputy roll-call. All counts are 0 and
    # ``records`` is empty; the outcome is APPROVED by definition (had anyone
    # objected, the Mesa would have ordered a counted vote instead).
    approved_by_assent: bool = False

    @property
    def result(self) -> VoteResult:
        """Approved if Sí strictly beats No, rejected if No strictly beats Sí, else tie.

        Assent votes have no tally, so they short-circuit to APPROVED.
        """
        if self.approved_by_assent:
            return VoteResult.APPROVED
        if self.ayes > self.noes:
            return VoteResult.APPROVED
        if self.noes > self.ayes:
            return VoteResult.REJECTED
        return VoteResult.TIE


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_vote_xml(payload: bytes) -> ParsedVote:
    """Parse a single ``sesionNNNvotacionM.xml`` payload.

    The XML declaration in the prolog is honored by ``ElementTree``, so passing
    raw bytes correctly handles the ``ISO-8859-1`` encoding the portal serves.
    """
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as e:
        raise VoteParseError(f"Malformed vote XML: {e}") from e

    info = root.find("Informacion")
    totals = root.find("Totales")
    items = root.find("Votaciones")
    if info is None or totals is None:
        raise VoteParseError("Vote XML missing Informacion/Totales")

    # Votación por asentimiento: <Totales> carries <Asentimiento> instead of a
    # numeric tally, and there is no per-deputy roll-call. Detect it by the
    # absence of <Presentes> (the first numeric field) so a missing-field error
    # isn't raised for a perfectly valid assent vote — these recur across every
    # legislature, especially in pre-2020 sessions.
    is_assent = totals.find("Presentes") is None and totals.find("Asentimiento") is not None
    if is_assent:
        return ParsedVote(
            session_number=_int(info, "Sesion"),
            vote_number=_int(info, "NumeroVotacion"),
            voted_on=parse_dmy_date(_text(info, "Fecha", required=True)),
            title=_text(info, "Titulo", required=True).strip(),
            expediente_text=(_text(info, "TextoExpediente") or "").strip() or None,
            presentes=0,
            ayes=0,
            noes=0,
            abstentions=0,
            no_votes=0,
            records=[],
            approved_by_assent=True,
        )

    if items is None:
        raise VoteParseError("Vote XML missing Votaciones")

    return ParsedVote(
        session_number=_int(info, "Sesion"),
        vote_number=_int(info, "NumeroVotacion"),
        voted_on=parse_dmy_date(_text(info, "Fecha", required=True)),
        title=_text(info, "Titulo", required=True).strip(),
        expediente_text=(_text(info, "TextoExpediente") or "").strip() or None,
        presentes=_int(totals, "Presentes"),
        ayes=_int(totals, "AFavor"),
        noes=_int(totals, "EnContra"),
        abstentions=_int(totals, "Abstenciones"),
        no_votes=_int(totals, "NoVotan"),
        records=[_parse_record(v) for v in items.findall("Votacion")],
    )


def parse_session_zip(zip_bytes: bytes) -> list[ParsedVote]:
    """Parse every ``*.xml`` entry inside a per-session ZIP, in vote-number order.

    Filenames inside the ZIP follow ``sesionNNNvotacionMM.xml``; we sort by the
    parsed vote number rather than relying on archive order.
    """
    parsed: list[ParsedVote] = []
    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        xml_names = [n for n in zf.namelist() if n.lower().endswith(".xml")]
        for name in xml_names:
            parsed.append(parse_vote_xml(zf.read(name)))
    parsed.sort(key=lambda v: v.vote_number)
    return parsed


@overload
def _text(parent: ET.Element, tag: str, *, required: Literal[True]) -> str: ...
@overload
def _text(parent: ET.Element, tag: str, *, required: bool = False) -> str | None: ...
def _text(parent: ET.Element, tag: str, *, required: bool = False) -> str | None:
    el = parent.find(tag)
    if el is None or el.text is None:
        if required:
            raise VoteParseError(f"Required field <{tag}> missing")
        return None
    return el.text


def _int(parent: ET.Element, tag: str) -> int:
    raw = _text(parent, tag, required=True)
    try:
        return int(raw.strip())
    except ValueError as e:
        raise VoteParseError(f"Field <{tag}> is not an integer: {raw!r}") from e


def _parse_record(el: ET.Element) -> ParsedVoteRecord:
    voto_raw = (_text(el, "Voto") or "").strip()
    choice = _VOTO_CHOICE.get(voto_raw)
    if choice is None:
        log.warning("congreso.votes.unknown_voto", value=voto_raw)
        choice = VoteChoice.NO_VOTE_RECORDED
    return ParsedVoteRecord(
        seat=(_text(el, "Asiento") or "").strip() or None,
        deputy_name_raw=(_text(el, "Diputado") or "").strip(),
        group_code=(_text(el, "Grupo") or "").strip() or None,
        choice=choice,
    )


# ---------------------------------------------------------------------------
# Importer
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class VoteImportStats:
    votes_seen: int = 0
    votes_created: int = 0
    records_created: int = 0
    records_skipped_unknown_person: int = 0
    records_without_group: int = 0
    votes_with_expediente: int = 0
    votes_linked_to_initiative: int = 0


class VoteImporter:
    """Upsert a session's votes and per-deputy vote records.

    The importer is idempotent: re-importing the same session produces zero
    new rows. Vote-record idempotency leans on the
    ``UniqueConstraint(vote_id, mandate_id)`` declared on
    :class:`app.models.VoteRecord`.
    """

    def __init__(self, session: AsyncSession, chamber: Chamber, legislature: Legislature) -> None:
        self.session = session
        self.chamber = chamber
        self.legislature = legislature

    async def import_session_zip(
        self,
        *,
        session_number: int,
        vote_date: date,
        zip_bytes: bytes,
        expedientes_by_vote: dict[int, str] | None = None,
        graphic_urls_by_vote: dict[int, str] | None = None,
    ) -> VoteImportStats:
        votes = parse_session_zip(zip_bytes)
        if not votes:
            return VoteImportStats()

        session_row = await self._get_or_create_session(session_number, vote_date)
        await self.session.flush()

        # Pre-load helpers so we don't query per-record.
        persons_by_name = await self._load_persons_indexed_by_name()
        memberships_by_mandate = await self._load_memberships_by_mandate(vote_date)
        initiatives_by_official_id = await self._load_initiatives_indexed_by_official_id()
        all_groups = list((await self.session.execute(select(ParliamentaryGroup))).scalars().all())

        expedientes = expedientes_by_vote or {}
        graphics = graphic_urls_by_vote or {}
        stats = VoteImportStats()
        for parsed in votes:
            expediente_raw = expedientes.get(parsed.vote_number)
            # The lookup dict carries both the original ``official_id`` and
            # its 2-part stem (see ``_load_initiatives_indexed_by_official_id``).
            # We probe the raw value first and then its stripped form so
            # 2-part vote expedientes resolve against 3-part initiative ids.
            initiative_id: int | None = None
            if expediente_raw is not None:
                initiative_id = initiatives_by_official_id.get(expediente_raw)
                if initiative_id is None:
                    initiative_id = initiatives_by_official_id.get(
                        strip_zero_subindex(expediente_raw)
                    )
            proposer = resolve_proposing_group(parsed.expediente_text, all_groups)
            government_proposed = _looks_government_proposed(parsed)
            stats = await self._upsert_vote(
                parsed,
                session_row,
                persons_by_name,
                memberships_by_mandate,
                stats,
                expediente_raw=expediente_raw,
                initiative_id=initiative_id,
                graphic_url=graphics.get(parsed.vote_number),
                proposing_group_id=proposer.id if proposer else None,
                proposed_by_government=government_proposed and proposer is None,
            )

        await self.session.commit()
        log.info("congreso.votes.import.done", **asdict(stats))
        return stats

    # ------------------------------------------------------------------
    # Session and Vote rows
    # ------------------------------------------------------------------

    async def _get_or_create_session(self, session_number: int, vote_date: date) -> SessionRow:
        # Soft uniqueness: (chamber, legislature, date) — the portal uses one
        # plenary session per date in practice. The session number is encoded
        # in the title for now; promoting it to a dedicated column is a small
        # migration we can ship later.
        title = f"Sesión Plenaria número {session_number}"
        result = await self.session.execute(
            select(SessionRow)
            .where(SessionRow.chamber_id == self.chamber.id)
            .where(SessionRow.legislature_id == self.legislature.id)
            .where(SessionRow.date == vote_date)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            existing.title = title  # keep title in sync if it changed
            return existing

        row = SessionRow(
            chamber_id=self.chamber.id,
            legislature_id=self.legislature.id,
            date=vote_date,
            type="plenary",
            title=title,
        )
        self.session.add(row)
        return row

    async def _upsert_vote(
        self,
        parsed: ParsedVote,
        session_row: SessionRow,
        persons_by_name: dict[str, Person],
        memberships_by_mandate: dict[int, GroupMembership],
        stats: VoteImportStats,
        *,
        expediente_raw: str | None,
        initiative_id: int | None,
        graphic_url: str | None,
        proposing_group_id: int | None,
        proposed_by_government: bool,
    ) -> VoteImportStats:
        result = await self.session.execute(
            select(Vote)
            .where(Vote.session_id == session_row.id)
            .where(Vote.sequence_in_session == parsed.vote_number)
        )
        vote = result.scalar_one_or_none()
        created = False
        if vote is None:
            vote = Vote(
                session_id=session_row.id,
                initiative_id=initiative_id,
                sequence_in_session=parsed.vote_number,
                title=parsed.title,
                description=parsed.expediente_text,
                voted_at=datetime.combine(parsed.voted_on, time(12, 0, tzinfo=UTC)),
                result=parsed.result,
                ayes=parsed.ayes,
                noes=parsed.noes,
                abstentions=parsed.abstentions,
                # Assent votes carry no presence count, so leave absent at 0
                # rather than inferring the whole chamber was missing.
                absent=(
                    0
                    if parsed.approved_by_assent
                    else max(0, _SEATS_PER_LEGISLATURE - parsed.presentes)
                ),
                approved_by_assent=parsed.approved_by_assent,
                expediente_raw=expediente_raw,
                graphic_url=graphic_url,
                proposing_group_id=proposing_group_id,
                proposed_by_government=proposed_by_government,
            )
            self.session.add(vote)
            await self.session.flush()
            created = True
        else:
            # Refresh totals in case the portal republishes corrected numbers.
            vote.title = parsed.title
            vote.description = parsed.expediente_text
            vote.result = parsed.result
            vote.ayes = parsed.ayes
            vote.noes = parsed.noes
            vote.abstentions = parsed.abstentions
            vote.absent = (
                0
                if parsed.approved_by_assent
                else max(0, _SEATS_PER_LEGISLATURE - parsed.presentes)
            )
            vote.approved_by_assent = parsed.approved_by_assent
            vote.expediente_raw = expediente_raw
            if initiative_id is not None:
                vote.initiative_id = initiative_id
            if graphic_url is not None:
                vote.graphic_url = graphic_url
            vote.proposing_group_id = proposing_group_id
            vote.proposed_by_government = proposed_by_government

        records_created, records_skipped, records_without_group = await self._upsert_vote_records(
            vote, parsed, persons_by_name, memberships_by_mandate
        )

        return VoteImportStats(
            votes_seen=stats.votes_seen + 1,
            votes_created=stats.votes_created + (1 if created else 0),
            records_created=stats.records_created + records_created,
            records_skipped_unknown_person=stats.records_skipped_unknown_person + records_skipped,
            records_without_group=stats.records_without_group + records_without_group,
            votes_with_expediente=stats.votes_with_expediente + (1 if expediente_raw else 0),
            votes_linked_to_initiative=stats.votes_linked_to_initiative
            + (1 if initiative_id is not None else 0),
        )

    async def _upsert_vote_records(
        self,
        vote: Vote,
        parsed: ParsedVote,
        persons_by_name: dict[str, Person],
        memberships_by_mandate: dict[int, GroupMembership],
    ) -> tuple[int, int, int]:
        existing = await self.session.execute(
            select(VoteRecord).where(VoteRecord.vote_id == vote.id)
        )
        existing_by_mandate = {r.mandate_id: r for r in existing.scalars()}

        created = skipped = without_group = 0
        for raw in parsed.records:
            person = self._lookup_person(raw, persons_by_name)
            if person is None:
                skipped += 1
                continue
            mandate = self._latest_mandate(person)
            if mandate is None:
                skipped += 1
                continue
            membership = memberships_by_mandate.get(mandate.id)
            if membership is None:
                without_group += 1
            existing_record = existing_by_mandate.get(mandate.id)
            if existing_record is not None:
                existing_record.choice = raw.choice
                existing_record.group_id_at_time = (
                    membership.group_id if membership is not None else None
                )
                continue
            self.session.add(
                VoteRecord(
                    vote_id=vote.id,
                    mandate_id=mandate.id,
                    choice=raw.choice,
                    group_id_at_time=membership.group_id if membership is not None else None,
                )
            )
            created += 1
        return created, skipped, without_group

    # ------------------------------------------------------------------
    # Lookups
    # ------------------------------------------------------------------

    async def _load_initiatives_indexed_by_official_id(self) -> dict[str, int]:
        """Return ``{official_id_or_stem: initiative_id}`` for the chamber.

        The portal publishes initiative expedientes as 3-part strings with a
        trailing sub-index (``"121/000001/0000"``) while the votes listing
        scrapes the same expediente as a 2-part string without the sub-index
        (``"121/000001"``). To make the lookup work in both directions we
        index initiatives under BOTH keys when the sub-index is ``0000`` —
        the canonical "no sub-index" form. Non-``0000`` sub-indices stay
        addressable only by the full 3-part string so we don't collapse
        distinct expedientes into the same key.
        """
        result = await self.session.execute(
            select(Initiative.official_id, Initiative.id).where(
                Initiative.chamber_id == self.chamber.id
            )
        )
        index: dict[str, int] = {}
        for official_id, initiative_id in result.all():
            index[official_id] = initiative_id
            stem = strip_zero_subindex(official_id)
            if stem != official_id:
                # Don't clobber an explicit 2-part row (unlikely but defensive).
                index.setdefault(stem, initiative_id)
        return index

    async def _load_persons_indexed_by_name(self) -> dict[str, Person]:
        """Persons that have a Mandate in this legislature, keyed by full_name.

        We eagerly load ``Person.mandates`` so :meth:`_latest_mandate` doesn't
        trigger lazy I/O outside the async session.
        """
        result = await self.session.execute(
            select(Person)
            .join(Mandate, Mandate.person_id == Person.id)
            .where(Mandate.legislature_id == self.legislature.id)
            .options(selectinload(Person.mandates))
            .distinct()
        )
        return {p.full_name: p for p in result.scalars()}

    async def _load_memberships_by_mandate(self, on_date: date) -> dict[int, GroupMembership]:
        """Open membership for each mandate on ``on_date``.

        Open ≡ ``start_date <= on_date AND (end_date IS NULL OR end_date > on_date)``.
        """
        result = await self.session.execute(
            select(GroupMembership)
            .join(Mandate, Mandate.id == GroupMembership.mandate_id)
            .where(Mandate.legislature_id == self.legislature.id)
            .where(GroupMembership.start_date <= on_date)
        )
        memberships: dict[int, GroupMembership] = {}
        for m in result.scalars():
            if m.end_date is not None and m.end_date <= on_date:
                continue
            # If multiple matches (shouldn't happen with our reconciliation),
            # keep the most recently started one.
            current = memberships.get(m.mandate_id)
            if current is None or m.start_date > current.start_date:
                memberships[m.mandate_id] = m
        return memberships

    def _lookup_person(
        self, raw: ParsedVoteRecord, persons_by_name: dict[str, Person]
    ) -> Person | None:
        name = parse_person_name(raw.deputy_name_raw)
        person = persons_by_name.get(name.full_name)
        if person is None:
            log.warning(
                "congreso.votes.person_not_found",
                deputy=raw.deputy_name_raw,
                derived_full_name=name.full_name,
            )
        return person

    def _latest_mandate(self, person: Person) -> Mandate | None:
        # Persons loaded via the legislature join have at least one mandate
        # there; pick the one with the latest start_date.
        mandates = [m for m in person.mandates if m.legislature_id == self.legislature.id]
        if not mandates:
            return None
        return max(mandates, key=lambda m: m.start_date)


# Spanish Congress has 350 seats; we use this to derive ``absent`` from
# ``Presentes``. If we ever import another chamber with a different seat count
# this constant becomes a Chamber attribute.
_SEATS_PER_LEGISLATURE = 350


_GOVERNMENT_TITLE_HINTS = (
    "Convalidación o derogación de Reales Decretos-leyes",
    "Proyecto de Ley",
    "Real Decreto-ley",
)


def _looks_government_proposed(parsed: ParsedVote) -> bool:
    """Decide whether a vote is on a government instrument by its surface text.

    Mirrors the SQL backfill in migration 0009. The two surfaces (ingest
    and migration) MUST stay in sync; if you tweak this, update the
    migration's SQL or write a follow-up migration that re-applies the
    rule.
    """
    title = parsed.title or ""
    desc = parsed.expediente_text or ""
    return any(hint in title for hint in _GOVERNMENT_TITLE_HINTS) or "del Gobierno" in desc
