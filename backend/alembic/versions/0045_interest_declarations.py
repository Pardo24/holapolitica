"""interest declarations: deputies' economic interests and activities register.

The two documents on each deputy's ficha besides the assets declaration. See
app/ingest/congreso/interests.py.

Purely additive.

Revision ID: 0045_interest_declarations
Revises: 0044_asset_income_sources
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0045_interest_declarations"
down_revision: str | None = "0044_asset_income_sources"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "interest_declarations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "person_id",
            sa.Integer,
            sa.ForeignKey("persons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("legislature", sa.Integer, nullable=False),
        sa.Column("sequence", sa.Integer),
        sa.Column("declared_on", sa.Date),
        sa.Column("pdf_url", sa.String(300), nullable=False, unique=True),
        sa.Column("pdf_sha256", sa.String(64)),
        sa.Column("parse_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("data", postgresql.JSONB),
        sa.Column("problems", sa.JSON),
        sa.Column("ocr_text", sa.Text),
        sa.Column("model", sa.String(64)),
        sa.Column("parsed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_interest_declarations_person_id", "interest_declarations", ["person_id"])
    op.create_index(
        "ix_interest_declarations_parse_status", "interest_declarations", ["parse_status"]
    )


def downgrade() -> None:
    op.drop_table("interest_declarations")
