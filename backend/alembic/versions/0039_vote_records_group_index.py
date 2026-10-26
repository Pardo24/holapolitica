"""vote_records: covering index for a group's majority on a vote.

app/services/group_majority.py tallies each group's choices on a deputy's
votes with one GROUP BY; this index answers it without reading the table.
Created on production by hand first (2026-10-26), hence IF NOT EXISTS.

Purely additive.

Revision ID: 0039_vote_records_group_index
Revises: 0038_election_candidacies
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0039_vote_records_group_index"
down_revision: str | None = "0038_election_candidacies"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_vote_records_vote_group_choice "
        "ON vote_records (vote_id, group_id_at_time) INCLUDE (choice)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_vote_records_vote_group_choice")
