"""split initiatives.plain_summary into per-language columns

The first version stored a single Catalan summary in ``plain_summary``.
We now want per-language copies (matching the existing ``name_ca/es/en``
pattern on Topic, Initiative, etc.) so each locale can render the
appropriate text.

This migration:

- renames the existing ``plain_summary`` column to ``plain_summary_ca``
  (keeping all the data we already generated);
- adds an empty ``plain_summary_es`` column;
- keeps the single ``plain_summary_provider`` /
  ``plain_summary_generated_at`` pair as the metadata of the most recent
  generation (we don't audit each language independently — they're
  generated from the same text by the same provider).

English is not added yet; do so in a follow-up migration when we wire
``plain_summaries_en``.

Revision ID: 0011_plain_summary_lang
Revises: 0010_plain_summary
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_plain_summary_lang"
down_revision: Union[str, None] = "0010_plain_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("initiatives", "plain_summary", new_column_name="plain_summary_ca")
    op.add_column(
        "initiatives",
        sa.Column("plain_summary_es", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "plain_summary_es")
    op.alter_column("initiatives", "plain_summary_ca", new_column_name="plain_summary")
