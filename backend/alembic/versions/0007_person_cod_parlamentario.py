"""add persons.cod_parlamentario for the Congreso's stable deputy ID

The Congreso website uses a numeric ``codParlamentario`` to identify each
deputy across the website (search results, ficha pages, photos). The
open-data feed does NOT expose it, so we discover it via a one-shot scrape
of the photo URL pattern ``/docu/imgweb/diputados/{N}_15.jpg`` and the
ficha page. Storing the code lets us link out to the official ficha and
construct photo URLs without re-scraping.

Stability across legislatures is unverified — see notes in
``docs/research-similar-projects.md``. We treat it as a per-legislature ID
for now and re-discover on each legislature.

Revision ID: 0007_person_cod
Revises: 0006_group_colors
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_person_cod"
down_revision: Union[str, None] = "0006_group_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "persons",
        sa.Column("cod_parlamentario", sa.Integer(), nullable=True),
    )
    op.create_index("ix_persons_cod_parlamentario", "persons", ["cod_parlamentario"])


def downgrade() -> None:
    op.drop_index("ix_persons_cod_parlamentario", table_name="persons")
    op.drop_column("persons", "cod_parlamentario")
