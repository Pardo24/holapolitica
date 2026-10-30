"""debate quotes: one verbatim passage per group from the plenary's Diario de Sesiones.

One row per speech read, with ``quote`` NULL when nothing usable came out, so
it is not paid for twice. See app/ingest/congreso/debate_quotes.py.

Purely additive.

Revision ID: 0043_debate_quotes
Revises: 0042_asset_declarations
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0043_debate_quotes"
down_revision: str | None = "0042_asset_declarations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "debate_quotes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("expediente", sa.String(20), nullable=False),
        sa.Column("debate_date", sa.Date(), nullable=False),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("parliamentary_groups.id"),
            nullable=False,
        ),
        sa.Column("speaker_name", sa.String(160), nullable=False),
        sa.Column("dscd_ref", sa.String(32), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("source_url", sa.String(300), nullable=False),
        sa.Column("phase", sa.String(120), nullable=True),
        sa.Column("quote", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "expediente",
            "debate_date",
            "group_id",
            "speaker_name",
            name="uq_debate_quote_speech",
        ),
    )
    op.create_index(
        "ix_debate_quotes_expediente_date", "debate_quotes", ["expediente", "debate_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_debate_quotes_expediente_date", table_name="debate_quotes")
    op.drop_table("debate_quotes")
