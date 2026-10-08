"""law text analysis: what the bill's text says, and what it changes.

The plain summary is written from the title and the short "object" of an
initiative, and many titles say little about what a law does. These
columns hold a reading of the bill's own text (the BOCG PDF, as tabled):

- ``text_points``: {"ca": [...], "es": [...]}, each item
  {"text": str, "ref": str | null}: the concrete measures, in plain words,
  with the article they come from.
- ``change_tags``: symmetric facts about what the text changes, as slugs
  (tax_up / tax_down, rights_expand / rights_restrict, env_strengthen /
  env_relax, public_more / private_more). A tag is only set when the text
  does it explicitly.
- ``change_evidence``: {"ca": {tag: str}, "es": {tag: str}}, the passage
  that justifies each tag, so a reader can check it.
- ``text_analysis_source``: "full" when the whole text was read,
  "partial" when it was too long and only the start (the explanatory
  statement and first articles) was.

Purely additive; NULL until the analysis job has run.

Revision ID: 0034_law_text_analysis
Revises: 0033_push_initiative_interests
Create Date: 2026-10-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034_law_text_analysis"
down_revision: str | None = "0033_push_initiative_interests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("initiatives", sa.Column("text_points", sa.JSON(), nullable=True))
    op.add_column("initiatives", sa.Column("change_tags", sa.JSON(), nullable=True))
    op.add_column("initiatives", sa.Column("change_evidence", sa.JSON(), nullable=True))
    op.add_column("initiatives", sa.Column("text_analysis_source", sa.String(16), nullable=True))
    op.add_column("initiatives", sa.Column("text_analysis_provider", sa.String(64), nullable=True))
    op.add_column(
        "initiatives",
        sa.Column("text_analysis_generated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    for col in (
        "text_analysis_generated_at",
        "text_analysis_provider",
        "text_analysis_source",
        "change_evidence",
        "change_tags",
        "text_points",
    ):
        op.drop_column("initiatives", col)
