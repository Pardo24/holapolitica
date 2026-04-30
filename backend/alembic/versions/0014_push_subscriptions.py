"""add push_subscriptions and push_topic_interests for Web Push notifications

Introduces the two tables backing the Web Push channel:

- ``push_subscriptions``: one row per browser endpoint with the ECDH
  parameters (``p256dh``, ``auth``) the Web Push protocol needs to
  encrypt the payload. ``failed_send_count`` tracks consecutive
  transient failures; the service deletes the row on 404/410
  (subscription has expired upstream).
- ``push_topic_interests``: many-to-many between subscriptions and
  ``topics``. A subscription with zero interests is valid but
  receives no fan-out — it just keeps the device registered.

The push channel is intentionally pseudonymous: the browser-issued
``endpoint`` URL is the only identifier — no email, no account. This
mirrors how the W3C Push API was designed and keeps the GDPR
attack-surface narrow.

Revision ID: 0014_push_subscriptions
Revises: 0013_vote_plain_summary
Create Date: 2026-05-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_push_subscriptions"
down_revision: Union[str, None] = "0013_vote_plain_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "failed_send_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("endpoint", name="uq_push_subscription_endpoint"),
    )
    op.create_index(
        "ix_push_subscriptions_endpoint",
        "push_subscriptions",
        ["endpoint"],
        unique=False,
    )

    op.create_table(
        "push_topic_interests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subscription_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["push_subscriptions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("subscription_id", "topic_id", name="uq_push_topic_interest"),
    )
    op.create_index(
        "ix_push_topic_interests_subscription_id",
        "push_topic_interests",
        ["subscription_id"],
        unique=False,
    )
    op.create_index(
        "ix_push_topic_interests_topic_id",
        "push_topic_interests",
        ["topic_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_push_topic_interests_topic_id", table_name="push_topic_interests")
    op.drop_index(
        "ix_push_topic_interests_subscription_id",
        table_name="push_topic_interests",
    )
    op.drop_table("push_topic_interests")
    op.drop_index("ix_push_subscriptions_endpoint", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
