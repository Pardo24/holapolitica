"""scheduled (upcoming) sessions and agenda items

Adds tables to track the upcoming plenary calendar surfaced by the Congreso
``calendario-de-sesiones-plenarias`` page and the orden del día PDFs the
Mesa publishes for the next session. See
``docs/upcoming-votes-source.md`` for the full source description.

Two new tables:

- ``scheduled_sessions`` — one row per future / planned plenary day. Status
  enum captures the lifecycle: ``planned`` (calendar marker, no PDF yet),
  ``scheduled`` (orden del día PDF fetched), ``modified`` (PDF re-issued
  after first fetch), ``cancelled`` (Mesa removed the day from the
  calendar), ``completed`` (date passed; live votes own the canonical
  record).
- ``scheduled_agenda_items`` — one row per numbered item in the PDF, kept
  raw and factual (no editorial framing). ``official_id`` is the scraped
  ``NUMEXPEDIENTE`` string, mirroring ``votes.expediente_raw``.

Both tables stand alone — no edits to existing schema. The agenda ingest
pipeline is parallel to the votes pipeline; nothing in this migration
touches votes/sessions/initiatives.

Revision ID: 0012_scheduled_sessions
Revises: 0011_plain_summary_lang
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_scheduled_sessions"
down_revision: Union[str, None] = "0011_plain_summary_lang"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chamber_id", sa.Integer(), nullable=False),
        sa.Column("legislature_id", sa.Integer(), nullable=False),
        sa.Column("session_number", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("pdf_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["chamber_id"],
            ["chambers.id"],
            name="fk_scheduled_sessions_chamber_id_chambers",
        ),
        sa.ForeignKeyConstraint(
            ["legislature_id"],
            ["legislatures.id"],
            name="fk_scheduled_sessions_legislature_id_legislatures",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_scheduled_sessions"),
        sa.UniqueConstraint(
            "chamber_id",
            "legislature_id",
            "session_number",
            name="uq_scheduled_session_number",
        ),
        sa.UniqueConstraint(
            "chamber_id",
            "legislature_id",
            "date",
            name="uq_scheduled_session_date",
        ),
    )
    op.create_index("ix_scheduled_sessions_chamber_id", "scheduled_sessions", ["chamber_id"])
    op.create_index(
        "ix_scheduled_sessions_legislature_id",
        "scheduled_sessions",
        ["legislature_id"],
    )
    op.create_index(
        "ix_scheduled_sessions_session_number",
        "scheduled_sessions",
        ["session_number"],
    )
    op.create_index("ix_scheduled_sessions_date", "scheduled_sessions", ["date"])
    op.create_index("ix_scheduled_sessions_status", "scheduled_sessions", ["status"])

    op.create_table(
        "scheduled_agenda_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scheduled_session_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("section", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("proposing_group", sa.Text(), nullable=True),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("official_id", sa.String(length=50), nullable=True),
        sa.Column("target_minister", sa.Text(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["scheduled_session_id"],
            ["scheduled_sessions.id"],
            name="fk_scheduled_agenda_items_session_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_scheduled_agenda_items"),
        sa.UniqueConstraint(
            "scheduled_session_id",
            "position",
            name="uq_scheduled_agenda_item_position",
        ),
    )
    op.create_index(
        "ix_scheduled_agenda_items_scheduled_session_id",
        "scheduled_agenda_items",
        ["scheduled_session_id"],
    )
    op.create_index("ix_scheduled_agenda_items_kind", "scheduled_agenda_items", ["kind"])
    op.create_index(
        "ix_scheduled_agenda_items_official_id",
        "scheduled_agenda_items",
        ["official_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_scheduled_agenda_items_official_id", table_name="scheduled_agenda_items")
    op.drop_index("ix_scheduled_agenda_items_kind", table_name="scheduled_agenda_items")
    op.drop_index(
        "ix_scheduled_agenda_items_scheduled_session_id",
        table_name="scheduled_agenda_items",
    )
    op.drop_table("scheduled_agenda_items")
    op.drop_index("ix_scheduled_sessions_status", table_name="scheduled_sessions")
    op.drop_index("ix_scheduled_sessions_date", table_name="scheduled_sessions")
    op.drop_index("ix_scheduled_sessions_session_number", table_name="scheduled_sessions")
    op.drop_index("ix_scheduled_sessions_legislature_id", table_name="scheduled_sessions")
    op.drop_index("ix_scheduled_sessions_chamber_id", table_name="scheduled_sessions")
    op.drop_table("scheduled_sessions")
