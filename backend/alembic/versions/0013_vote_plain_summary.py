"""add votes.plain_summary_{ca,es} columns for votes without initiatives

A non-trivial fraction of plenary votes is **not** linked to an
``Initiative`` row (PNL on the schedule of a session, mociones,
constitutional reform debates, ad-hoc procedural votes…). Today the
``votes`` API serves ``plain_summary_ca/es`` by joining through the
linked initiative, so those orphan votes always come back ``NULL``.

This migration mirrors the per-language layout already used on
``initiatives`` (see migration ``0011_plain_summary_lang``):

- ``plain_summary_ca`` and ``plain_summary_es`` for the localised
  text (NULL until the LLM step generates it; NULL is also the
  honest answer when the model returns ``[INSUFICIENT]`` or its
  output is rejected by the editorial guardrail);
- a single ``plain_summary_provider`` recording the model name of
  the most recent successful generation;
- ``plain_summary_generated_at`` for auditability.

The Initiative-side columns stay untouched; the API layer prefers
the vote-side fields when populated and falls back to the linked
initiative when not, so existing data remains correct.

Revision ID: 0013_vote_plain_summary
Revises: 0012_scheduled_sessions
Create Date: 2026-05-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_vote_plain_summary"
down_revision: Union[str, None] = "0012_scheduled_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("votes", sa.Column("plain_summary_ca", sa.Text(), nullable=True))
    op.add_column("votes", sa.Column("plain_summary_es", sa.Text(), nullable=True))
    op.add_column(
        "votes",
        sa.Column("plain_summary_provider", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "votes",
        sa.Column(
            "plain_summary_generated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("votes", "plain_summary_generated_at")
    op.drop_column("votes", "plain_summary_provider")
    op.drop_column("votes", "plain_summary_es")
    op.drop_column("votes", "plain_summary_ca")
