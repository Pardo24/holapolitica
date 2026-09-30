"""add plain_title_ca / plain_title_es to initiatives and votes.

One field was doing two jobs. The plain summary is what a card shows as its
headline AND what the detail page shows as the explanation, and those want
different text: a headline has to stand alone in one line, while the
explanation of a motion that asks for eight things wants to enumerate them.
More than half the summaries are such lists, so half the cards were headlined
"Demana al Govern que: 1. Obligui… 2. Simplifiqui…".

The title is generated in the SAME call as the summary: the input text
dominates the cost (2.7k tokens for a full bill against ~30 for the extra
line), so a second call would double the expensive half for nothing.

Nullable, so every existing row keeps working: the frontend falls back to
deriving a headline from the summary until the row is regenerated.

Revision ID: 0032_plain_title
Revises: 0031_manifesto_points
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0032_plain_title"
down_revision: str | None = "0031_manifesto_points"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("initiatives", "votes"):
        op.add_column(table, sa.Column("plain_title_ca", sa.Text(), nullable=True))
        op.add_column(table, sa.Column("plain_title_es", sa.Text(), nullable=True))


def downgrade() -> None:
    for table in ("initiatives", "votes"):
        op.drop_column(table, "plain_title_es")
        op.drop_column(table, "plain_title_ca")
