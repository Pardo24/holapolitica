"""add votes.approved_by_assent.

"Votación por asentimiento" (approval by assent / acclamation) carries no
numeric tally and no per-deputy roll-call in the Congreso vote XML — only an
<Asentimiento> marker. These recur across every legislature (and broke the
historical backfill, which required <Presentes>). The column lets the importer
record the outcome and the UI render "approved by assent" instead of a
misleading 0-0-0 count. Additive, defaults False; existing rows are all
counted votes.

Revision ID: 0028_vote_approved_by_assent
Revises: 0027_widen_group_slug
Create Date: 2026-06-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0028_vote_approved_by_assent"
down_revision: str | None = "0027_widen_group_slug"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "votes",
        sa.Column(
            "approved_by_assent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Drop the server default once existing rows are backfilled — the ORM
    # supplies the value on every insert from here on.
    op.alter_column("votes", "approved_by_assent", server_default=None)


def downgrade() -> None:
    op.drop_column("votes", "approved_by_assent")
