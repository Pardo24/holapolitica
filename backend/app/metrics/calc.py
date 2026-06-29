"""SQL-driven aggregate metric computations.

Definitions
-----------

**Group cohesion** for a vote — how unified the group voted::

    cohesion(group, vote) = max_choice_count / total_choices_cast

where ``max_choice_count`` is the largest number of group members agreeing
on a single choice (Sí, No, Abstención) and ``total_choices_cast`` is the
group members who cast any vote (excluding ``no_vote_recorded``). Cohesion
is undefined for groups with zero participants and is reported as ``None``.

**Group coincidence matrix** — for every ordered pair (A, B) of groups over
a set of votes, the proportion of votes where the groups' *majority* choice
matched. We always return the full matrix (CLAUDE.md "regla de simetria").

**Deputy attendance** — for a legislature, the fraction of votes in which
each mandate cast a Sí/No/Abstención. ``no_vote_recorded`` counts as
absence.

**Deputy dissidence** — for a legislature, the fraction of votes in which
the mandate's choice differed from their parliamentary group's majority
choice on that vote (counting only votes where both the mandate cast a vote
and the group had a majority).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from typing import cast

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import (
    GroupMembership,
    Initiative,
    InitiativeTopic,
    Mandate,
    ParliamentaryGroup,
    Person,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
)
from app.models import (
    Session as SessionRow,
)

_VOTING_CHOICES = {VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION}


@dataclass(frozen=True, slots=True)
class CohesionResult:
    group_slug: str
    group_name_short: str
    group_color_hex: str | None
    cohesion: float | None
    members_voting: int
    # Per-choice breakdown so the frontend can render a stacked bar without
    # an extra round-trip. ``no_vote`` covers ``no_vote_recorded`` and any
    # absences not represented in the vote_records table.
    ayes: int
    noes: int
    abstentions: int
    no_vote: int


@dataclass(frozen=True, slots=True)
class CoincidenceCell:
    group_a_slug: str
    group_b_slug: str
    votes_compared: int
    coincidence: float | None  # None if no comparable votes (both with majority)


@dataclass(frozen=True, slots=True)
class AttendanceRow:
    person_id: int
    full_name: str
    votes_total: int
    votes_attended: int
    attendance: float | None


@dataclass(frozen=True, slots=True)
class DissidenceRow:
    person_id: int
    full_name: str
    votes_compared: int
    dissents: int
    dissidence: float | None


@dataclass(frozen=True, slots=True)
class GroupSummaryRow:
    """Per-group aggregate for the stats hero: members + cohesion + attendance.

    All three numbers are reported alongside the raw N so the renderer can
    apply the min-N rule without a second query (CLAUDE.md "regla de simetria"
    — every group is included; sorting/highlighting is a frontend concern).

    ``members_active`` always counts every open mandate (transparency: the
    group has N members). ``members_in_metric`` is the subset that
    contributes to the cohesion + attendance averages — i.e. deputies with
    ``Person.role_kind IS NULL``. Cabinet members ('govern') and Mesa
    officers ('mesa') are excluded because their voting pattern doesn't
    reflect ordinary group behaviour (presidents abstain by tradition;
    ministers rarely cast votes). The frontend should disclose the
    exclusion: "calculat sobre M membres dels N actius".
    """

    group_slug: str
    group_name_short: str
    group_color_hex: str | None
    members_active: int
    members_in_metric: int
    avg_cohesion: float | None
    cohesion_votes_counted: int
    avg_attendance: float | None
    attendance_member_count: int
    # Demographic columns added 2026-05-14 to support the group summary
    # cards on /stats. Counts only cover currently-open mandates (same
    # denominator as ``members_active``) so the renderer can show
    # "F / M / Altres" alongside the cohesion + attendance donuts.
    # ``members_age_avg`` is the mean age of members with a known birth
    # year; NULL when no member has the field populated.
    members_f: int
    members_m: int
    members_other: int
    members_age_avg: float | None


@dataclass(frozen=True, slots=True)
class TopicVoteStatRow:
    """Vote breakdown for one (entity, topic) pair.

    Denominator follows the stats methodology doc: Sí + No + Abst (cast
    votes only). ``no_vote`` is exposed for the "didn't show up" angle
    but doesn't enter the percentage.

    ``aye_pct`` etc. are ``None`` when ``cast == 0`` so the renderer can
    distinguish "didn't vote any of this topic" from "voted 0% in favor".
    """

    topic_slug: str
    topic_name_ca: str
    topic_color_hex: str | None
    ayes: int
    noes: int
    abstentions: int
    no_vote: int
    cast: int  # ayes + noes + abstentions

    @property
    def aye_pct(self) -> float | None:
        return self.ayes / self.cast if self.cast else None

    @property
    def no_pct(self) -> float | None:
        return self.noes / self.cast if self.cast else None

    @property
    def abst_pct(self) -> float | None:
        return self.abstentions / self.cast if self.cast else None


# ---------------------------------------------------------------------------
# Cohesion (per vote)
# ---------------------------------------------------------------------------


async def compute_group_cohesion_for_vote(
    session: AsyncSession, vote_id: int
) -> list[CohesionResult]:
    """Cohesion of every group present in the vote, sorted by member count desc."""
    rows = (
        await session.execute(
            select(
                VoteRecord.choice,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
            )
            .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
            .where(VoteRecord.vote_id == vote_id)
        )
    ).all()

    by_group: dict[str, dict[str, object]] = defaultdict(
        lambda: {"name_short": "", "color_hex": None, "counts": Counter()}
    )
    for choice, slug, name_short, color_hex in rows:
        entry = by_group[slug]
        entry["name_short"] = name_short
        entry["color_hex"] = color_hex
        cast(Counter[VoteChoice], entry["counts"])[choice] += 1

    results: list[CohesionResult] = []
    for slug, entry in by_group.items():
        counts = cast(Counter[VoteChoice], entry["counts"])
        ayes = counts[VoteChoice.AYE]
        noes = counts[VoteChoice.NO]
        abst = counts[VoteChoice.ABSTENTION]
        novote = counts[VoteChoice.NO_VOTE_RECORDED] + counts[VoteChoice.ABSENT]
        casting = ayes + noes + abst
        cohesion = (max(ayes, noes, abst) / casting) if casting else None
        results.append(
            CohesionResult(
                group_slug=slug,
                group_name_short=cast(str, entry["name_short"]),
                group_color_hex=cast("str | None", entry["color_hex"]),
                cohesion=cohesion,
                members_voting=casting,
                ayes=ayes,
                noes=noes,
                abstentions=abst,
                no_vote=novote,
            )
        )
    # Sort by total group size, descending — biggest groups first.
    results.sort(key=lambda r: -(r.members_voting + r.no_vote))
    return results


# ---------------------------------------------------------------------------
# Group summary (per legislature) — members + avg cohesion + avg attendance
# ---------------------------------------------------------------------------


async def compute_group_summary(
    session: AsyncSession,
    *,
    legislature_id: int,
) -> list[GroupSummaryRow]:
    """One row per group in the legislature with members, cohesion, attendance.

    Every group registered against the legislature appears in the result —
    even when the group has no votes yet (avg fields fall to ``None``).

    ``members_active`` is the count of every open mandate currently in the
    group (transparency floor). ``members_in_metric`` is the subset whose
    vote records feed the cohesion and attendance averages: deputies with
    ``Person.role_kind IS NOT NULL`` ('govern', 'mesa') are excluded
    because their voting pattern is dictated by their executive / chamber
    role and not by their parliamentary group — including them skews
    cross-group rankings unfairly (e.g. Sánchez as President of Govern
    drags PSOE's attendance down). Members are still listed in
    ``members_active``; only the metric averages drop them. Tenure
    intervals are also respected: a member's vote records only count
    while their ``GroupMembership`` window was open.
    """
    # 1) groups registered in this legislature, with active member counts.
    group_rows = (
        await session.execute(
            select(
                ParliamentaryGroup.id,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
            ).where(ParliamentaryGroup.legislature_id == legislature_id)
        )
    ).all()

    # Member counts in a single query — avoids N+1.
    # ``members_active`` counts every open mandate (full transparency).
    # ``members_in_metric`` is the subset whose votes count toward the
    # cohesion + attendance averages: regular deputies only, no govern /
    # Mesa role-holders. We do both counts in one pass.
    member_count_rows = (
        await session.execute(
            select(
                GroupMembership.group_id,
                Mandate.id,
                Person.role_kind,
                Person.gender,
                Person.birth_year,
            )
            .join(Mandate, Mandate.id == GroupMembership.mandate_id)
            .join(Person, Person.id == Mandate.person_id)
            .where(
                GroupMembership.end_date.is_(None),
                Mandate.end_date.is_(None),
            )
        )
    ).all()
    members_by_group_id: Counter[int] = Counter()
    members_in_metric_by_group_id: Counter[int] = Counter()
    # Demographic aggregation — same denominator as members_active (every
    # open mandate, role-holders included) so the cards stay coherent
    # with the headline number. Age uses a current-year reference; we
    # consciously use a fixed reference (datetime.now()) here even though
    # the function is cached for an hour — the rounding to whole years
    # is insensitive to hour-level drift.
    gender_f_by_group: Counter[int] = Counter()
    gender_m_by_group: Counter[int] = Counter()
    gender_other_by_group: Counter[int] = Counter()
    age_sum_by_group: dict[int, int] = defaultdict(int)
    age_n_by_group: Counter[int] = Counter()
    current_year = date.today().year
    for group_id, _mandate_id, role_kind, gender, birth_year in member_count_rows:
        members_by_group_id[group_id] += 1
        if role_kind is None:
            members_in_metric_by_group_id[group_id] += 1
        if gender == "F":
            gender_f_by_group[group_id] += 1
        elif gender == "M":
            gender_m_by_group[group_id] += 1
        else:
            # 'X', NULL or any unexpected sentinel falls into "altres";
            # the frontend renders the bucket transparently so users see
            # both populated and missing data.
            gender_other_by_group[group_id] += 1
        if isinstance(birth_year, int) and 1900 < birth_year < current_year:
            age_sum_by_group[group_id] += current_year - birth_year
            age_n_by_group[group_id] += 1

    # 2) cohesion: per (vote, group), max_cast / total_cast. Average per group.
    # We exclude vote records from role-holders (govern / Mesa) via a
    # LEFT JOIN + ``Person.role_kind IS NULL`` filter — a Mesa president's
    # ritual abstain shouldn't tank their group's cohesion. The mandate
    # interval clause keeps a member's votes restricted to their tenure.
    coh_stmt = (
        select(
            VoteRecord.vote_id,
            ParliamentaryGroup.slug,
            VoteRecord.choice,
        )
        .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .join(Mandate, Mandate.id == VoteRecord.mandate_id)
        .join(Person, Person.id == Mandate.person_id)
        .where(SessionRow.legislature_id == legislature_id)
        .where(Person.role_kind.is_(None))
        .where(_mandate_interval_clause())
    )
    counters: dict[tuple[int, str], Counter[VoteChoice]] = defaultdict(Counter)
    for vote_id, slug, choice in (await session.execute(coh_stmt)).all():
        counters[(vote_id, slug)][choice] += 1

    cohesion_sum_by_slug: dict[str, float] = defaultdict(float)
    cohesion_n_by_slug: Counter[str] = Counter()
    for (_vote_id, slug), counts in counters.items():
        casting = counts[VoteChoice.AYE] + counts[VoteChoice.NO] + counts[VoteChoice.ABSTENTION]
        if casting == 0:
            continue
        max_choice = max(
            counts[VoteChoice.AYE], counts[VoteChoice.NO], counts[VoteChoice.ABSTENTION]
        )
        cohesion_sum_by_slug[slug] += max_choice / casting
        cohesion_n_by_slug[slug] += 1

    # 3) attendance: per (group, member) restricted to (a) the member's
    # ``GroupMembership`` window and (b) the member's ``Mandate`` window.
    # Excludes role-holders for the same reason as cohesion. We use the
    # ``GroupMembership`` table to attribute votes to whichever group the
    # member belonged to at the time of the vote — handles mid-legislature
    # group switches.
    att_stmt = (
        select(
            ParliamentaryGroup.slug,
            VoteRecord.choice,
            VoteRecord.mandate_id,
        )
        .join(GroupMembership, GroupMembership.mandate_id == VoteRecord.mandate_id)
        .join(ParliamentaryGroup, ParliamentaryGroup.id == GroupMembership.group_id)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .join(Mandate, Mandate.id == VoteRecord.mandate_id)
        .join(Person, Person.id == Mandate.person_id)
        .where(SessionRow.legislature_id == legislature_id)
        .where(Person.role_kind.is_(None))
        # Restrict to votes during the membership's window so a deputy
        # who switched groups mid-term only contributes to their then
        # current group, not retroactively to the new one.
        .where(Vote.voted_at >= GroupMembership.start_date)
        .where(or_(GroupMembership.end_date.is_(None), Vote.voted_at <= GroupMembership.end_date))
        .where(_mandate_interval_clause())
    )
    att_total: Counter[str] = Counter()
    att_attended: Counter[str] = Counter()
    members_seen: dict[str, set[int]] = defaultdict(set)
    for slug, choice, mandate_id in (await session.execute(att_stmt)).all():
        att_total[slug] += 1
        if choice in _VOTING_CHOICES:
            att_attended[slug] += 1
        members_seen[slug].add(mandate_id)

    # 4) compose
    results: list[GroupSummaryRow] = []
    for gid, slug, name_short, color_hex in group_rows:
        coh_n = cohesion_n_by_slug.get(slug, 0)
        avg_cohesion = (cohesion_sum_by_slug.get(slug, 0.0) / coh_n) if coh_n else None
        att_t = att_total.get(slug, 0)
        avg_attendance = (att_attended.get(slug, 0) / att_t) if att_t else None
        n_age = age_n_by_group.get(gid, 0)
        avg_age = (age_sum_by_group.get(gid, 0) / n_age) if n_age else None
        results.append(
            GroupSummaryRow(
                group_slug=slug,
                group_name_short=name_short,
                group_color_hex=color_hex,
                members_active=members_by_group_id.get(gid, 0),
                members_in_metric=members_in_metric_by_group_id.get(gid, 0),
                avg_cohesion=avg_cohesion,
                cohesion_votes_counted=coh_n,
                avg_attendance=avg_attendance,
                attendance_member_count=len(members_seen.get(slug, set())),
                members_f=gender_f_by_group.get(gid, 0),
                members_m=gender_m_by_group.get(gid, 0),
                members_other=gender_other_by_group.get(gid, 0),
                members_age_avg=avg_age,
            )
        )
    # Sort by members descending; symmetric (every group present).
    results.sort(key=lambda r: -r.members_active)
    return results


# ---------------------------------------------------------------------------
# Coincidence (group × group)
# ---------------------------------------------------------------------------


async def compute_group_coincidence_matrix(
    session: AsyncSession,
    *,
    legislature_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[CoincidenceCell]:
    """Full pairwise group coincidence matrix in ``[from_date, to_date]``.

    Returns one cell per ordered pair (including self-pairs). Self-pair
    coincidence is always 1.0 by definition (kept for symmetry of display).
    """
    stmt = (
        select(
            VoteRecord.vote_id,
            ParliamentaryGroup.slug,
            VoteRecord.choice,
        )
        .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .where(SessionRow.legislature_id == legislature_id)
    )
    if from_date is not None:
        stmt = stmt.where(SessionRow.date >= from_date)
    if to_date is not None:
        stmt = stmt.where(SessionRow.date <= to_date)

    # Aggregate in Python: group by (vote_id, group_slug) -> majority choice.
    counters: dict[tuple[int, str], Counter[VoteChoice]] = defaultdict(Counter)
    for vote_id, slug, choice in (await session.execute(stmt)).all():
        counters[(vote_id, slug)][choice] += 1

    majority_by_vote_group: dict[int, dict[str, VoteChoice]] = defaultdict(dict)
    for (vote_id, slug), counts in counters.items():
        choice, count = max(((c, counts[c]) for c in _VOTING_CHOICES), key=lambda kv: kv[1])
        if count == 0:
            continue
        majority_by_vote_group[vote_id][slug] = choice

    all_slugs = sorted({slug for inner in majority_by_vote_group.values() for slug in inner})

    cells: list[CoincidenceCell] = []
    for a in all_slugs:
        for b in all_slugs:
            compared = 0
            agree = 0
            for inner in majority_by_vote_group.values():
                if a in inner and b in inner:
                    compared += 1
                    if inner[a] == inner[b]:
                        agree += 1
            cells.append(
                CoincidenceCell(
                    group_a_slug=a,
                    group_b_slug=b,
                    votes_compared=compared,
                    coincidence=(agree / compared) if compared else None,
                )
            )
    return cells


# ---------------------------------------------------------------------------
# Attendance and dissidence (per deputy)
# ---------------------------------------------------------------------------


async def compute_deputy_attendance(
    session: AsyncSession,
    *,
    legislature_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[AttendanceRow]:
    """Per-mandate attendance for the given legislature and date range."""
    rows = await _fetch_deputy_choices(session, legislature_id, from_date, to_date)

    by_person: dict[int, dict[str, object]] = defaultdict(
        lambda: {"full_name": "", "total": 0, "attended": 0}
    )
    for person_id, full_name, choice, _vote_id in rows:
        entry = by_person[person_id]
        entry["full_name"] = full_name
        entry["total"] = cast(int, entry["total"]) + 1
        if choice in _VOTING_CHOICES:
            entry["attended"] = cast(int, entry["attended"]) + 1

    return [
        AttendanceRow(
            person_id=pid,
            full_name=cast(str, e["full_name"]),
            votes_total=cast(int, e["total"]),
            votes_attended=cast(int, e["attended"]),
            attendance=(cast(int, e["attended"]) / cast(int, e["total"])) if e["total"] else None,
        )
        for pid, e in sorted(by_person.items(), key=lambda kv: cast(str, kv[1]["full_name"]))
    ]


async def compute_deputy_dissidence(
    session: AsyncSession,
    *,
    legislature_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[DissidenceRow]:
    """Per-mandate dissidence (votes where deputy disagreed with own group's majority)."""
    rows = await _fetch_deputy_choices_with_group(session, legislature_id, from_date, to_date)

    # Pass 1: compute group majority per vote.
    counters: dict[tuple[int, str], Counter[VoteChoice]] = defaultdict(Counter)
    for _person_id, _full_name, choice, vote_id, group_slug in rows:
        if group_slug is None or choice not in _VOTING_CHOICES:
            continue
        counters[(vote_id, group_slug)][choice] += 1

    majority: dict[tuple[int, str], VoteChoice] = {}
    for key, counts in counters.items():
        choice, count = max(((c, counts[c]) for c in _VOTING_CHOICES), key=lambda kv: kv[1])
        if count > 0:
            majority[key] = choice

    # Pass 2: per deputy compare to their group's majority.
    by_person: dict[int, dict[str, object]] = defaultdict(
        lambda: {"full_name": "", "compared": 0, "dissents": 0}
    )
    for person_id, full_name, choice, vote_id, group_slug in rows:
        if group_slug is None or choice not in _VOTING_CHOICES:
            continue
        maj = majority.get((vote_id, group_slug))
        if maj is None:
            continue
        entry = by_person[person_id]
        entry["full_name"] = full_name
        entry["compared"] = cast(int, entry["compared"]) + 1
        if choice != maj:
            entry["dissents"] = cast(int, entry["dissents"]) + 1

    return [
        DissidenceRow(
            person_id=pid,
            full_name=cast(str, e["full_name"]),
            votes_compared=cast(int, e["compared"]),
            dissents=cast(int, e["dissents"]),
            dissidence=(
                (cast(int, e["dissents"]) / cast(int, e["compared"])) if e["compared"] else None
            ),
        )
        for pid, e in sorted(by_person.items(), key=lambda kv: cast(str, kv[1]["full_name"]))
    ]


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


async def _fetch_deputy_choices(
    session: AsyncSession,
    legislature_id: int,
    from_date: date | None,
    to_date: date | None,
) -> list[tuple[int, str, VoteChoice, int]]:
    # ``Vote.voted_at`` is restricted to the mandate's [start_date, end_date]
    # window (end_date NULL = still active) so substitute deputies and
    # early-renouncers aren't measured against votes that happened outside
    # their tenure. See ``_mandate_interval_clause``.
    stmt = (
        select(Person.id, Person.full_name, VoteRecord.choice, VoteRecord.vote_id)
        .join(Mandate, Mandate.person_id == Person.id)
        .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .where(SessionRow.legislature_id == legislature_id)
        .where(_mandate_interval_clause())
    )
    if from_date is not None:
        stmt = stmt.where(SessionRow.date >= from_date)
    if to_date is not None:
        stmt = stmt.where(SessionRow.date <= to_date)
    return [tuple(r) for r in (await session.execute(stmt)).all()]


async def _fetch_deputy_choices_with_group(
    session: AsyncSession,
    legislature_id: int,
    from_date: date | None,
    to_date: date | None,
) -> list[tuple[int, str, VoteChoice, int, str | None]]:
    # Same tenure-aware filter as ``_fetch_deputy_choices``.
    stmt = (
        select(
            Person.id,
            Person.full_name,
            VoteRecord.choice,
            VoteRecord.vote_id,
            ParliamentaryGroup.slug,
        )
        .join(Mandate, Mandate.person_id == Person.id)
        .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .outerjoin(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
        .where(SessionRow.legislature_id == legislature_id)
        .where(_mandate_interval_clause())
    )
    if from_date is not None:
        stmt = stmt.where(SessionRow.date >= from_date)
    if to_date is not None:
        stmt = stmt.where(SessionRow.date <= to_date)
    return [tuple(r) for r in (await session.execute(stmt)).all()]


def _mandate_interval_clause() -> ColumnElement[bool]:
    """SQL clause: ``Vote.voted_at`` is inside the joined ``Mandate``'s window.

    A NULL ``end_date`` means the mandate is still active — treat it as
    open-ended on the right. The function is private; callers must have
    already joined ``Mandate`` and ``Vote`` in their statement.
    """
    return and_(
        Vote.voted_at >= Mandate.start_date,
        or_(Mandate.end_date.is_(None), Vote.voted_at <= Mandate.end_date),
    )


# ---------------------------------------------------------------------------
# Topic-based vote stats (per deputy, per group, global)
# ---------------------------------------------------------------------------


async def compute_topic_stats_for_person(
    session: AsyncSession, *, person_id: int
) -> list[TopicVoteStatRow]:
    """Per-topic vote breakdown for one person across all their mandates.

    A vote on an initiative tagged with N topics is counted in each of those
    N topics (CLAUDE.md "regla de simetria" — never pick a "primary" topic).
    Topics with zero votes are omitted; the frontend's min-N rule decides
    whether to render them.
    """
    stmt = (
        select(
            Topic.slug,
            Topic.name_ca,
            Topic.color_hex,
            VoteRecord.choice,
        )
        .select_from(Mandate)
        .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(Initiative, Initiative.id == Vote.initiative_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(Mandate.person_id == person_id)
    )
    rows = (await session.execute(stmt)).all()
    return _aggregate_topic_rows([tuple(r) for r in rows])


async def compute_topic_stats_for_group(
    session: AsyncSession, *, group_id: int
) -> list[TopicVoteStatRow]:
    """Per-topic vote breakdown for one parliamentary group.

    Counts every vote_record where ``group_id_at_time`` was this group at
    the moment of the vote.
    """
    stmt = (
        select(
            Topic.slug,
            Topic.name_ca,
            Topic.color_hex,
            VoteRecord.choice,
        )
        .select_from(VoteRecord)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(Initiative, Initiative.id == Vote.initiative_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(VoteRecord.group_id_at_time == group_id)
    )
    rows = (await session.execute(stmt)).all()
    return _aggregate_topic_rows([tuple(r) for r in rows])


def _aggregate_topic_rows(
    rows: list[tuple[str, str, str | None, VoteChoice]],
) -> list[TopicVoteStatRow]:
    """Bucket per-record rows into per-topic counts."""
    buckets: dict[str, dict[str, object]] = defaultdict(
        lambda: {"name_ca": "", "color_hex": None, "counts": Counter()}
    )
    for slug, name_ca, color_hex, choice in rows:
        b = buckets[slug]
        b["name_ca"] = name_ca
        b["color_hex"] = color_hex
        cast(Counter[VoteChoice], b["counts"])[choice] += 1

    out: list[TopicVoteStatRow] = []
    for slug, b in buckets.items():
        counts = cast(Counter[VoteChoice], b["counts"])
        ayes = counts[VoteChoice.AYE]
        noes = counts[VoteChoice.NO]
        abst = counts[VoteChoice.ABSTENTION]
        novote = counts[VoteChoice.NO_VOTE_RECORDED] + counts[VoteChoice.ABSENT]
        out.append(
            TopicVoteStatRow(
                topic_slug=slug,
                topic_name_ca=cast(str, b["name_ca"]),
                topic_color_hex=cast("str | None", b["color_hex"]),
                ayes=ayes,
                noes=noes,
                abstentions=abst,
                no_vote=novote,
                cast=ayes + noes + abst,
            )
        )
    out.sort(key=lambda r: -(r.cast + r.no_vote))
    return out


@dataclass(frozen=True, slots=True)
class ProposesByTopicRow:
    """How many distinct initiatives a group has PROPOSED, per topic."""

    topic_slug: str
    topic_name_ca: str
    topic_color_hex: str | None
    count: int


async def compute_proposes_by_topic_for_group(
    session: AsyncSession, *, group_id: int
) -> list[ProposesByTopicRow]:
    """Per-topic count of distinct initiatives this group has PROPOSED.

    Attribution is via ``Vote.proposing_group_id`` (the resolved proposer of
    the vote), joined through the linked initiative to its topics. Counts
    DISTINCT initiatives so a bill that triggered many amendment votes is
    counted once. Ordered by count desc.

    Symmetric by construction (CLAUDE.md "regla de simetria"): the identical
    computation runs for every group and the full per-topic list is returned;
    the API never ranks one group against another.
    """
    proposed = func.count(func.distinct(Vote.initiative_id))
    stmt = (
        select(Topic.slug, Topic.name_ca, Topic.color_hex, proposed)
        .select_from(Vote)
        .join(Initiative, Initiative.id == Vote.initiative_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, Topic.id == InitiativeTopic.topic_id)
        .where(Vote.proposing_group_id == group_id)
        .group_by(Topic.slug, Topic.name_ca, Topic.color_hex)
        .order_by(proposed.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        ProposesByTopicRow(
            topic_slug=slug,
            topic_name_ca=name_ca,
            topic_color_hex=color_hex,
            count=int(count),
        )
        for slug, name_ca, color_hex, count in rows
    ]


@dataclass(frozen=True, slots=True)
class GroupVoteStatRow:
    """One parliamentary group's Sí/No/Abst breakdown on a single topic."""

    group_slug: str
    group_name_short: str
    group_color_hex: str | None
    ayes: int
    noes: int
    abstentions: int
    no_vote: int
    cast: int


async def compute_group_stats_for_topic(
    session: AsyncSession, *, topic_id: int, legislature_id: int | None = None
) -> list[GroupVoteStatRow]:
    """Per-group vote breakdown on one topic.

    The inverse of :func:`compute_topic_stats_for_group`: for every
    vote_record cast on an initiative tagged with ``topic_id``, bucket by
    the group in force at the moment of the vote. Lets a newsroom ask "on
    this topic, who votes in favour and who votes against" with one call.

    ``legislature_id`` scopes the aggregation to a single legislature. The
    "who's for / against" widget passes the current one so the result shows
    today's groups and today's stance — a party's share averaged across 15
    years of government/opposition flips would be misleading. Omit it to
    aggregate all-time.

    Symmetric by construction (CLAUDE.md "regla de simetria"): every group
    is computed identically and the full list is returned; the API never
    ranks one group against another — the frontend sorts for display.
    """
    stmt = (
        select(
            ParliamentaryGroup.slug,
            ParliamentaryGroup.name_short,
            ParliamentaryGroup.color_hex,
            VoteRecord.choice,
        )
        .select_from(VoteRecord)
        .join(Vote, Vote.id == VoteRecord.vote_id)
        .join(Initiative, Initiative.id == Vote.initiative_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(
            ParliamentaryGroup,
            ParliamentaryGroup.id == VoteRecord.group_id_at_time,
        )
        .where(InitiativeTopic.topic_id == topic_id)
    )
    if legislature_id is not None:
        stmt = stmt.where(Initiative.legislature_id == legislature_id)
    rows = (await session.execute(stmt)).all()

    buckets: dict[str, dict[str, object]] = defaultdict(
        lambda: {"name_short": "", "color_hex": None, "counts": Counter()}
    )
    for slug, name_short, color_hex, choice in rows:
        b = buckets[slug]
        b["name_short"] = name_short
        b["color_hex"] = color_hex
        cast(Counter[VoteChoice], b["counts"])[choice] += 1

    out: list[GroupVoteStatRow] = []
    for slug, b in buckets.items():
        counts = cast(Counter[VoteChoice], b["counts"])
        ayes = counts[VoteChoice.AYE]
        noes = counts[VoteChoice.NO]
        abst = counts[VoteChoice.ABSTENTION]
        novote = counts[VoteChoice.NO_VOTE_RECORDED] + counts[VoteChoice.ABSENT]
        out.append(
            GroupVoteStatRow(
                group_slug=slug,
                group_name_short=cast(str, b["name_short"]),
                group_color_hex=cast("str | None", b["color_hex"]),
                ayes=ayes,
                noes=noes,
                abstentions=abst,
                no_vote=novote,
                cast=ayes + noes + abst,
            )
        )
    out.sort(key=lambda r: -(r.cast + r.no_vote))
    return out


@dataclass(frozen=True, slots=True)
class StanceExampleRow:
    """One example vote where a group's majority sided with a given stance."""

    vote_id: int
    title: str
    voted_at: date
    result: str


async def example_votes_by_group_stance(
    session: AsyncSession,
    *,
    group_id: int,
    topic_slug: str,
    stance: str,
    limit: int = 3,
) -> list[StanceExampleRow]:
    """A few recent votes on ``topic_slug`` where the group's majority sided
    with ``stance`` (``'aye'`` or ``'no'``).

    The group's position on a vote is the plurality of its members' recorded
    choices; we keep votes where ayes outnumber noes (``'aye'``) or vice
    versa (``'no'``). Most-recent first. Powers the example links in the
    group's thematic-profile widgets — factual, and computed identically for
    every group.
    """
    aye = func.sum(case((VoteRecord.choice == VoteChoice.AYE, 1), else_=0))
    no = func.sum(case((VoteRecord.choice == VoteChoice.NO, 1), else_=0))
    stmt = (
        select(Vote.id, Vote.title, Vote.description, Vote.voted_at, Vote.result)
        .select_from(Vote)
        .join(Initiative, Initiative.id == Vote.initiative_id)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .join(Topic, and_(Topic.id == InitiativeTopic.topic_id, Topic.slug == topic_slug))
        .join(
            VoteRecord,
            and_(VoteRecord.vote_id == Vote.id, VoteRecord.group_id_at_time == group_id),
        )
        .group_by(Vote.id, Vote.title, Vote.description, Vote.voted_at, Vote.result)
        .having(aye > no if stance == "aye" else no > aye)
        .order_by(Vote.voted_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        StanceExampleRow(
            vote_id=vote_id,
            title=(description or title or "").strip(),
            voted_at=voted_at,
            result=str(result),
        )
        for vote_id, title, description, voted_at, result in rows
    ]


@dataclass(frozen=True, slots=True)
class PersonKPIs:
    """At-a-glance numbers for a deputy's voting record.

    All three are deliberately equal-weight (CLAUDE.md "regla de simetria"):
    we never surface a single ranked metric that could read as a verdict.

    Denominators are *tenure-aware*: a deputy who joined mid-legislature (or
    renounced before its end) is only measured against the votes that
    happened while their mandate was open. The frontend uses
    ``mandate_total_votes`` / ``legislature_total_votes`` to render a
    "X de Y votacions del seu mandat (legislatura: Z)" caveat so the user
    understands the % is over the relevant slice, not the whole term.
    """

    person_id: int
    votes_total: int  # rows in vote_records, attended or not (legacy field)
    votes_cast: int  # of those, where choice ∈ {Sí, No, Abst}
    attendance_pct: float | None
    dissents: int  # cast votes where choice ≠ own group's majority
    dissidence_pct: float | None
    # Tenure-aware denominators. ``mandate_total_votes`` is votes whose
    # ``voted_at`` falls inside the union of this person's mandate
    # intervals (across every legislature they sat in).
    # ``legislature_total_votes`` is every vote in those same legislatures,
    # regardless of whether the deputy was sitting at the time — exposes
    # the gap when the deputy is a substitute or renounced early.
    mandate_total_votes: int
    legislature_total_votes: int


async def compute_person_kpis(session: AsyncSession, *, person_id: int) -> PersonKPIs:
    """Aggregate vote_records of all this person's mandates, tenure-aware.

    Denominator for both attendance and dissidence is restricted to votes
    whose ``voted_at`` falls inside the union of the person's mandate
    intervals (``Mandate.start_date`` .. ``Mandate.end_date``). A NULL
    ``end_date`` is treated as "still active" — open-ended interval. This
    avoids penalising substitute deputies (who entered mid-legislature) or
    representatives who renounced before the end of the term: votes that
    happened outside their tenure don't count against them.
    """
    # 1) Fetch every mandate this person has held. We need the (legislature,
    # start, end) tuples to (a) build the eligible-votes filter and (b)
    # compute the legislature-wide denominator the frontend uses as context.
    mandate_rows = (
        await session.execute(
            select(Mandate.legislature_id, Mandate.start_date, Mandate.end_date).where(
                Mandate.person_id == person_id
            )
        )
    ).all()

    if not mandate_rows:
        # No mandates → no votes possible. Return a fully-zeroed shape so
        # the frontend can render an empty state instead of crashing.
        return PersonKPIs(
            person_id=person_id,
            votes_total=0,
            votes_cast=0,
            attendance_pct=None,
            dissents=0,
            dissidence_pct=None,
            mandate_total_votes=0,
            legislature_total_votes=0,
        )

    legislature_ids = {leg_id for leg_id, _s, _e in mandate_rows}

    # 2) Count every vote in the relevant legislature(s) — context number.
    legislature_total_votes_row = await session.execute(
        select(func.count(Vote.id))
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .where(SessionRow.legislature_id.in_(legislature_ids))
    )
    legislature_total_votes = int(legislature_total_votes_row.scalar_one())

    # 3) Count the eligible (tenure-aware) denominator: votes whose
    # ``voted_at`` falls inside ANY of this person's mandate intervals.
    # We build one OR clause per mandate (cheap — typical N ≤ 2).
    mandate_clauses = []
    for _leg_id, start, end in mandate_rows:
        # ``voted_at`` is a timestamp, ``start_date`` a date. SQLAlchemy
        # coerces both backends (Postgres + SQLite) when comparing them.
        if end is None:
            # Still active mandate — open-ended on the right.
            mandate_clauses.append(Vote.voted_at >= start)
        else:
            # The mandate ran [start, end] inclusive. We include the full
            # last day by comparing against the date only.
            mandate_clauses.append(and_(Vote.voted_at >= start, Vote.voted_at <= end))

    mandate_total_votes_row = await session.execute(
        select(func.count(Vote.id))
        .join(SessionRow, SessionRow.id == Vote.session_id)
        .where(SessionRow.legislature_id.in_(legislature_ids))
        .where(or_(*mandate_clauses))
    )
    mandate_total_votes = int(mandate_total_votes_row.scalar_one())

    # 4) Pull this person's actual vote records (the numerator side). We
    # also keep ``vote_id`` to compute dissidence, which needs the same
    # filter applied via the join on Vote.voted_at.
    rows = (
        await session.execute(
            select(VoteRecord.choice, VoteRecord.group_id_at_time, VoteRecord.vote_id)
            .select_from(Mandate)
            .join(VoteRecord, VoteRecord.mandate_id == Mandate.id)
            .join(Vote, Vote.id == VoteRecord.vote_id)
            .join(SessionRow, SessionRow.id == Vote.session_id)
            .where(Mandate.person_id == person_id)
            .where(SessionRow.legislature_id.in_(legislature_ids))
            .where(or_(*mandate_clauses))
        )
    ).all()

    # ``votes_total`` preserves the legacy semantics (# of vote_record rows
    # actually written for this person — useful as a sanity check next to
    # ``mandate_total_votes``).
    total = len(rows)
    cast_count = sum(1 for r in rows if r[0] in _VOTING_CHOICES)
    # Attendance uses the tenure-aware denominator so substitute deputies
    # don't artificially tank against the legislature-wide count.
    attendance = (cast_count / mandate_total_votes) if mandate_total_votes else None

    # Dissidence: only over CAST votes where the deputy had a group AND the
    # group itself reached a majority among its members on that vote.
    cast_with_group = [
        (choice, gid, vid)
        for choice, gid, vid in rows
        if choice in _VOTING_CHOICES and gid is not None
    ]
    relevant_keys = {(vid, gid) for _c, gid, vid in cast_with_group}
    if not relevant_keys:
        return PersonKPIs(
            person_id=person_id,
            votes_total=total,
            votes_cast=cast_count,
            attendance_pct=attendance,
            dissents=0,
            dissidence_pct=None,
            mandate_total_votes=mandate_total_votes,
            legislature_total_votes=legislature_total_votes,
        )

    # Pull the group-majority per (vote, group) for the relevant subset.
    counters: dict[tuple[int, int], Counter[VoteChoice]] = defaultdict(Counter)
    other_rows = (
        await session.execute(
            select(VoteRecord.choice, VoteRecord.group_id_at_time, VoteRecord.vote_id)
            .where(VoteRecord.vote_id.in_({k[0] for k in relevant_keys}))
            .where(VoteRecord.group_id_at_time.in_({k[1] for k in relevant_keys}))
        )
    ).all()
    for choice, gid, vid in other_rows:
        if choice in _VOTING_CHOICES and gid is not None:
            counters[(vid, gid)][choice] += 1

    majority: dict[tuple[int, int], VoteChoice] = {}
    for key, counts in counters.items():
        choice, count = max(((c, counts[c]) for c in _VOTING_CHOICES), key=lambda kv: kv[1])
        if count > 0:
            majority[key] = choice

    compared = 0
    dissents = 0
    for choice, gid, vid in cast_with_group:
        maj = majority.get((vid, gid))
        if maj is None:
            continue
        compared += 1
        if choice != maj:
            dissents += 1

    return PersonKPIs(
        person_id=person_id,
        votes_total=total,
        votes_cast=cast_count,
        attendance_pct=attendance,
        dissents=dissents,
        dissidence_pct=(dissents / compared) if compared else None,
        mandate_total_votes=mandate_total_votes,
        legislature_total_votes=legislature_total_votes,
    )


@dataclass(frozen=True, slots=True)
class TopicGlobalRow:
    topic_slug: str
    topic_name_ca: str
    topic_color_hex: str | None
    initiatives_total: int
    initiatives_approved: int
    initiatives_rejected: int
    initiatives_in_debate: int
    initiatives_other: int


async def compute_topic_global_stats(session: AsyncSession) -> list[TopicGlobalRow]:
    """For ``/stats``: per-topic counts of initiatives broken down by status."""
    stmt = (
        select(
            Topic.slug,
            Topic.name_ca,
            Topic.color_hex,
            Initiative.status,
        )
        .select_from(Topic)
        .join(InitiativeTopic, InitiativeTopic.topic_id == Topic.id)
        .join(Initiative, Initiative.id == InitiativeTopic.initiative_id)
    )
    rows = (await session.execute(stmt)).all()

    buckets: dict[str, dict[str, object]] = defaultdict(
        lambda: {"name_ca": "", "color_hex": None, "counts": Counter()}
    )
    for slug, name_ca, color_hex, status in rows:
        b = buckets[slug]
        b["name_ca"] = name_ca
        b["color_hex"] = color_hex
        cast(Counter[str], b["counts"])[status] += 1

    out: list[TopicGlobalRow] = []
    for slug, b in buckets.items():
        counts = cast(Counter[str], b["counts"])
        approved = counts.get("approved", 0)
        rejected = counts.get("rejected", 0)
        in_debate = counts.get("in_debate", 0) + counts.get("submitted", 0)
        total = sum(counts.values())
        other = total - approved - rejected - in_debate
        out.append(
            TopicGlobalRow(
                topic_slug=slug,
                topic_name_ca=cast(str, b["name_ca"]),
                topic_color_hex=cast("str | None", b["color_hex"]),
                initiatives_total=total,
                initiatives_approved=approved,
                initiatives_rejected=rejected,
                initiatives_in_debate=in_debate,
                initiatives_other=other,
            )
        )
    out.sort(key=lambda r: -r.initiatives_total)
    return out
