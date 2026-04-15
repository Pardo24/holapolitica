"""widen initiatives.submitted_by from VARCHAR(255) to TEXT

Some Proposiciones de Ley list every co-signer's name and group as the AUTOR
field, exceeding 255 characters. Storing the full list is the only way to
preserve the data without losing co-authors, so we widen the column.

Revision ID: 0003_initiative_submitted_by_to_text
Revises: 0002_seed
Create Date: 2026-05-08 06:20:00
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_widen_submitted_by"
down_revision: Union[str, None] = "0002_seed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "initiatives",
        "submitted_by",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "initiatives",
        "submitted_by",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
