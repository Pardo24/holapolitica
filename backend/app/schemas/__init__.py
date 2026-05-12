"""Pydantic schemas for API request/response models.

These define the public shape of data returned by the API. They are intentionally
separate from SQLAlchemy models so we can evolve them independently and never
leak internal columns by accident.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    ChamberLevel,
    InitiativeStatus,
    InitiativeType,
    LegislatureStatus,
    ScheduledSessionStatus,
    VoteChoice,
    VoteResult,
)

# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------


class PaginatedResponse(BaseModel):
    """Generic paginated response envelope."""

    total: int
    page: int
    page_size: int
    items: list[object]  # Subclasses should narrow this with the proper item type


# ---------------------------------------------------------------------------
# Chambers
# ---------------------------------------------------------------------------


class ChamberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name_ca: str
    name_es: str
    name_en: str
    country: str
    region: str | None = None
    level: ChamberLevel
    website: str | None = None


# ---------------------------------------------------------------------------
# Legislatures
# ---------------------------------------------------------------------------


class LegislatureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chamber_id: int
    number: str
    name_ca: str
    name_es: str
    name_en: str
    start_date: date
    end_date: date | None = None
    status: LegislatureStatus


# ---------------------------------------------------------------------------
# Persons and mandates
# ---------------------------------------------------------------------------


class PersonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    given_names: str | None = None
    family_names: str | None = None
    gender: str | None = None
    birth_year: int | None = None
    photo_url: str | None = None
    biography_url: str | None = None
    # Current parliamentary group (group with an open membership for this
    # person's most recent mandate). Resolved at API time, not stored.
    current_group_slug: str | None = None
    current_group_short: str | None = None
    current_group_color: str | None = None
    current_constituency: str | None = None
    # Public role that modifies expected voting behaviour. Frontend uses
    # role_kind to decide whether to surface a caveat next to attendance
    # / cohesion metrics. See Person model docstring for buckets.
    role_title: str | None = None
    role_kind: str | None = None
    # Free-text biography paragraph and committee/role assignments,
    # scraped from the Congreso ficha page. ``bio_text`` is multi-line
    # plain text (paragraph breaks as ``\n\n``); ``commissions`` is a
    # list of verbatim source strings. Both NULL when the ficha hasn't
    # been scraped yet — frontend hides the section in that case.
    bio_text: str | None = None
    commissions: list[str] | None = None


class MandateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    chamber_id: int
    legislature_id: int
    start_date: date
    end_date: date | None = None
    constituency: str | None = None
    electoral_list_party: str | None = None


class MandateWithPerson(MandateRead):
    person: PersonRead


# ---------------------------------------------------------------------------
# Parliamentary groups
# ---------------------------------------------------------------------------


class ParliamentaryGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    legislature_id: int
    slug: str
    name_short: str
    name_long: str
    color_hex: str | None = None
    # Optional URL to an official group logo. NULL in production today —
    # see migration ``0019_group_logo_url`` for the licensing rationale.
    # When present, the frontend's :file:`GroupBadge` / :file:`GroupChip`
    # render the image in place of the colored abbreviation disc.
    logo_url: str | None = None


# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------


class TopicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name_ca: str
    name_es: str
    name_en: str
    color_hex: str | None = None
    icon: str | None = None
    # 'theme' (the editorial 17-topic taxonomy) or 'sdg' (the 17 UN
    # Sustainable Development Goals). See ``app.models.Topic.kind``.
    kind: str = "theme"
    description_ca: str | None = None
    description_es: str | None = None
    description_en: str | None = None


# ---------------------------------------------------------------------------
# Initiatives
# ---------------------------------------------------------------------------


class InitiativeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chamber_id: int
    legislature_id: int
    type: InitiativeType
    official_id: str
    title_original: str
    title_ca: str | None = None
    title_es: str | None = None
    title_en: str | None = None
    summary: str | None = None
    status: InitiativeStatus
    submitted_at: date | None = None
    submitted_by: str | None = None
    source_url: str | None = None
    plain_summary_ca: str | None = None
    plain_summary_es: str | None = None
    plain_summary_provider: str | None = None
    plain_summary_generated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Votes
# ---------------------------------------------------------------------------


class VoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    initiative_id: int | None = None
    sequence_in_session: int | None = None
    title: str
    description: str | None = None
    voted_at: datetime
    result: VoteResult
    ayes: int
    noes: int
    abstentions: int
    absent: int
    source_url: str | None = None
    expediente_raw: str | None = None
    graphic_url: str | None = None
    # Group that proposed/registered this vote, derived from ``description``
    # ("Proposición no de Ley del Grupo Parlamentario X, …") or, in future,
    # from the linked Initiative.submitted_by. Populated by
    # ``app.services.proposing_group``; null when no group can be reliably
    # extracted (e.g. government bills, multi-group co-signed initiatives).
    proposing_group_slug: str | None = None
    proposing_group_short: str | None = None
    proposing_group_color: str | None = None
    proposed_by_government: bool = False
    # Plain-language summary, pulled from the linked Initiative when one
    # exists, per locale. NULL when the vote isn't initiative-linked yet,
    # or when the generator declined / hasn't run for that locale.
    plain_summary_ca: str | None = None
    plain_summary_es: str | None = None
    plain_summary_provider: str | None = None


class VoteRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vote_id: int
    mandate_id: int
    choice: VoteChoice
    group_id_at_time: int | None = None


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------


class NewsletterSubscriptionCreate(BaseModel):
    email: EmailStr
    language: str = Field(default="ca", pattern="^(ca|es|en)$")


class AlertSubscriptionCreate(BaseModel):
    email: EmailStr
    target_type: str = Field(pattern="^(topic|person|group)$")
    target_id: int
    language: str = Field(default="ca", pattern="^(ca|es|en)$")


class SubscriptionConfirmation(BaseModel):
    """Returned after a successful subscription request."""

    message: str
    requires_confirmation: bool = True


# ---------------------------------------------------------------------------
# Scheduled (upcoming) sessions and agenda items
# ---------------------------------------------------------------------------


class ScheduledAgendaItemRead(BaseModel):
    """One numbered item in an upcoming session's orden del día.

    Faithful, factual copy of the source PDF — no editorial framing, no
    auto-classification at this stage. Topics will join later via the
    standard classifier on the linked ``Initiative`` once a vote materialises.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    section: str
    kind: str
    proposing_group: str | None = None
    subject: str
    official_id: str | None = None
    target_minister: str | None = None
    last_seen_at: datetime


class ScheduledSessionRead(BaseModel):
    """An upcoming / planned plenary session."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    chamber_id: int
    legislature_id: int
    session_number: int
    date: date
    pdf_url: str | None = None
    status: ScheduledSessionStatus
    fetched_at: datetime | None = None
    last_seen_at: datetime
    items: list[ScheduledAgendaItemRead] = []
