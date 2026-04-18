"""mark votes proposed by the Government (not a parliamentary group)

Spanish parliamentary instruments split into:

- **Group instruments** — PNL, Moción. Proposed by a parliamentary group;
  we resolve those into ``votes.proposing_group_id``.
- **Government instruments** — Proyectos de Ley (government bills) and
  RDL convalidations (the chamber ratifying a Real Decreto-ley issued by
  the cabinet). The proposer is the Government, not a parliamentary
  group, so ``proposing_group_id`` stays NULL on those.

To let users filter by "Govern" alongside the parliamentary groups, we
denormalize a boolean. Backfill rules:

- ``title ILIKE 'Convalidación%'`` — RDL ratifications (always government).
- ``title ILIKE 'Proyecto de Ley%'`` — explicit government bills.
- ``description ILIKE '%del Gobierno%'`` AND ``proposing_group_id IS NULL``
  — defensive fallback for descriptions that name the proposer
  explicitly.

This is a pragmatic, auditable rule. The CLAUDE.md neutrality stance
applies: "Govern" is treated as one entity among the proposers, no
preferential framing.

Revision ID: 0009_vote_government
Revises: 0008_vote_proposing_group
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_vote_government"
down_revision: Union[str, None] = "0008_vote_proposing_group"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "votes",
        sa.Column(
            "proposed_by_government",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_votes_proposed_by_government",
        "votes",
        ["proposed_by_government"],
    )

    bind = op.get_bind()
    bind.execute(sa.text("""
            UPDATE votes
            SET proposed_by_government = TRUE
            WHERE
                title ILIKE 'Convalidación%'
                OR title ILIKE 'Proyecto de Ley%'
                OR (
                    proposing_group_id IS NULL
                    AND description ILIKE '%del Gobierno%'
                )
            """))


def downgrade() -> None:
    op.drop_index("ix_votes_proposed_by_government", table_name="votes")
    op.drop_column("votes", "proposed_by_government")
