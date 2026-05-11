"""add persons.seat_x / seat_y for the hemicycle seat layout

The Congreso publishes the official interactive seat map at
``https://www.congreso.es/ca/hemiciclo`` as a static PNG with an HTML
image-map overlay. Each ``<area shape="circle" coords="x,y,r">`` carries
the seat's pixel coordinates on the 536×393 image and a
``getUrlFichaDiputado(codParlamentario, …)`` href that ties the seat to
a specific deputy.

We store the raw image-space pixels (relative to the natural 536×393
image) on :class:`Person`. The frontend remaps them into its own SVG
viewBox at render time, so a future redesign of the source image can be
absorbed by re-running the ingest without touching the UI.

Why ``(x, y)`` and not ``(row, column)``: the real chamber is not a
clean grid. The Mesa del Congreso sits in a front-row hemicycle, the
Banco Azul (cabinet bench) is a vertical column at the left edge, and
the curved rows behind have variable seat counts. Pixel coords preserve
the layout faithfully; deriving rows/columns post hoc would be lossy.

Why on :class:`Person` and not :class:`Mandate`: today we ingest the XV
legislature only and each Person has at most one open mandate. If we
later ingest historical legislatures with conflicting layouts, the
columns can migrate to Mandate or grow a per-legislature companion
table.

Revision ID: 0016_person_seat
Revises: 0015_classification_kb
Create Date: 2026-05-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_person_seat"
down_revision: Union[str, None] = "0015_classification_kb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("seat_x", sa.Integer(), nullable=True))
    op.add_column("persons", sa.Column("seat_y", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("persons", "seat_y")
    op.drop_column("persons", "seat_x")
