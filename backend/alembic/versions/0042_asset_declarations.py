"""asset declarations: deputies' "Declaración de Bienes y Rentas".

One row per declaration PDF on a deputy's Congreso ficha, with what we
read from the scan. See app/ingest/congreso/assets.py.

Purely additive.

Revision ID: 0042_asset_declarations
Revises: 0041_topic_low_confidence
Create Date: 2026-10-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0042_asset_declarations"
down_revision: str | None = "0041_topic_low_confidence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "asset_declarations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "person_id",
            sa.Integer(),
            sa.ForeignKey("persons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("legislature", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("declared_on", sa.Date(), nullable=False),
        sa.Column("pdf_url", sa.String(300), nullable=False),
        sa.Column("parse_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("data", postgresql.JSONB(), nullable=True),
        sa.Column("problems", sa.JSON(), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column("parsed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("pdf_url", name="uq_asset_declarations_pdf_url"),
    )
    op.create_index("ix_asset_declarations_person_id", "asset_declarations", ["person_id"])
    op.create_index("ix_asset_declarations_parse_status", "asset_declarations", ["parse_status"])


def downgrade() -> None:
    op.drop_index("ix_asset_declarations_parse_status", table_name="asset_declarations")
    op.drop_index("ix_asset_declarations_person_id", table_name="asset_declarations")
    op.drop_table("asset_declarations")
