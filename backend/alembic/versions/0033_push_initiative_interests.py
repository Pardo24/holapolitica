"""follow one law: push_initiative_interests.

The push channel already lets a reader follow a TOPIC or a GROUP. The thing
people actually ask about is narrower and more human: "tell me how this one
law ends". A bill is voted several times over months, and the only way to
know how it finished was to come back and look.

Same shape as push_topic_interests / push_group_interests, so the fan-out
that already runs after every vote ingest only needs one more join. Nothing
existing changes: a row here is purely additive.

Revision ID: 0033_push_initiative_interests
Revises: 0032_plain_title
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0033_push_initiative_interests"
down_revision: str | None = "0032_plain_title"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_initiative_interests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("initiative_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["subscription_id"], ["push_subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["initiative_id"], ["initiatives.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscription_id", "initiative_id", name="uq_push_initiative_interest"),
    )
    op.create_index(
        "ix_push_initiative_interests_subscription_id",
        "push_initiative_interests",
        ["subscription_id"],
    )
    op.create_index(
        "ix_push_initiative_interests_initiative_id",
        "push_initiative_interests",
        ["initiative_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_push_initiative_interests_initiative_id", "push_initiative_interests")
    op.drop_index("ix_push_initiative_interests_subscription_id", "push_initiative_interests")
    op.drop_table("push_initiative_interests")
