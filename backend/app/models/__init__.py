"""ORM models for the Monitor Parlamentari domain.

This file defines the core entities: chambers, legislatures, persons,
mandates, parliamentary groups, initiatives, sessions, votes, and vote records.

All models inherit from `Base` and most include `TimestampMixin` for audit columns.
Identifiers from external sources (Congreso, Parlament) are stored as strings to
preserve their original format (e.g. "122/000262").
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ChamberLevel(StrEnum):
    """Administrative level of a parliamentary chamber."""

    NATIONAL = "national"
    REGIONAL = "regional"
    MUNICIPAL = "municipal"


class LegislatureStatus(StrEnum):
    ACTIVE = "active"
    DISSOLVED = "dissolved"
    CONCLUDED = "concluded"


class InitiativeType(StrEnum):
    """Types of parliamentary initiatives we track.

    Values mirror the categories used by the Congreso open data portal.
    Other chambers will be mapped onto these when possible.
    """

    PROYECTO_LEY = "proyecto_ley"  # Government bill
    PROPOSICION_LEY = "proposicion_ley"  # Parliamentary group bill
    PROPOSICION_NO_LEY = "proposicion_no_ley"  # Non-binding motion
    REAL_DECRETO_LEY = "real_decreto_ley"  # Decree-law (emergency)
    MOCION = "mocion"  # Motion
    INTERPELACION = "interpelacion"  # Interpellation
    OTHER = "other"


class InitiativeStatus(StrEnum):
    SUBMITTED = "submitted"
    IN_DEBATE = "in_debate"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    EXPIRED = "expired"


class VoteResult(StrEnum):
    APPROVED = "approved"
    REJECTED = "rejected"
    TIE = "tie"


class ScheduledSessionStatus(StrEnum):
    """Lifecycle of a scheduled (future) plenary session.

    - ``SCHEDULED``: session has a published orden del día PDF; concrete agenda items.
    - ``MODIFIED``: same as scheduled, but the PDF was reissued after first ingestion
      (the Mesa published an amendment — items may have been added or excluded).
    - ``CANCELLED``: the calendar previously listed this session but it has since
      disappeared from the published calendar (i.e. the Mesa cancelled the pleno).
    - ``COMPLETED``: the session date is in the past and the live votes ingest
      pipeline has taken over. Maintained for historical visibility.
    - ``PLANNED``: the calendar marks the day as a plenary day but no orden del día
      has been published yet (typical for dates >1 week out). Date only, no items.
    """

    SCHEDULED = "scheduled"
    MODIFIED = "modified"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    PLANNED = "planned"


class VoteChoice(StrEnum):
    """How an individual representative voted."""

    AYE = "aye"  # Yes
    NO = "no"
    ABSTENTION = "abstention"
    ABSENT = "absent"  # Did not attend
    NO_VOTE_RECORDED = "no_vote_recorded"  # Edge case (e.g. president, who doesn't vote)


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------


class Chamber(Base, TimestampMixin):
    """A parliamentary chamber (Congreso, Parlament, Plenari, etc.)."""

    __tablename__ = "chambers"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name_ca: Mapped[str] = mapped_column(String(255), nullable=False)
    name_es: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="ES")
    region: Mapped[str | None] = mapped_column(String(100))
    level: Mapped[ChamberLevel] = mapped_column(String(20), nullable=False)
    website: Mapped[str | None] = mapped_column(String(500))

    # Relationships
    legislatures: Mapped[list[Legislature]] = relationship(
        "Legislature", back_populates="chamber", cascade="all, delete-orphan"
    )


class Legislature(Base, TimestampMixin):
    """A legislative term within a chamber."""

    __tablename__ = "legislatures"
    __table_args__ = (
        UniqueConstraint("chamber_id", "number", name="uq_legislature_chamber_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[int] = mapped_column(ForeignKey("chambers.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    name_ca: Mapped[str] = mapped_column(String(100), nullable=False)
    name_es: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[LegislatureStatus] = mapped_column(String(20), nullable=False)

    # Relationships
    chamber: Mapped[Chamber] = relationship("Chamber", back_populates="legislatures")
    mandates: Mapped[list[Mandate]] = relationship("Mandate", back_populates="legislature")
    groups: Mapped[list[ParliamentaryGroup]] = relationship(
        "ParliamentaryGroup", back_populates="legislature"
    )


class Person(Base, TimestampMixin):
    """A natural person who has been (or is) a parliamentary representative.

    A single person can have multiple Mandates across legislatures and chambers.
    Personal data here is restricted to what is public for elected officials:
    full name, gender, birth year, official photo, biography URL.
    """

    __tablename__ = "persons"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    given_names: Mapped[str | None] = mapped_column(String(255))
    family_names: Mapped[str | None] = mapped_column(String(255))
    gender: Mapped[str | None] = mapped_column(String(1))  # 'F', 'M', 'X' or NULL
    birth_year: Mapped[int | None] = mapped_column(Integer)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    biography_url: Mapped[str | None] = mapped_column(String(500))
    # Numeric ID the Congreso website uses internally (and the path
    # component of /docu/imgweb/diputados/{cod}_15.jpg). Backfilled by
    # ``app.ingest.congreso.photos``; null for historical persons or any
    # deputy we couldn't match by name.
    cod_parlamentario: Mapped[int | None] = mapped_column(Integer, index=True)
    # Seat position on the official Congreso hemicycle PNG (natural size
    # 536×393). Backfilled by ``app.ingest.congreso.hemicycle`` from the
    # ``<area coords="x,y,r">`` overlay published at
    # ``/ca/hemiciclo``. NULL until that importer has run. See migration
    # ``0016_person_seat_position``.
    seat_x: Mapped[int | None] = mapped_column(Integer)
    seat_y: Mapped[int | None] = mapped_column(Integer)

    # Public office that modifies expected voting behaviour. ``role_title``
    # is the Spanish text from the hemicycle scrape ("Presidente del
    # Gobierno", "Ministra de Educación", "Vicepresidente Primero"…).
    # ``role_kind`` buckets it: 'govern' (cabinet — do not vote in
    # ordinary plenary), 'mesa' (Mesa del Congreso officers), or NULL
    # (regular deputy). The frontend uses ``role_kind`` to attach a
    # caveat to attendance / cohesion metrics so a 47% attendance on
    # the President of Government isn't read as absenteeism.
    role_title: Mapped[str | None] = mapped_column(String(200))
    role_kind: Mapped[str | None] = mapped_column(String(16), index=True)

    # Biographical paragraph scraped from the Congreso ficha page
    # ("Licenciada en Farmacia. Postgrado en Dermofarmacia. …"). HTML
    # tags stripped; original line breaks preserved as ``\n\n`` so the
    # frontend can render paragraphs. NULL when the ficha has no bio
    # text or has not been scraped yet. See migration
    # ``0018_person_bio_commissions`` and
    # ``app.ingest.congreso.photos._extract_bio_text``.
    bio_text: Mapped[str | None] = mapped_column(Text)
    # Committee assignments and parliamentary roles as they appear in
    # the ficha's "Càrrecs" block — one verbatim string per entry
    # ("Adscrita de la Comisión de Derechos Sociales y Consumo des del
    # 04/04/2024", …). JSONB on Postgres, JSON on SQLite (tests). NULL
    # before the photos backfill has run; empty list ([]) when the
    # ficha publishes no role rows.
    commissions: Mapped[list[str] | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )

    # Wikidata enrichment — populated by the background worker
    # ``enrich_persons_wikidata``. All columns are nullable; an
    # unmatched person looks identical to one whose match failed
    # rather than carrying a placeholder. ``wikidata_qid`` is the
    # durable identifier; the per-locale Wikipedia URLs are
    # pre-computed so the frontend never has to hit Wikidata.
    wikidata_qid: Mapped[str | None] = mapped_column(String(16), unique=True)
    wikipedia_url_ca: Mapped[str | None] = mapped_column(String(500))
    wikipedia_url_es: Mapped[str | None] = mapped_column(String(500))
    wikipedia_url_en: Mapped[str | None] = mapped_column(String(500))
    # Plain-text extract (first paragraph) pulled from Wikipedia REST
    # summary API per locale. Stored server-side so the frontend reads
    # in one DB query and stays resilient to Wikipedia downtime; the
    # worker refreshes them periodically.
    wikipedia_summary_ca: Mapped[str | None] = mapped_column(Text)
    wikipedia_summary_es: Mapped[str | None] = mapped_column(Text)
    wikipedia_summary_en: Mapped[str | None] = mapped_column(Text)
    education: Mapped[str | None] = mapped_column(String(255))
    profession: Mapped[str | None] = mapped_column(String(255))

    # Relationships
    mandates: Mapped[list[Mandate]] = relationship("Mandate", back_populates="person")


class ParliamentaryGroup(Base, TimestampMixin):
    """A parliamentary group within a specific legislature.

    A political party may have different group names in different legislatures
    (e.g. coalitions, splinter groups), so each (legislature, slug) pair is unique.
    """

    __tablename__ = "parliamentary_groups"
    __table_args__ = (UniqueConstraint("legislature_id", "slug", name="uq_group_legislature_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    legislature_id: Mapped[int] = mapped_column(
        ForeignKey("legislatures.id"), nullable=False, index=True
    )
    # 120, not 50: historical coalition groups have long names/slugs, e.g.
    # "GP Confederal de Unidas Podemos-En Comú Podem-Galicia en Común".
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    name_short: Mapped[str] = mapped_column(String(120), nullable=False)
    name_long: Mapped[str] = mapped_column(String(255), nullable=False)
    color_hex: Mapped[str | None] = mapped_column(String(7))  # e.g. '#FF0000'
    # Optional URL to an official party / group logo. The Congreso
    # portal does not publish these as standalone images (verified
    # 2026-05-12 — the only on-site occurrence is an inline base64 JPEG
    # inside the deputy ficha page) and reusing trademarked party logos
    # carries non-trivial legal risk for a third-party transparency
    # site. Production ships with this column NULL for every group; the
    # frontend then falls back to the neutral colored-disc rendering.
    # See migration ``0019_group_logo_url`` for the full rationale.
    logo_url: Mapped[str | None] = mapped_column(String(500))

    # Relationships
    legislature: Mapped[Legislature] = relationship("Legislature", back_populates="groups")
    memberships: Mapped[list[GroupMembership]] = relationship(
        "GroupMembership", back_populates="group"
    )


class Mandate(Base, TimestampMixin):
    """A representative's mandate in a specific chamber and legislature.

    A Person can have multiple Mandates (different legislatures, different chambers).
    A Mandate is the unit to which votes are attributed: when "Pedro Sánchez voted Aye",
    we record that against his Mandate, not directly against his Person.
    """

    __tablename__ = "mandates"

    id: Mapped[int] = mapped_column(primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("persons.id"), nullable=False, index=True)
    chamber_id: Mapped[int] = mapped_column(ForeignKey("chambers.id"), nullable=False, index=True)
    legislature_id: Mapped[int] = mapped_column(
        ForeignKey("legislatures.id"), nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    constituency: Mapped[str | None] = mapped_column(String(100))
    electoral_list_party: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str | None] = mapped_column(String(50), index=True)

    # Relationships
    person: Mapped[Person] = relationship("Person", back_populates="mandates")
    legislature: Mapped[Legislature] = relationship("Legislature", back_populates="mandates")
    group_memberships: Mapped[list[GroupMembership]] = relationship(
        "GroupMembership", back_populates="mandate", cascade="all, delete-orphan"
    )
    vote_records: Mapped[list[VoteRecord]] = relationship("VoteRecord", back_populates="mandate")


class GroupMembership(Base, TimestampMixin):
    """Historical record of a Mandate's membership in a parliamentary group.

    Crucial: representatives can change groups during a legislature.
    When attributing a vote, we look up which group the Mandate belonged to on
    the vote's date, NOT their current group.
    """

    __tablename__ = "group_memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    mandate_id: Mapped[int] = mapped_column(ForeignKey("mandates.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("parliamentary_groups.id"), nullable=False, index=True
    )
    role: Mapped[str | None] = mapped_column(String(50))  # spokesperson, member, etc.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)

    mandate: Mapped[Mandate] = relationship("Mandate", back_populates="group_memberships")
    group: Mapped[ParliamentaryGroup] = relationship(
        "ParliamentaryGroup", back_populates="memberships"
    )


# ---------------------------------------------------------------------------
# Topics (thematic categorization)
# ---------------------------------------------------------------------------


class Topic(Base, TimestampMixin):
    """A thematic category used to classify initiatives.

    Belongs to one of multiple parallel classification "knowledge bases",
    identified by ``kind``:

    - ``'theme'`` — the editorial 17-topic taxonomy (housing, healthcare,
      etc.) that the project has always shipped.
    - ``'sdg'`` — the 17 UN Sustainable Development Goals, seeded in
      migration ``0015_classification_knowledge_bases``.

    A single Initiative may have ``InitiativeTopic`` rows pointing at
    Topics of multiple kinds simultaneously — the same initiative is
    classified independently in each KB. ``InitiativeTopic.classified_by``
    encodes which classifier emitted the link (theme vs SDG prompt), so
    re-running one KB never overwrites the other.
    """

    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name_ca: Mapped[str] = mapped_column(String(100), nullable=False)
    name_es: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    color_hex: Mapped[str | None] = mapped_column(String(7))
    icon: Mapped[str | None] = mapped_column(String(50))
    description_ca: Mapped[str | None] = mapped_column(Text)
    description_es: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    # Which classification knowledge base this topic belongs to. See class
    # docstring. Indexed for cheap `WHERE kind = 'sdg'` filtering.
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="theme", index=True)


# ---------------------------------------------------------------------------
# Initiatives, sessions, votes
# ---------------------------------------------------------------------------


class Initiative(Base, TimestampMixin):
    """A parliamentary initiative (bill, proposition, motion, etc.)."""

    __tablename__ = "initiatives"
    __table_args__ = (
        UniqueConstraint("chamber_id", "official_id", name="uq_initiative_chamber_official_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[int] = mapped_column(ForeignKey("chambers.id"), nullable=False, index=True)
    legislature_id: Mapped[int] = mapped_column(
        ForeignKey("legislatures.id"), nullable=False, index=True
    )
    type: Mapped[InitiativeType] = mapped_column(String(50), nullable=False, index=True)
    official_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title_original: Mapped[str] = mapped_column(Text, nullable=False)
    title_ca: Mapped[str | None] = mapped_column(Text)
    title_es: Mapped[str | None] = mapped_column(Text)
    title_en: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    # Full "Exposición de motivos" / "Preámbulo" prose extracted from the
    # bill's BOCG PDF. The portal's JSON only carries the title in
    # ``OBJETO`` — the explanatory prose readers care about lives in the
    # PDF and is populated here by :mod:`app.ingest.congreso.object_extractor`.
    # NULL means we either haven't fetched the PDF yet, the PDF had no
    # recognisable heading, or the extracted section was too short to be
    # useful. See migration ``0020_initiative_object_text``.
    object_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[InitiativeStatus] = mapped_column(String(20), nullable=False, index=True)
    submitted_at: Mapped[date | None] = mapped_column(Date)
    # Stored as Text because some Proposiciones de Ley list every co-signer's
    # name and group, exceeding 255 chars.
    submitted_by: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))
    # Reference to the Boletín Oficial del Estado entry when an
    # approved initiative ends up published as law. ``boe_id`` is the
    # canonical "BOE-A-YYYY-NNNNN" identifier; ``boe_url`` is the
    # direct link to the boe.es entry. Both NULL until the worker
    # ``enrich_initiatives_boe`` matches the expediente. Always
    # nullable: many initiatives never reach publication (PNL,
    # rejected projects, etc.) and we'd rather show nothing than
    # invent a placeholder.
    boe_id: Mapped[str | None] = mapped_column(String(40))
    boe_url: Mapped[str | None] = mapped_column(String(500))
    # When the published law enters into force, lifted from the
    # ``fecha_vigencia`` field of the BOE consolidated-legislation API
    # (the BOE has already parsed the "Disposición final"). NULL until
    # the worker matches the initiative against its published norm.
    boe_entry_in_force: Mapped[date | None] = mapped_column(Date)
    # Plain-language explanations produced by an LLM, per locale. May be
    # NULL when the generator returned [INSUFICIENT] or when generation
    # hasn't run yet. See ``app.services.plain_summary``.
    plain_summary_ca: Mapped[str | None] = mapped_column(Text)
    plain_summary_es: Mapped[str | None] = mapped_column(Text)
    plain_summary_provider: Mapped[str | None] = mapped_column(String(64))
    plain_summary_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Session(Base, TimestampMixin):
    """A parliamentary session (a specific date when votes occurred)."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[int] = mapped_column(ForeignKey("chambers.id"), nullable=False, index=True)
    legislature_id: Mapped[int] = mapped_column(
        ForeignKey("legislatures.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    type: Mapped[str | None] = mapped_column(String(50))  # plenary, committee, etc.
    title: Mapped[str | None] = mapped_column(Text)
    recording_url: Mapped[str | None] = mapped_column(String(500))


class Vote(Base, TimestampMixin):
    """A specific vote that took place in a session."""

    __tablename__ = "votes"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    initiative_id: Mapped[int | None] = mapped_column(ForeignKey("initiatives.id"), index=True)
    initiative: Mapped[Initiative | None] = relationship("Initiative", lazy="raise")
    sequence_in_session: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    voted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    result: Mapped[VoteResult] = mapped_column(String(20), nullable=False, index=True)
    ayes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    noes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    abstentions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    absent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    external_id: Mapped[str | None] = mapped_column(String(100), index=True)
    source_url: Mapped[str | None] = mapped_column(String(500))
    # Initiative's official id (NUMEXPEDIENTE) scraped from the votes listing
    # HTML. Stored even when no Initiative row matches yet, so a later backfill
    # can link them without re-scraping. See proyecto-colibri's `n_exp` regex.
    expediente_raw: Mapped[str | None] = mapped_column(String(50), index=True)
    # Absolute URL of the official seat-map PNG (deputies plotted as
    # green/red/yellow dots). The frontend lazy-loads this directly.
    graphic_url: Mapped[str | None] = mapped_column(String(500))
    # Resolved proposing parliamentary group, denormalized from the
    # description for cheap WHERE-clause filtering. Set at ingest time
    # via :func:`app.services.proposing_group.resolve_proposing_group`.
    proposing_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("parliamentary_groups.id"), index=True
    )
    # True when the vote is on a government instrument (Proyecto de Ley,
    # Real Decreto-ley convalidation). Mutually exclusive with
    # ``proposing_group_id`` — the proposer is the Cabinet, not a group.
    proposed_by_government: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )
    # True for "votación por asentimiento": the item was approved by assent
    # (acclamation) with no roll-call and no numeric tally. ayes/noes/
    # abstentions/absent are all 0 and there are no VoteRecord rows. The UI
    # must render these as "approved by assent", not as a 0-0-0 count.
    approved_by_assent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Plain-language summaries owned by the *vote* row. Populated only for
    # votes without a linked Initiative (PNL, mociones, reform debates,
    # ad-hoc procedural votes). When NULL and ``initiative_id`` is set, the
    # API falls back to the corresponding fields on Initiative. See
    # migration ``0013_vote_plain_summary`` and
    # ``app.services.plain_summary``.
    plain_summary_ca: Mapped[str | None] = mapped_column(Text)
    plain_summary_es: Mapped[str | None] = mapped_column(Text)
    plain_summary_provider: Mapped[str | None] = mapped_column(String(64))
    plain_summary_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class InitiativeTopic(Base, TimestampMixin):
    """Many-to-many association between Initiatives and Topics, with confidence."""

    __tablename__ = "initiative_topics"
    __table_args__ = (UniqueConstraint("initiative_id", "topic_id", name="uq_initiative_topic"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    initiative_id: Mapped[int] = mapped_column(
        ForeignKey("initiatives.id"), nullable=False, index=True
    )
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(nullable=False)  # 0.0 to 1.0
    classified_by: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # 'llm:mistral-small', 'human', etc.
    classified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class VoteRecord(Base, TimestampMixin):
    """Individual representative's vote on a specific Vote.

    `group_id_at_time` records which parliamentary group the Mandate belonged to
    at the moment of the vote — this is what lets us correctly attribute votes
    to groups even when representatives switch groups mid-legislature.
    """

    __tablename__ = "vote_records"
    __table_args__ = (UniqueConstraint("vote_id", "mandate_id", name="uq_vote_record"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    vote_id: Mapped[int] = mapped_column(ForeignKey("votes.id"), nullable=False, index=True)
    mandate_id: Mapped[int] = mapped_column(ForeignKey("mandates.id"), nullable=False, index=True)
    choice: Mapped[VoteChoice] = mapped_column(String(20), nullable=False, index=True)
    group_id_at_time: Mapped[int | None] = mapped_column(
        ForeignKey("parliamentary_groups.id"), index=True
    )

    mandate: Mapped[Mandate] = relationship("Mandate", back_populates="vote_records")


# ---------------------------------------------------------------------------
# Subscriptions and analytics (minimal, privacy-preserving)
# ---------------------------------------------------------------------------


class AlertSubscription(Base, TimestampMixin):
    """User subscription to alerts about a topic, person, or group."""

    __tablename__ = "alert_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'topic', 'person', 'group'
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[str] = mapped_column(String(2), nullable=False, default="ca")
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confirmation_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NewsletterSubscription(Base, TimestampMixin):
    """User subscription to the weekly newsletter."""

    __tablename__ = "newsletter_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    language: Mapped[str] = mapped_column(String(2), nullable=False, default="ca")
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The confirmation_token doubles as the long-lived "manage token" once
    # the subscription is confirmed: the welcome / digest emails embed it
    # as ``?token=`` so the recipient can update their topic preferences
    # or unsubscribe without us asking them to remember a password. The
    # service code intentionally NO LONGER NULLs this on confirmation —
    # see app/alerts/service.py:confirm_newsletter_subscription.
    confirmation_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    listmonk_id: Mapped[int | None] = mapped_column(Integer)
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Per-subscriber topic interest filter; empty list means "every
    # topic" (historical default for everyone who confirmed before this
    # column existed). JSONB on Postgres, JSON on SQLite for tests.
    topic_slugs: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),
        nullable=False,
        default=list,
        server_default="[]",
    )


class PushSubscription(Base, TimestampMixin):
    """Browser Web Push subscription — one per (endpoint).

    A push subscription is the canonical "user" identity for the push channel:
    we never store an email or any other identifier. The browser-issued
    ``endpoint`` is itself the unique handle. ``p256dh`` and ``auth`` are the
    ECDH parameters returned by ``pushManager.subscribe()`` and required by the
    Web Push protocol to encrypt the payload.

    ``failed_send_count`` is bumped on consecutive 5xx/transient failures from
    the push service. The service deletes the row outright on 404/410
    (subscription gone) instead of bumping. A small N-strikes prune keeps
    the table clean from genuinely-dead endpoints.
    """

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_send_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    interests: Mapped[list[PushTopicInterest]] = relationship(
        "PushTopicInterest",
        back_populates="subscription",
        cascade="all, delete-orphan",
    )
    group_interests: Mapped[list[PushGroupInterest]] = relationship(
        "PushGroupInterest",
        back_populates="subscription",
        cascade="all, delete-orphan",
    )


class PushTopicInterest(Base, TimestampMixin):
    """Junction: which topics a push subscription wants to be notified about."""

    __tablename__ = "push_topic_interests"
    __table_args__ = (
        UniqueConstraint("subscription_id", "topic_id", name="uq_push_topic_interest"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("push_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True
    )

    subscription: Mapped[PushSubscription] = relationship(
        "PushSubscription", back_populates="interests"
    )


class PushGroupInterest(Base, TimestampMixin):
    """Junction: which parliamentary groups a push subscription follows.

    Parallel to :class:`PushTopicInterest`; the fan-out logic unions
    the two interest sets so a notification fires when EITHER the
    topic OR the proposing group matches. Symmetric by construction
    — every group can be followed, no curated 'recommended' list.
    """

    __tablename__ = "push_group_interests"
    __table_args__ = (
        UniqueConstraint("subscription_id", "group_id", name="uq_push_group_interest"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("push_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("parliamentary_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    subscription: Mapped[PushSubscription] = relationship(
        "PushSubscription", back_populates="group_interests"
    )


class DeviceToken(Base, TimestampMixin):
    """A native push registration (APNs/FCM device token) for the Capacitor app.

    Parallel to the Web Push :class:`PushSubscription`: a WKWebView / Android
    WebView can't use the Web Push API, so the native wrapper registers for
    native push and posts its device token here. Interests are kept inline as
    JSON slug lists (the app posts the full set whenever they change) so this
    is a single additive table — the fan-out unions topic OR group, same rule
    as the web channel. ``platform`` is a plain string ('ios'/'android'/'web')
    rather than a DB enum to keep the migration dialect-agnostic.
    """

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    topic_slugs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    group_slugs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_send_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# ---------------------------------------------------------------------------
# Scheduled (upcoming) sessions and agenda items
# ---------------------------------------------------------------------------


class ScheduledSession(Base, TimestampMixin):
    """A plenary session that is scheduled / planned but has not yet happened.

    These rows are populated by the agenda ingest pipeline (see
    ``app.ingest.congreso.agenda``). When a session date passes and live vote
    data lands via the votes ingest pipeline, the corresponding ``Session``
    row is the canonical source of truth — the ``ScheduledSession`` is kept
    around so the frontend can show "this happened" with the previously
    announced agenda intact.

    Two uniqueness constraints model the natural keys:

    - ``(chamber_id, legislature_id, session_number)`` — the Congreso assigns
      a strictly monotonic session number. Re-runs of the importer are
      idempotent on this key.
    - ``(chamber_id, legislature_id, date)`` — the portal publishes one
      plenary session per date in practice; this protects against accidental
      duplicate inserts when the source HTML changes shape.
    """

    __tablename__ = "scheduled_sessions"
    __table_args__ = (
        UniqueConstraint(
            "chamber_id",
            "legislature_id",
            "session_number",
            name="uq_scheduled_session_number",
        ),
        UniqueConstraint(
            "chamber_id",
            "legislature_id",
            "date",
            name="uq_scheduled_session_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    chamber_id: Mapped[int] = mapped_column(ForeignKey("chambers.id"), nullable=False, index=True)
    legislature_id: Mapped[int] = mapped_column(
        ForeignKey("legislatures.id"), nullable=False, index=True
    )
    session_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    pdf_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ScheduledSessionStatus] = mapped_column(String(20), nullable=False, index=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    items: Mapped[list[ScheduledAgendaItem]] = relationship(
        "ScheduledAgendaItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ScheduledAgendaItem.position",
    )


class ScheduledAgendaItem(Base, TimestampMixin):
    """A single item in the orden del día of a scheduled plenary session.

    ``official_id`` mirrors ``votes.expediente_raw``: it's the
    ``NUMEXPEDIENTE`` string scraped from the PDF (e.g. ``"122/000262"``,
    ``"180/001032"``) and is NOT a real foreign key — many agenda items
    correspond to initiatives that don't exist in our ``initiatives`` table
    yet (e.g. preguntas with expediente prefix ``180/``).

    ``kind`` is the parsed item type (``proposicion_ley``, ``decreto_ley``,
    ``pnl``, ``pregunta``, ``mocion``, ``interpelacion``, ``reforma_const``,
    ``otro``) — derived from the section roman numeral.

    ``target_minister`` is set only for items in section V (Preguntas) where
    the PDF prints a sub-header like ``MINISTRO DE HACIENDA`` immediately
    above the question.

    Items are ordered by ``position`` (1-based, source order in the PDF).
    """

    __tablename__ = "scheduled_agenda_items"
    __table_args__ = (
        UniqueConstraint(
            "scheduled_session_id",
            "position",
            name="uq_scheduled_agenda_item_position",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    scheduled_session_id: Mapped[int] = mapped_column(
        ForeignKey("scheduled_sessions.id"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    proposing_group: Mapped[str | None] = mapped_column(Text)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    official_id: Mapped[str | None] = mapped_column(String(50), index=True)
    target_minister: Mapped[str | None] = mapped_column(Text)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    session: Mapped[ScheduledSession] = relationship("ScheduledSession", back_populates="items")
