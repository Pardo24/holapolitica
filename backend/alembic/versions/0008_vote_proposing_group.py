"""denormalize the proposing parliamentary group on each vote

We resolve "which group proposed this vote" at API time today via a
substring match on ``votes.description``. That works for individual fetches
but is impossible to filter on efficiently — every list query would have
to LIKE-match against every group's name. Storing the resolved group id
makes ``GET /votes?proposing_group_slug=gp-vox`` a one-line WHERE clause.

We backfill the column in the same migration by re-running the matcher.
The column stays nullable: government bills, multi-group co-signed
initiatives and decree-laws don't name a group in the description.

Revision ID: 0008_vote_proposing_group
Revises: 0007_person_cod
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_vote_proposing_group"
down_revision: Union[str, None] = "0007_person_cod"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "votes",
        sa.Column(
            "proposing_group_id",
            sa.Integer(),
            sa.ForeignKey("parliamentary_groups.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_votes_proposing_group_id", "votes", ["proposing_group_id"])

    # Backfill: substring match name_long inside description, longest match wins.
    bind = op.get_bind()
    bind.execute(sa.text("""
            UPDATE votes v
            SET proposing_group_id = (
                SELECT g.id
                FROM parliamentary_groups g
                WHERE g.name_long IS NOT NULL
                  AND v.description IS NOT NULL
                  AND v.description LIKE '%' || g.name_long || '%'
                ORDER BY length(g.name_long) DESC
                LIMIT 1
            )
            WHERE v.description IS NOT NULL
              AND v.proposing_group_id IS NULL
            """))


def downgrade() -> None:
    op.drop_index("ix_votes_proposing_group_id", table_name="votes")
    op.drop_column("votes", "proposing_group_id")
