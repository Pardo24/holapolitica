"""add votes.expediente_raw to preserve linking even when no initiative exists yet

The Congreso vote XML does not include the initiative's NUMEXPEDIENTE — only a
free-text title and description. The expediente is rendered on the public
votes listing HTML as ``(Núm. expte. NNN/NNNNNN)``, which we now scrape. We
store it on the vote even when we can't currently resolve it to an Initiative
row (e.g. PNL and Mociones are not in the iniciativas opendata feed yet), so
a later backfill can link them without re-scraping the source.

Revision ID: 0004_vote_expediente
Revises: 0003_widen_submitted_by
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_vote_expediente"
down_revision: Union[str, None] = "0003_widen_submitted_by"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "votes",
        sa.Column("expediente_raw", sa.String(length=50), nullable=True),
    )
    op.create_index(
        "ix_votes_expediente_raw",
        "votes",
        ["expediente_raw"],
    )


def downgrade() -> None:
    op.drop_index("ix_votes_expediente_raw", table_name="votes")
    op.drop_column("votes", "expediente_raw")
