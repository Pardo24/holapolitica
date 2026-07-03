"""add initiatives.affected_audiences.

LLM-extracted "who does this directly affect" tags for an initiative,
stored as JSON ``{"ca": ["llogaters", ...], "es": ["inquilinos", ...]}``
(max ~4 short audience tags per locale). NULL until the extraction job
has processed the row; ``{"ca": [], "es": []}`` when the model could
not name a concrete audience (so the job doesn't retry forever).

Revision ID: 0030_initiative_affected_audiences
Revises: 0029_daily_answer_counts
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0030_initiative_affected_audiences"
down_revision: str | None = "0029_daily_answer_counts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "initiatives",
        sa.Column("affected_audiences", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "affected_audiences")
