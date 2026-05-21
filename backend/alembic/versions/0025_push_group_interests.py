"""push_group_interests — let push subscribers follow parliamentary groups.

Parallel to ``push_topic_interests`` (added with the original push
schema) but keyed on ``parliamentary_groups`` instead. A subscriber
can follow any combination of topics + groups; the fan-out logic
treats the two as additive (a notification fires when at least one
followed interest matches the vote / initiative).

Why a separate table rather than a polymorphic 'interest' table:
- Each side is keyed by a different FK, so a polymorphic design
  would need either NULLable FKs (lose integrity) or a 'kind' enum
  with a sentinel id column (defeats the point of FKs). The
  parallel-table approach keeps both sides referentially clean.
- The query pattern is symmetric: we union the two interest sets at
  fan-out time. The cost of one extra table is trivial.

Revision ID: 0025_push_group_interests
Revises: 0024_boe_in_force
Create Date: 2026-05-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025_push_group_interests"
down_revision: str | None = "0024_boe_in_force"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_group_interests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "subscription_id",
            sa.Integer(),
            sa.ForeignKey("push_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("parliamentary_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
        sa.UniqueConstraint("subscription_id", "group_id", name="uq_push_group_interest"),
    )
    op.create_index(
        "ix_push_group_interests_subscription_id",
        "push_group_interests",
        ["subscription_id"],
    )
    op.create_index(
        "ix_push_group_interests_group_id",
        "push_group_interests",
        ["group_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_push_group_interests_group_id", table_name="push_group_interests")
    op.drop_index("ix_push_group_interests_subscription_id", table_name="push_group_interests")
    op.drop_table("push_group_interests")
