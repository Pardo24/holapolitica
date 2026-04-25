"""add initiatives.plain_summary for the LLM-generated plain-language explainer

The portal text of an initiative is legalese (``"Proposición de Ley
Orgánica de modificación de la Ley Orgánica 6/1985..."``). To make the
project useful for non-lawyers, we generate a 2-3 sentence
plain-language explanation. We store it on the initiative row so:

- it's served instantly without a per-page LLM call,
- it's editable later (a human can override the auto version),
- the source provider + generation date are auditable.

Editorial guarantee: the generator's prompt forbids value judgments and
the test suite asserts banned terms never appear in the output. If the
LLM cannot summarise without editorialising, we record ``NULL`` and
surface the legal text alone.

Revision ID: 0010_plain_summary
Revises: 0009_vote_government
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_plain_summary"
down_revision: Union[str, None] = "0009_vote_government"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("initiatives", sa.Column("plain_summary", sa.Text(), nullable=True))
    op.add_column(
        "initiatives",
        sa.Column("plain_summary_provider", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "initiatives",
        sa.Column(
            "plain_summary_generated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "plain_summary_generated_at")
    op.drop_column("initiatives", "plain_summary_provider")
    op.drop_column("initiatives", "plain_summary")
