"""election candidacies: the Congress lists of the 29 November 2026 election.

One row per list and constituency, as presented and as proclaimed in the
BOE. See app/ingest/candidacies.py.

Purely additive.

Revision ID: 0038_election_candidacies
Revises: 0037_api_keys
Create Date: 2026-10-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0038_election_candidacies"
down_revision: str | None = "0037_api_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "election_candidacies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election", sa.String(16), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("constituency", sa.String(100), nullable=False),
        sa.Column("ballot_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("acronym", sa.String(120), nullable=True),
        sa.Column("candidates", sa.JSON(), nullable=False),
        sa.Column("substitutes", sa.JSON(), nullable=False),
        sa.Column("boe_id", sa.String(32), nullable=False),
        sa.Column("published_on", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "election", "stage", "constituency", "ballot_order", name="uq_candidacy_list"
        ),
    )
    op.create_index("ix_election_candidacies_election", "election_candidacies", ["election"])
    op.create_index(
        "ix_election_candidacies_constituency", "election_candidacies", ["constituency"]
    )


def downgrade() -> None:
    op.drop_index("ix_election_candidacies_constituency", table_name="election_candidacies")
    op.drop_index("ix_election_candidacies_election", table_name="election_candidacies")
    op.drop_table("election_candidacies")
