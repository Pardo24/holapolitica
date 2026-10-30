"""asset income sources: who pays each income concept on a declaration.

One row per concept as deputies wrote it, so a re-read of a declaration keeps
the classification and a human can correct a row. See
app/ingest/congreso/assets.py.

Purely additive.

Revision ID: 0043_asset_income_sources
Revises: 0042_asset_declarations
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0043_asset_income_sources"
down_revision: str | None = "0042_asset_declarations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "asset_income_sources",
        sa.Column("concept", sa.String(500), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("classified_by", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )


def downgrade() -> None:
    op.drop_table("asset_income_sources")
