"""add manifesto_points.

Literal, page-referenced commitments extracted from party electoral
manifestos, mapped to our theme taxonomy. The "Programa vs. voto"
surface joins these quotes with the group's factual voting record on
the same topic — quotes only, no fulfilment verdicts (see
``app/ingest/manifestos.py`` for the neutrality contract).

Revision ID: 0031_manifesto_points
Revises: 0030_affected_audiences
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0031_manifesto_points"
down_revision: str | None = "0030_affected_audiences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "manifesto_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_slug", sa.String(length=64), nullable=False),
        sa.Column("election", sa.String(length=16), nullable=False),
        sa.Column("topic_slug", sa.String(length=64), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_manifesto_points_group_topic",
        "manifesto_points",
        ["group_slug", "topic_slug"],
    )
    op.create_index("ix_manifesto_points_election", "manifesto_points", ["election"])


def downgrade() -> None:
    op.drop_index("ix_manifesto_points_election", table_name="manifesto_points")
    op.drop_index("ix_manifesto_points_group_topic", table_name="manifesto_points")
    op.drop_table("manifesto_points")
