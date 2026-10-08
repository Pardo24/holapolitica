"""profile effects: which everyday situations a law touches, and how.

For "I a tu, què t'afecta?": ``profile_effects`` holds
{profile_key: {"ca": str, "es": str}}, one sentence per situation the law
applies to directly (young, renting, self-employed…), saying what the text
establishes for it. An empty object means the law was read and touches
none directly; NULL means it has not been read yet. See
app/services/law_profiles.py.

Purely additive.

Revision ID: 0035_profile_effects
Revises: 0034_law_text_analysis
Create Date: 2026-10-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035_profile_effects"
down_revision: str | None = "0034_law_text_analysis"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("initiatives", sa.Column("profile_effects", sa.JSON(), nullable=True))
    op.add_column(
        "initiatives",
        sa.Column("profile_effects_generated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "profile_effects_generated_at")
    op.drop_column("initiatives", "profile_effects")
