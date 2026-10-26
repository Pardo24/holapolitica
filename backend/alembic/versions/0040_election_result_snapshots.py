"""election result snapshots: the Congress count as it advances.

One row per moment of the count (app/services/election_results.py); the
2023 election as a replay of its night, the 29-N one from the ministry's
feed. See app/models ``ElectionResultSnapshot``.

Purely additive.

Revision ID: 0040_election_result_snapshots
Revises: 0039_vote_records_group_index
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0040_election_result_snapshots"
down_revision: str | None = "0039_vote_records_group_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "election_result_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election", sa.String(16), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("official", sa.Boolean(), nullable=False),
        sa.Column("counted_pct", sa.Float(), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("election", "step", name="uq_result_snapshot_step"),
    )
    op.create_index(
        "ix_election_result_snapshots_election", "election_result_snapshots", ["election"]
    )


def downgrade() -> None:
    op.drop_index("ix_election_result_snapshots_election", table_name="election_result_snapshots")
    op.drop_table("election_result_snapshots")
