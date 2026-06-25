"""add daily_answer_counts.

Aggregate tallies for "la pregunta del dia": one row per
(question_key, option_index) with an incrementing ``count``. No per-user rows,
no PII — just counters so the daily question can show what share of people
picked each option.

Revision ID: 0029_daily_answer_counts
Revises: 0028_vote_approved_by_assent
Create Date: 2026-06-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0029_daily_answer_counts"
down_revision: str | None = "0028_vote_approved_by_assent"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_answer_counts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_key", sa.String(length=64), nullable=False),
        sa.Column("option_index", sa.Integer(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_answer_counts")),
        sa.UniqueConstraint("question_key", "option_index", name="uq_daily_answer_question_option"),
    )
    op.create_index(
        op.f("ix_daily_answer_counts_question_key"),
        "daily_answer_counts",
        ["question_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_daily_answer_counts_question_key"), table_name="daily_answer_counts")
    op.drop_table("daily_answer_counts")
