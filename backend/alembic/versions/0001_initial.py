"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-08 00:00:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chambers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name_ca", sa.String(255), nullable=False),
        sa.Column("name_es", sa.String(255), nullable=False),
        sa.Column("name_en", sa.String(255), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_chambers"),
        sa.UniqueConstraint("slug", name="uq_chambers_slug"),
    )
    op.create_index("ix_chambers_slug", "chambers", ["slug"])

    op.create_table(
        "legislatures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chamber_id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("name_ca", sa.String(100), nullable=False),
        sa.Column("name_es", sa.String(100), nullable=False),
        sa.Column("name_en", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["chamber_id"], ["chambers.id"], name="fk_legislatures_chamber_id_chambers"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_legislatures"),
        sa.UniqueConstraint("chamber_id", "number", name="uq_legislature_chamber_number"),
    )
    op.create_index("ix_legislatures_chamber_id", "legislatures", ["chamber_id"])

    op.create_table(
        "persons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("given_names", sa.String(255), nullable=True),
        sa.Column("family_names", sa.String(255), nullable=True),
        sa.Column("gender", sa.String(1), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column("biography_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_persons"),
    )
    op.create_index("ix_persons_full_name", "persons", ["full_name"])

    op.create_table(
        "parliamentary_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("legislature_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name_short", sa.String(50), nullable=False),
        sa.Column("name_long", sa.String(255), nullable=False),
        sa.Column("color_hex", sa.String(7), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["legislature_id"],
            ["legislatures.id"],
            name="fk_parliamentary_groups_legislature_id_legislatures",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_parliamentary_groups"),
        sa.UniqueConstraint("legislature_id", "slug", name="uq_group_legislature_slug"),
    )
    op.create_index(
        "ix_parliamentary_groups_legislature_id", "parliamentary_groups", ["legislature_id"]
    )

    op.create_table(
        "mandates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.Integer(), nullable=False),
        sa.Column("chamber_id", sa.Integer(), nullable=False),
        sa.Column("legislature_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("constituency", sa.String(100), nullable=True),
        sa.Column("electoral_list_party", sa.String(100), nullable=True),
        sa.Column("external_id", sa.String(50), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["person_id"], ["persons.id"], name="fk_mandates_person_id_persons"
        ),
        sa.ForeignKeyConstraint(
            ["chamber_id"], ["chambers.id"], name="fk_mandates_chamber_id_chambers"
        ),
        sa.ForeignKeyConstraint(
            ["legislature_id"], ["legislatures.id"], name="fk_mandates_legislature_id_legislatures"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_mandates"),
    )
    op.create_index("ix_mandates_person_id", "mandates", ["person_id"])
    op.create_index("ix_mandates_chamber_id", "mandates", ["chamber_id"])
    op.create_index("ix_mandates_legislature_id", "mandates", ["legislature_id"])
    op.create_index("ix_mandates_external_id", "mandates", ["external_id"])

    op.create_table(
        "group_memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("mandate_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(50), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["mandate_id"], ["mandates.id"], name="fk_group_memberships_mandate_id_mandates"
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["parliamentary_groups.id"],
            name="fk_group_memberships_group_id_parliamentary_groups",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_group_memberships"),
    )
    op.create_index("ix_group_memberships_mandate_id", "group_memberships", ["mandate_id"])
    op.create_index("ix_group_memberships_group_id", "group_memberships", ["group_id"])

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name_ca", sa.String(100), nullable=False),
        sa.Column("name_es", sa.String(100), nullable=False),
        sa.Column("name_en", sa.String(100), nullable=False),
        sa.Column("color_hex", sa.String(7), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("description_ca", sa.Text(), nullable=True),
        sa.Column("description_es", sa.Text(), nullable=True),
        sa.Column("description_en", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_topics"),
        sa.UniqueConstraint("slug", name="uq_topics_slug"),
    )
    op.create_index("ix_topics_slug", "topics", ["slug"])

    op.create_table(
        "initiatives",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chamber_id", sa.Integer(), nullable=False),
        sa.Column("legislature_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("official_id", sa.String(50), nullable=False),
        sa.Column("title_original", sa.Text(), nullable=False),
        sa.Column("title_ca", sa.Text(), nullable=True),
        sa.Column("title_es", sa.Text(), nullable=True),
        sa.Column("title_en", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("submitted_at", sa.Date(), nullable=True),
        sa.Column("submitted_by", sa.String(255), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["chamber_id"], ["chambers.id"], name="fk_initiatives_chamber_id_chambers"
        ),
        sa.ForeignKeyConstraint(
            ["legislature_id"],
            ["legislatures.id"],
            name="fk_initiatives_legislature_id_legislatures",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_initiatives"),
        sa.UniqueConstraint("chamber_id", "official_id", name="uq_initiative_chamber_official_id"),
    )
    op.create_index("ix_initiatives_chamber_id", "initiatives", ["chamber_id"])
    op.create_index("ix_initiatives_legislature_id", "initiatives", ["legislature_id"])
    op.create_index("ix_initiatives_type", "initiatives", ["type"])
    op.create_index("ix_initiatives_official_id", "initiatives", ["official_id"])
    op.create_index("ix_initiatives_status", "initiatives", ["status"])

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chamber_id", sa.Integer(), nullable=False),
        sa.Column("legislature_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", sa.String(50), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("recording_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["chamber_id"], ["chambers.id"], name="fk_sessions_chamber_id_chambers"
        ),
        sa.ForeignKeyConstraint(
            ["legislature_id"], ["legislatures.id"], name="fk_sessions_legislature_id_legislatures"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
    )
    op.create_index("ix_sessions_chamber_id", "sessions", ["chamber_id"])
    op.create_index("ix_sessions_legislature_id", "sessions", ["legislature_id"])
    op.create_index("ix_sessions_date", "sessions", ["date"])

    op.create_table(
        "votes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("initiative_id", sa.Integer(), nullable=True),
        sa.Column("sequence_in_session", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("voted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("ayes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("noes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("abstentions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("absent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_votes_session_id_sessions"
        ),
        sa.ForeignKeyConstraint(
            ["initiative_id"], ["initiatives.id"], name="fk_votes_initiative_id_initiatives"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_votes"),
    )
    op.create_index("ix_votes_session_id", "votes", ["session_id"])
    op.create_index("ix_votes_initiative_id", "votes", ["initiative_id"])
    op.create_index("ix_votes_voted_at", "votes", ["voted_at"])
    op.create_index("ix_votes_result", "votes", ["result"])
    op.create_index("ix_votes_external_id", "votes", ["external_id"])

    op.create_table(
        "initiative_topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("initiative_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("classified_by", sa.String(50), nullable=False),
        sa.Column("classified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["initiative_id"],
            ["initiatives.id"],
            name="fk_initiative_topics_initiative_id_initiatives",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"], ["topics.id"], name="fk_initiative_topics_topic_id_topics"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_initiative_topics"),
        sa.UniqueConstraint("initiative_id", "topic_id", name="uq_initiative_topic"),
    )
    op.create_index("ix_initiative_topics_initiative_id", "initiative_topics", ["initiative_id"])
    op.create_index("ix_initiative_topics_topic_id", "initiative_topics", ["topic_id"])

    op.create_table(
        "vote_records",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("vote_id", sa.Integer(), nullable=False),
        sa.Column("mandate_id", sa.Integer(), nullable=False),
        sa.Column("choice", sa.String(20), nullable=False),
        sa.Column("group_id_at_time", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["vote_id"], ["votes.id"], name="fk_vote_records_vote_id_votes"),
        sa.ForeignKeyConstraint(
            ["mandate_id"], ["mandates.id"], name="fk_vote_records_mandate_id_mandates"
        ),
        sa.ForeignKeyConstraint(
            ["group_id_at_time"],
            ["parliamentary_groups.id"],
            name="fk_vote_records_group_id_at_time_parliamentary_groups",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_vote_records"),
        sa.UniqueConstraint("vote_id", "mandate_id", name="uq_vote_record"),
    )
    op.create_index("ix_vote_records_vote_id", "vote_records", ["vote_id"])
    op.create_index("ix_vote_records_mandate_id", "vote_records", ["mandate_id"])
    op.create_index("ix_vote_records_choice", "vote_records", ["choice"])
    op.create_index("ix_vote_records_group_id_at_time", "vote_records", ["group_id_at_time"])

    op.create_table(
        "alert_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(2), nullable=False, server_default="ca"),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("confirmation_token", sa.String(64), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_alert_subscriptions"),
        sa.UniqueConstraint("confirmation_token", name="uq_alert_subscriptions_confirmation_token"),
    )
    op.create_index("ix_alert_subscriptions_email", "alert_subscriptions", ["email"])

    op.create_table(
        "newsletter_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("language", sa.String(2), nullable=False, server_default="ca"),
        sa.Column("confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("confirmation_token", sa.String(64), nullable=True),
        sa.Column("listmonk_id", sa.Integer(), nullable=True),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_newsletter_subscriptions"),
        sa.UniqueConstraint("email", name="uq_newsletter_subscriptions_email"),
        sa.UniqueConstraint(
            "confirmation_token", name="uq_newsletter_subscriptions_confirmation_token"
        ),
    )
    op.create_index("ix_newsletter_subscriptions_email", "newsletter_subscriptions", ["email"])


def downgrade() -> None:
    op.drop_index("ix_newsletter_subscriptions_email", table_name="newsletter_subscriptions")
    op.drop_table("newsletter_subscriptions")
    op.drop_index("ix_alert_subscriptions_email", table_name="alert_subscriptions")
    op.drop_table("alert_subscriptions")
    op.drop_index("ix_vote_records_group_id_at_time", table_name="vote_records")
    op.drop_index("ix_vote_records_choice", table_name="vote_records")
    op.drop_index("ix_vote_records_mandate_id", table_name="vote_records")
    op.drop_index("ix_vote_records_vote_id", table_name="vote_records")
    op.drop_table("vote_records")
    op.drop_index("ix_initiative_topics_topic_id", table_name="initiative_topics")
    op.drop_index("ix_initiative_topics_initiative_id", table_name="initiative_topics")
    op.drop_table("initiative_topics")
    op.drop_index("ix_votes_external_id", table_name="votes")
    op.drop_index("ix_votes_result", table_name="votes")
    op.drop_index("ix_votes_voted_at", table_name="votes")
    op.drop_index("ix_votes_initiative_id", table_name="votes")
    op.drop_index("ix_votes_session_id", table_name="votes")
    op.drop_table("votes")
    op.drop_index("ix_sessions_date", table_name="sessions")
    op.drop_index("ix_sessions_legislature_id", table_name="sessions")
    op.drop_index("ix_sessions_chamber_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_initiatives_status", table_name="initiatives")
    op.drop_index("ix_initiatives_official_id", table_name="initiatives")
    op.drop_index("ix_initiatives_type", table_name="initiatives")
    op.drop_index("ix_initiatives_legislature_id", table_name="initiatives")
    op.drop_index("ix_initiatives_chamber_id", table_name="initiatives")
    op.drop_table("initiatives")
    op.drop_index("ix_topics_slug", table_name="topics")
    op.drop_table("topics")
    op.drop_index("ix_group_memberships_group_id", table_name="group_memberships")
    op.drop_index("ix_group_memberships_mandate_id", table_name="group_memberships")
    op.drop_table("group_memberships")
    op.drop_index("ix_mandates_external_id", table_name="mandates")
    op.drop_index("ix_mandates_legislature_id", table_name="mandates")
    op.drop_index("ix_mandates_chamber_id", table_name="mandates")
    op.drop_index("ix_mandates_person_id", table_name="mandates")
    op.drop_table("mandates")
    op.drop_index("ix_parliamentary_groups_legislature_id", table_name="parliamentary_groups")
    op.drop_table("parliamentary_groups")
    op.drop_index("ix_persons_full_name", table_name="persons")
    op.drop_table("persons")
    op.drop_index("ix_legislatures_chamber_id", table_name="legislatures")
    op.drop_table("legislatures")
    op.drop_index("ix_chambers_slug", table_name="chambers")
    op.drop_table("chambers")
