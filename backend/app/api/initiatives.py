"""API endpoints for individual initiatives.

The bulk ``/dump/initiatives`` endpoint already exposes the full
dataset for journalists and researchers. This router adds the
single-row reader the public frontend needs to render the rich
"Exposición de motivos" prose on the vote-detail page when a vote
links to an initiative.

Aggregate listings (by topic, by group, by status) live elsewhere —
in :mod:`app.api.topics` and :mod:`app.api.stats` — to keep each
router's responsibility narrow.
"""

import json
import re
from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import ColumnElement, String, and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import (
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    ParliamentaryGroup,
    Topic,
    Vote,
    VoteChoice,
    VoteRecord,
)
from app.schemas import (
    InitiativeDetail,
    InitiativeRead,
    InitiativeTopicSlug,
    InitiativeVoteSummary,
)
from app.services.affected import normalise_audience_tag
from app.services.cache import cached
from app.services.law_profiles import PROFILES
from app.services.law_text import CHANGE_TAGS

router = APIRouter(prefix="/initiatives", tags=["initiatives"])

# Initiative types that CREATE LAW (binding). Mirrors the frontend's
# ``LAW_TYPE_BINDING`` in frontend/lib/lawTypes.ts — kept in sync by hand.
# These are the initiatives that actually change the law; the rest
# (PNL / Moció / Interpel·lació) are positions, surfaced as a secondary lens.
_LAW_TYPES: tuple[InitiativeType, ...] = (
    InitiativeType.PROYECTO_LEY,
    InitiativeType.PROPOSICION_LEY,
    InitiativeType.REAL_DECRETO_LEY,
)


def _split_csv(value: str | None) -> list[str]:
    """Parse a possibly-comma-separated query value into a clean slug list."""
    if value is None:
        return []
    return [token.strip() for token in value.split(",") if token.strip()]


def _vote_stage(title: str | None) -> str:
    """Where in its procedure a vote sits, from the Congreso's subject line.

    Mirrors ``voteStage`` in frontend/lib/sessionSummary.ts. Two stages
    change what the vote's result means for the INITIATIVE:

    - ``taking`` (toma en consideración): approving it only lets the bill
      start its passage. It is not a law; it is in progress.
    - ``totality`` (debate de totalidad): the vote is on amendments to the
      whole text. Rejecting them means the bill goes on; approving them
      sends it back, which ends it.
    """
    t = (title or "").strip().lower()
    if t.startswith("toma en consideración"):
        return "taking"
    if t.startswith("debate de totalidad") or t.startswith("debates de totalidad"):
        return "totality"
    if t.startswith("convalidación o derogación"):
        return "convalidation"
    return "other"


def _initiative_verdict(stage: str, result: str | None) -> str | None:
    """What a latest vote means for its initiative.

    ``approved`` / ``rejected`` / ``tie`` when the initiative's fate was
    decided, ``None`` while it is still in progress. Reading the raw vote
    result instead put "Rejected" on bills whose amendments to the whole
    text were rejected (they go on), "Approved" on bills those amendments
    sent back (they ended), and "Approved" on bills that had only been
    admitted for consideration.
    """
    if stage == "totality":
        if result == "rejected":
            return None
        if result == "approved":
            return "rejected"
    if stage == "taking" and result == "approved":
        return None
    return result


@router.get("", response_model=dict)
async def list_initiatives(
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    chamber_id: int | None = Query(None, description="Filter by chamber"),
    creates_law: bool | None = Query(
        None,
        description=(
            "True → only law-creating types (Projecte/Proposició de Llei, "
            "Reial Decret Llei). False → only non-binding positions (PNL, "
            "Moció, Interpel·lació). Omit for all. This is the 'laws' lens."
        ),
    ),
    initiative_type: InitiativeType | None = Query(
        None, description="Filter by a specific initiative type."
    ),
    status_filter: InitiativeStatus | None = Query(
        None, alias="status", description="Filter by lifecycle status."
    ),
    result: str | None = Query(
        None,
        description=(
            "Filter by the OUTCOME of the latest linked vote — what the row "
            "actually shows: 'approved', 'rejected', or 'pending' (no decisive "
            "vote yet), or a comma-separated list of them evaluated as OR. "
            "Use this, not 'status', for the laws view: the portal's imported "
            "lifecycle status is unreliable (an approved law often still reads "
            "as 'in_debate')."
        ),
    ),
    topic_slug: str | None = Query(
        None, description="Topic slug, or a comma-separated list evaluated as OR."
    ),
    proposing_group_slug: str | None = Query(
        None,
        description=(
            "Filter by the parliamentary group that proposed the initiative "
            "(resolved via its linked votes). Single slug or comma-separated "
            "list; the synthetic slug 'govern' matches Government-proposed."
        ),
    ),
    audience: str | None = Query(
        None,
        description=(
            "Filter by an affected audience tag ('inquilinos', 'autònoms'…) "
            "as extracted into ``affected_audiences``. Single tag or a "
            "comma-separated list evaluated as OR. Matching is exact on the "
            "tag and language-agnostic: the Catalan and Spanish lists are "
            "both searched, so a reader filters in their own language."
        ),
    ),
    q: str | None = Query(
        None,
        description=(
            "Full-text search across the initiative's title, summary, "
            "preamble/object text and plain-language summaries (Postgres "
            "'spanish' config, ranked by relevance; supports multi-word and "
            '"quoted phrases"). Falls back to a title substring match off '
            "Postgres."
        ),
    ),
    change: str | None = Query(
        None,
        description=(
            "What the text changes, from the analysis of the bill's own text: "
            "tax_up, tax_down, rights_expand, rights_restrict, env_strengthen, "
            "env_relax, public_more, private_more. Comma-separated, OR-ed."
        ),
    ),
    profile: str | None = Query(
        None,
        description=(
            "An everyday situation the law applies to directly ('jove', "
            "'llogater', 'autonom'...; see GET /initiatives/profiles). Only "
            "laws whose text has a measure for that situation."
        ),
    ),
    ids: str | None = Query(
        None,
        description=(
            "Comma-separated initiative ids. Returns those rows in the list "
            "shape (latest vote with each group's stance, topics), which is "
            "what the embeddable law card renders."
        ),
    ),
    sort: str = Query(
        "recent",
        description=(
            "'recent' (default): most recently tabled first. 'voted': most "
            "recently VOTED first. 'close': narrowest margin between ayes and "
            "noes on the latest vote first. 'voted' and 'close' keep only "
            "initiatives that have been voted; 'close' also drops votes "
            "carried by assent, which have no tally to compare."
        ),
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    """List initiatives with combinable filters — the 'laws' lens.

    Powers the /lleis view. Callers pass ``creates_law=true`` to surface
    only the initiatives that actually become law and demote the non-binding
    positions (PNL / Moció) to a secondary lens. Each row carries
    ``latest_vote_result`` so the view can show a credible outcome even for
    series (e.g. Reial Decret Llei) whose imported ``status`` is unreliable.

    Order: most recent first by ``submitted_at`` (NULLs last), then id,
    unless ``sort`` asks for the latest vote's date or margin.
    """
    base_stmt = select(Initiative)
    count_stmt = select(func.count(func.distinct(Initiative.id))).select_from(Initiative)

    conditions: list[ColumnElement[bool]] = []
    # "What it changes": the tags are a JSON list of slugs; match the quoted
    # slug in the serialised column, as the audience filter does.
    change_tags = (
        [tok for tok in _split_csv(change) if tok in CHANGE_TAGS] if isinstance(change, str) else []
    )
    if change_tags:
        serialised_tags = func.cast(Initiative.change_tags, String)
        conditions.append(
            or_(*(serialised_tags.contains(f'"{tag}"', autoescape=True) for tag in change_tags))
        )
    # "What changes for you": the effects are a JSON object keyed by
    # situation; match the quoted key in the serialised column.
    if isinstance(profile, str) and profile in PROFILES:
        serialised_effects = func.cast(Initiative.profile_effects, String)
        conditions.append(serialised_effects.contains(f'"{profile}":', autoescape=True))
    wanted_ids = (
        [int(tok) for tok in _split_csv(ids) if tok.isdigit()] if isinstance(ids, str) else []
    )
    if wanted_ids:
        conditions.append(Initiative.id.in_(wanted_ids))
    if legislature_id is not None:
        conditions.append(Initiative.legislature_id == legislature_id)
    if chamber_id is not None:
        conditions.append(Initiative.chamber_id == chamber_id)
    if creates_law is True:
        conditions.append(Initiative.type.in_(_LAW_TYPES))
    elif creates_law is False:
        conditions.append(Initiative.type.not_in(_LAW_TYPES))
    if initiative_type is not None:
        conditions.append(Initiative.type == initiative_type)
    if status_filter is not None:
        conditions.append(Initiative.status == status_filter)
    # Outcome filter — by the LATEST linked vote's result, which is what the
    # row displays. Filtering on Initiative.status here would be wrong: an
    # approved law often still carries status='in_debate' from the portal, so
    # the "approved" chip would return nothing while "in debate" returns rows
    # that visibly show "Approved". We rank each initiative's votes by date and
    # match the most recent one (a bill voted in parts is judged by its final
    # vote); "pending" means no decisive vote has happened yet.
    # Several outcomes are OR-ed, like the topic and group filters: "approved
    # or rejected" is a question ("what has the chamber actually settled?")
    # and one chip at a time could not ask it.
    results = [r for r in _split_csv(result) if r in ("approved", "rejected", "pending")]
    if results:
        title_lc = func.lower(func.coalesce(Vote.title, ""))
        is_totality = or_(
            title_lc.like("debate de totalidad%"), title_lc.like("debates de totalidad%")
        )
        is_taking = title_lc.like("toma en consideraci%")
        # The SQL twin of _initiative_verdict: NULL = still in progress.
        verdict = case(
            (and_(is_totality, Vote.result == "rejected"), None),
            (and_(is_totality, Vote.result == "approved"), "rejected"),
            (and_(is_taking, Vote.result == "approved"), None),
            else_=func.cast(Vote.result, String),
        )
        latest_sq = (
            select(
                Vote.initiative_id.label("iid"),
                verdict.label("res"),
                func.row_number()
                .over(
                    partition_by=Vote.initiative_id,
                    order_by=Vote.voted_at.desc(),
                )
                .label("rn"),
            )
            .where(Vote.initiative_id.is_not(None))
            .subquery()
        )
        decided = [r for r in results if r != "pending"]
        # Named apart from the audience block's `clauses` below: same name,
        # different element type, and mypy fixes it on the first assignment.
        outcome_clauses = []
        if "pending" in results:
            # In progress: never voted, or its latest vote kept it alive
            # (admitted for consideration, amendments to the whole rejected).
            outcome_clauses.append(Initiative.id.not_in(select(latest_sq.c.iid)))
            outcome_clauses.append(
                Initiative.id.in_(
                    select(latest_sq.c.iid).where(latest_sq.c.rn == 1, latest_sq.c.res.is_(None))
                )
            )
        if decided:
            outcome_clauses.append(
                Initiative.id.in_(
                    select(latest_sq.c.iid).where(latest_sq.c.rn == 1, latest_sq.c.res.in_(decided))
                )
            )
        conditions.append(or_(*outcome_clauses) if len(outcome_clauses) > 1 else outcome_clauses[0])
    # Audience filter — "show me the laws that touch me". The tags live in a
    # JSON column ({"ca": [...], "es": [...]}), and we match the quoted tag
    # against the serialised column: exact on the whole tag (the quotes stop
    # "joves" matching "joves agricultors"), language-agnostic, and portable
    # to SQLite, which the tests run on. Several tags are OR-ed, like topics.
    audience_tags = [normalise_audience_tag(tag) for tag in _split_csv(audience)]
    if audience_tags:
        serialised = func.cast(Initiative.affected_audiences, String)
        clauses = []
        for tag in audience_tags:
            # The JSON column stores non-ASCII escaped ("ciudadanía"), so
            # matching the literal accented tag silently found nothing — and
            # "ciudadanía" alone is 141 laws. json.dumps reproduces exactly
            # the stored form, quotes included; the raw form is kept as well
            # for any row written without escaping.
            clauses.append(serialised.contains(json.dumps(tag), autoescape=True))
            clauses.append(serialised.contains(f'"{tag}"', autoescape=True))
        conditions.append(or_(*clauses))
    # Full-text search. On Postgres we run the 'spanish' FTS config over the
    # title + summary + preamble (object_text) + plain-language summaries and
    # rank by relevance — so "lleis sobre X" surfaces a bill even when X only
    # appears in the body, with stemming and multi-word / "quoted phrase"
    # support. SQLite (tests) has no tsvector, so it falls back to a title
    # substring match. At ~1.5k initiatives the per-row to_tsvector is
    # instantaneous; a GIN index can be added later if the table grows.
    dialect_name = getattr(getattr(session.bind, "dialect", None), "name", "postgresql")
    fts_rank = None
    if q:
        if dialect_name == "postgresql":
            search_doc = func.concat_ws(
                " ",
                Initiative.title_original,
                Initiative.summary,
                Initiative.object_text,
                Initiative.plain_summary_es,
                Initiative.plain_summary_ca,
            )
            tsv = func.to_tsvector("spanish", search_doc)
            tsq = func.websearch_to_tsquery("spanish", q)
            conditions.append(tsv.op("@@")(tsq))
            fts_rank = func.ts_rank(tsv, tsq)
        else:
            conditions.append(Initiative.title_original.ilike(f"%{q}%"))

    topic_slugs = _split_csv(topic_slug)
    if topic_slugs:
        base_stmt = base_stmt.join(
            InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
        ).join(Topic, Topic.id == InitiativeTopic.topic_id)
        count_stmt = count_stmt.join(
            InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id
        ).join(Topic, Topic.id == InitiativeTopic.topic_id)
        conditions.append(Topic.slug.in_(topic_slugs))

    # Proposing-group filter. Initiatives carry no resolved proposer FK
    # (only free-text submitted_by), so we resolve it through their linked
    # votes' proposing_group_id — matching how /votes attributes a proposer.
    # Expressed as an IN-subquery (not a JOIN) so it can't duplicate rows
    # and break pagination.
    group_slugs = _split_csv(proposing_group_slug)
    if group_slugs:
        wants_government = "govern" in group_slugs
        real_group_slugs = [s for s in group_slugs if s != "govern"]
        clauses = []
        if wants_government:
            clauses.append(Vote.proposed_by_government.is_(True))
        if real_group_slugs:
            gid_subq = select(ParliamentaryGroup.id).where(
                ParliamentaryGroup.slug.in_(real_group_slugs)
            )
            clauses.append(Vote.proposing_group_id.in_(gid_subq))
        if clauses:
            vote_clause = clauses[0] if len(clauses) == 1 else or_(*clauses)
            vote_subq = select(Vote.initiative_id).where(
                and_(Vote.initiative_id.is_not(None), vote_clause)
            )
            conditions.append(Initiative.id.in_(vote_subq))

    # Orderings by the latest vote. Joined against a one-row-per-initiative
    # subquery (rn == 1), so the join can't duplicate rows, and it doubles
    # as the "has been voted" filter these orderings imply.
    sort_mode = sort if sort in ("voted", "close") else "recent"
    vote_order: list[Any] = []
    if sort_mode != "recent":
        last_vote = (
            select(
                Vote.initiative_id.label("iid"),
                Vote.voted_at.label("voted_at"),
                Vote.ayes.label("ayes"),
                Vote.noes.label("noes"),
                Vote.approved_by_assent.label("by_assent"),
                func.row_number()
                .over(
                    partition_by=Vote.initiative_id,
                    order_by=(Vote.voted_at.desc(), Vote.id.desc()),
                )
                .label("rn"),
            )
            .where(Vote.initiative_id.is_not(None))
            .subquery()
        )
        on_last = and_(last_vote.c.iid == Initiative.id, last_vote.c.rn == 1)
        base_stmt = base_stmt.join(last_vote, on_last)
        count_stmt = count_stmt.join(last_vote, on_last)
        if sort_mode == "close":
            # A vote carried by assent has no tally; "close" would put it
            # first with a margin of 0, which is the opposite of true.
            conditions.append(last_vote.c.by_assent.is_not(True))
            conditions.append((last_vote.c.ayes + last_vote.c.noes) > 0)
            vote_order = [
                func.abs(last_vote.c.ayes - last_vote.c.noes).asc(),
                last_vote.c.voted_at.desc(),
            ]
        else:
            vote_order = [last_vote.c.voted_at.desc()]

    if conditions:
        base_stmt = base_stmt.where(and_(*conditions))
        count_stmt = count_stmt.where(and_(*conditions))

    total = (await session.execute(count_stmt)).scalar_one()
    # When searching, order by relevance first; otherwise most-recent first.
    recency = (Initiative.submitted_at.desc().nullslast(), Initiative.id.desc())
    # An explicit sort is the reader's question and wins over relevance;
    # relevance then breaks its ties.
    rank = [fts_rank.desc()] if fts_rank is not None else []
    base_ordered = base_stmt.order_by(*vote_order, *rank, *recency)
    stmt = base_ordered.offset((page - 1) * page_size).limit(page_size)
    items = list((await session.execute(stmt)).scalars().unique().all())

    item_ids = [i.id for i in items]
    latest_vote_by_initiative = await _load_latest_vote(session, item_ids)
    topics_by_initiative = await _load_topics_by_initiative(session, item_ids)
    decree_links = await _load_decree_links(session, items)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                **InitiativeRead.model_validate(i).model_dump(mode="json"),
                # The initiative's verdict from its latest vote, not the
                # vote's raw result (see _initiative_verdict). None while
                # the initiative is still in progress.
                "latest_vote_result": (latest_vote_by_initiative.get(i.id) or {}).get("verdict"),
                # The whole decisive vote, so a list row can show who voted
                # what without opening the initiative. None until it is voted.
                "latest_vote": latest_vote_by_initiative.get(i.id),
                "topics": [
                    InitiativeTopicSlug.model_validate(tp).model_dump(mode="json")
                    for tp in topics_by_initiative.get(i.id, [])
                ],
                "decree_link": decree_links.get(i.id),
            }
            for i in items
        ],
    }


_FROM_DECREE_RE = re.compile(r"procedente del real decreto-ley (\d+)/(\d{4})", re.IGNORECASE)
_DECREE_RE = re.compile(r"^\s*real decreto-ley (\d+)/(\d{4})\b", re.IGNORECASE)


async def _load_decree_links(
    session: AsyncSession, items: Sequence[Initiative]
) -> dict[int, dict[str, object]]:
    """A decree-law and the bill it became, pointed at each other.

    After the Congress validates a Real Decreto-ley it can also process it
    as a bill ("procedente del Real Decreto-ley 14/2026"), so the groups
    can amend it. Two real initiatives, one law: the decree already in
    force, the bill still in progress. Shown side by side with no link, a
    reader took them for a duplicate with contradictory outcomes.

    Returns, per initiative id, ``{"kind": "from_decree" | "as_bill",
    "id", "official_id", "label"}``.
    """
    out: dict[int, dict[str, object]] = {}
    wanted: list[tuple[int, str, str]] = []  # (item id, kind, number/year)
    for it in items:
        title = it.title_original or ""
        if (m := _FROM_DECREE_RE.search(title)) is not None:
            wanted.append((it.id, "from_decree", f"{m.group(1)}/{m.group(2)}"))
        elif it.type == InitiativeType.REAL_DECRETO_LEY and (m := _DECREE_RE.match(title)):
            wanted.append((it.id, "as_bill", f"{m.group(1)}/{m.group(2)}"))
    for item_id, kind, number in wanted:
        if kind == "from_decree":
            stmt = select(Initiative.id, Initiative.official_id).where(
                Initiative.type == InitiativeType.REAL_DECRETO_LEY,
                Initiative.title_original.ilike(f"Real Decreto-ley {number},%"),
            )
        else:
            stmt = select(Initiative.id, Initiative.official_id).where(
                Initiative.type == InitiativeType.PROYECTO_LEY,
                Initiative.title_original.ilike(f"%procedente del Real Decreto-ley {number},%"),
            )
        row = (await session.execute(stmt.limit(1))).first()
        if row is not None:
            out[item_id] = {
                "kind": kind,
                "id": row[0],
                "official_id": row[1],
                "label": f"Real Decreto-ley {number}",
            }
    return out


async def _load_topics_by_initiative(
    session: AsyncSession, initiative_ids: list[int]
) -> dict[int, list[Topic]]:
    """Bulk-load topic rows per initiative id (empty list when unclassified).

    One indexed query; mirrors the loader on the votes list so list rows can
    show topic chips without an N+1.
    """
    if not initiative_ids:
        return {}
    rows = (
        await session.execute(
            select(InitiativeTopic.initiative_id, Topic)
            .join(Topic, Topic.id == InitiativeTopic.topic_id)
            .where(InitiativeTopic.initiative_id.in_(initiative_ids))
            # Editorial themes only. The SDG taxonomy has no page of its own
            # (``/agenda-2030`` redirects to ``/topics``), so an SDG chip was
            # a label with nowhere to go, and it sat next to the theme that
            # says the same thing: "Educación de calidad" beside "Educación".
            # The rows stay in the database for when that lens ships.
            .where(Topic.kind == "theme")
        )
    ).all()
    by_id: dict[int, list[Topic]] = {iid: [] for iid in initiative_ids}
    for initiative_id, topic in rows:
        by_id.setdefault(initiative_id, []).append(topic)
    return by_id


# The three stances that are a POSITION. Absent / no-record are not, so a
# group that only failed to show up has no stance to report.
_STANCES: tuple[VoteChoice, ...] = (VoteChoice.AYE, VoteChoice.NO, VoteChoice.ABSTENTION)


async def _load_latest_vote(
    session: AsyncSession, initiative_ids: list[int]
) -> dict[int, dict[str, Any]]:
    """Map each initiative id to its most recent linked vote: the tally AND
    how each parliamentary group voted.

    Two bulk queries for the whole page (the votes, then their records), so
    the laws list can show who voted what on every card without a request
    per row. Empty when an initiative has no linked vote yet, which is the
    case for roughly 3 in 5 law-creating initiatives (still in progress).
    """
    if not initiative_ids:
        return {}
    rows = (
        await session.execute(
            select(
                Vote.id,
                Vote.initiative_id,
                Vote.result,
                Vote.title,
                Vote.voted_at,
                Vote.ayes,
                Vote.noes,
                Vote.abstentions,
                Vote.absent,
                Vote.approved_by_assent,
            )
            .where(Vote.initiative_id.in_(initiative_ids))
            .order_by(Vote.voted_at.desc())
        )
    ).all()

    latest: dict[int, dict[str, Any]] = {}
    for (
        vote_id,
        initiative_id,
        result,
        title,
        voted_at,
        ayes,
        noes,
        abst,
        absent,
        by_assent,
    ) in rows:
        if initiative_id is None or initiative_id in latest:
            continue  # ordered latest-first, so the first row wins
        stage = _vote_stage(title)
        raw = str(result) if result is not None else None
        latest[initiative_id] = {
            # The procedural stage of this vote, so a card can say what
            # was voted ("amendments to the whole text") next to a verdict
            # that is not the vote's own result.
            "stage": stage,
            # What it means for the initiative; None = still in progress.
            "verdict": _initiative_verdict(stage, raw),
            "vote_id": vote_id,
            # ``VoteResult`` is a StrEnum, so the row value is already a
            # plain string; ``str(...)`` normalises it for the JSON body.
            "result": str(result) if result is not None else None,
            "voted_at": voted_at.isoformat() if voted_at is not None else None,
            "ayes": ayes,
            "noes": noes,
            "abstentions": abst,
            "absent": absent,
            "approved_by_assent": by_assent,
            "groups": [],
        }

    stances = await _load_group_stances(session, [v["vote_id"] for v in latest.values()])
    for payload in latest.values():
        payload["groups"] = stances.get(int(payload["vote_id"]), [])
    return latest


async def _load_group_stances(
    session: AsyncSession, vote_ids: list[int]
) -> dict[int, list[dict[str, Any]]]:
    """Each group's majority stance on each vote, biggest delegation first.

    Same aggregation as the alignment questionnaire: a group's stance is
    whichever of aye/no/abstention most of its deputies cast. ``deputies``
    is how many backed that stance, so the card can show "PP 135" rather
    than implying unanimity.
    """
    if not vote_ids:
        return {}
    rows = (
        await session.execute(
            select(
                VoteRecord.vote_id,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
                ParliamentaryGroup.logo_url,
                VoteRecord.choice,
                func.count(),
            )
            .join(ParliamentaryGroup, ParliamentaryGroup.id == VoteRecord.group_id_at_time)
            .where(VoteRecord.vote_id.in_(vote_ids))
            .group_by(
                VoteRecord.vote_id,
                ParliamentaryGroup.slug,
                ParliamentaryGroup.name_short,
                ParliamentaryGroup.color_hex,
                ParliamentaryGroup.logo_url,
                VoteRecord.choice,
            )
        )
    ).all()

    counts: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    meta: dict[str, tuple[str, str | None, str | None]] = {}
    for vote_id, slug, name_short, color_hex, logo_url, choice, n in rows:
        counts[(vote_id, slug)][str(choice)] = n
        meta[slug] = (name_short, color_hex, logo_url)

    out: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for (vote_id, slug), per_choice in counts.items():
        stance, backing = max(
            ((c, per_choice.get(str(c), 0)) for c in _STANCES), key=lambda kv: kv[1]
        )
        if backing == 0:
            continue  # the group was only absent / unrecorded
        name_short, color_hex, logo_url = meta[slug]
        out[vote_id].append(
            {
                "slug": slug,
                "name_short": name_short,
                "color_hex": color_hex,
                # So a reader recognises the party by its emblem rather than
                # by decoding a colour key.
                "logo_url": logo_url,
                "choice": stance.value,
                "deputies": backing,
                "total": sum(per_choice.values()),
            }
        )
    for items in out.values():
        items.sort(key=lambda g: (-int(g["deputies"]), str(g["slug"])))
    return dict(out)


@router.get("/profiles", response_model=list[dict[str, object]])
async def list_profiles(
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, object]]:
    """How many initiatives (laws and non-binding positions) touch each
    everyday situation directly.

    Every situation, in display order, with its count (zero included), for
    the "I a tu, que t'afecta?" picker. Aggregated in Python, as the
    audiences are, so the SQLite tests run the same path.
    """

    async def factory() -> list[dict[str, object]]:
        rows = (
            await session.execute(
                select(Initiative.profile_effects).where(Initiative.profile_effects.is_not(None))
            )
        ).all()
        counts: Counter[str] = Counter()
        for (effects,) in rows:
            if isinstance(effects, dict):
                counts.update(k for k in effects if k in PROFILES)
        return [{"key": key, "count": counts.get(key, 0)} for key in PROFILES]

    return await cached("initiatives:profiles", 3600, factory)


@router.get("/audiences", response_model=list[dict[str, object]])
async def list_audiences(
    legislature_id: int | None = Query(None, description="Filter by legislature"),
    creates_law: bool | None = Query(
        None, description="Same lens as the list endpoint: law-creating types only."
    ),
    lang: str = Query("ca", pattern="^(ca|es)$", description="Language of the returned tags."),
    limit: int = Query(40, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, object]]:
    """The affected-audience tags in use, most common first.

    Powers the "laws that affect me" filter: a reader picks a collective
    ("arrendataris", "autònoms") instead of guessing search words. Counted
    over the same lens the list uses, so every tag offered returns rows.

    Aggregated in Python rather than with ``jsonb_array_elements`` so the
    tests, which run on SQLite, exercise the same code path. At ~1.5k rows
    with a tiny JSON column each, one pass costs nothing and the result is
    cached for an hour.
    """
    conditions: list[Any] = [Initiative.affected_audiences.is_not(None)]
    if legislature_id is not None:
        conditions.append(Initiative.legislature_id == legislature_id)
    if creates_law is True:
        conditions.append(Initiative.type.in_(_LAW_TYPES))
    elif creates_law is False:
        conditions.append(Initiative.type.not_in(_LAW_TYPES))

    async def factory() -> list[dict[str, object]]:
        rows = (
            await session.execute(select(Initiative.affected_audiences).where(and_(*conditions)))
        ).all()
        counts: Counter[str] = Counter()
        for (audiences,) in rows:
            if not isinstance(audiences, dict):
                continue
            tags = audiences.get(lang) or []
            if not isinstance(tags, list):
                continue
            # One initiative counts once per tag, never twice for a repeat.
            for tag in {t.strip() for t in tags if isinstance(t, str) and t.strip()}:
                counts[tag] += 1
        return [{"tag": tag, "count": n} for tag, n in counts.most_common(limit)]

    return await cached(
        f"initiatives:audiences:{legislature_id}:{creates_law}:{lang}:{limit}", 3600, factory
    )


@router.get("/{initiative_id}", response_model=InitiativeDetail)
async def get_initiative(
    initiative_id: int,
    session: AsyncSession = Depends(get_session),
) -> InitiativeDetail:
    """Get a single initiative by its numeric primary key.

    Returns the full :class:`InitiativeDetail` shape, including the
    ``object_text`` preamble extracted from the bill's BOCG PDF when
    available, plus the linked votes (so the standalone initiative page
    can surface "the vote" without a second round-trip) and the topic
    classifications (used for breadcrumbs and similar-initiative seeds).
    """
    row = (
        await session.execute(select(Initiative).where(Initiative.id == initiative_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative not found")

    votes = (
        (
            await session.execute(
                select(Vote)
                .where(Vote.initiative_id == initiative_id)
                .order_by(desc(Vote.voted_at))
            )
        )
        .scalars()
        .all()
    )

    topic_rows = (
        (
            await session.execute(
                select(Topic)
                .join(InitiativeTopic, InitiativeTopic.topic_id == Topic.id)
                .where(InitiativeTopic.initiative_id == initiative_id)
            )
        )
        .scalars()
        .all()
    )

    # Re-use the InitiativeRead fields by serialising the ORM row then
    # adding the joined collections. Pydantic builds the response model
    # from `model_validate` so the from_attributes config applies.
    base = InitiativeRead.model_validate(row)
    return InitiativeDetail(
        **base.model_dump(),
        votes=[InitiativeVoteSummary.model_validate(v) for v in votes],
        topics=[InitiativeTopicSlug.model_validate(t) for t in topic_rows],
        decree_link=(await _load_decree_links(session, [row])).get(row.id),
    )


@router.get("/{initiative_id}/related", response_model=list[InitiativeRead])
async def related_initiatives(
    initiative_id: int,
    limit: int = Query(6, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
) -> list[Initiative]:
    """Return initiatives that share at least one topic with the given row.

    Ranking is by the number of overlapping topics (descending) and then
    by submission date (most recent first), so the strongest match leads
    the list. The originating initiative itself is excluded.
    """
    own_topic_ids = (
        (
            await session.execute(
                select(InitiativeTopic.topic_id).where(
                    InitiativeTopic.initiative_id == initiative_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not own_topic_ids:
        return []

    overlap_count = func.count(InitiativeTopic.topic_id).label("overlap")
    stmt = (
        select(Initiative, overlap_count)
        .join(InitiativeTopic, InitiativeTopic.initiative_id == Initiative.id)
        .where(InitiativeTopic.topic_id.in_(own_topic_ids))
        .where(Initiative.id != initiative_id)
        .group_by(Initiative.id)
        .order_by(desc(overlap_count), desc(Initiative.submitted_at))
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [row[0] for row in rows]
