"""add votes.graphic_url for the seat-map PNG rendered by the portal

Each vote on the public listing carries an ``<img>`` with the deputies
plotted in the hemicycle (green = Sí, red = No, yellow = Abstención). The
PNG is also bundled in the per-session ZIP. Storing the absolute URL lets
the frontend lazy-load the official asset directly; if the portal ever
changes the URL scheme we'll re-ingest.

Revision ID: 0005_vote_graphic_url
Revises: 0004_vote_expediente
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_vote_graphic_url"
down_revision: Union[str, None] = "0004_vote_expediente"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "votes",
        sa.Column("graphic_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("votes", "graphic_url")
