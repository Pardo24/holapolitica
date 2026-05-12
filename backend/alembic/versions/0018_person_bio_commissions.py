"""persons.bio_text + persons.commissions

Adds two columns to ``persons`` so the ficha-personal scrape in
``app.ingest.congreso.photos`` can persist the deputy's biographical
paragraph and committee/role list parsed from the Congreso website.

- ``bio_text``: free-text biographical paragraph as it appears on the
  ficha page ("Licenciada en Farmacia. Postgrado en Dermofarmacia.
  Secretaria General PSIB-PSOE Illes Balears. …"). Multi-line; we
  strip HTML tags but preserve line breaks as double-newlines so the
  frontend can render paragraphs. NULL when the ficha has no bio
  (rare — placeholder/locked fichas).

- ``commissions``: JSONB array of strings — one entry per "Càrrec"
  row on the ficha page ("Adscrita de la Comisión de Derechos
  Sociales y Consumo des del 04/04/2024", "Presidenta de la Mesa del
  Congreso des del 17/08/2023", …). Stored as JSONB on Postgres for
  cheap GIN-indexable containment queries should the metrics layer
  later want them; rendered to a flat list of chips on the frontend.
  Empty list when the ficha publishes no committee assignments.

JSONB vs an auxiliary table: the data is faithful copy of source
strings, the cardinality is small (typically <15 per deputy), and we
never join against it. A separate ``person_commissions`` table would
be over-engineered for what is effectively a denormalised display
field. If we ever need to query "all deputies on the Health
Committee" we can either GIN-index ``commissions`` or extract into a
proper relation at that point.

Revision ID: 0018_person_bio_commissions
Revises: 0017_person_role
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0018_person_bio_commissions"
down_revision: str | None = "0017_person_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("bio_text", sa.Text(), nullable=True))
    op.add_column(
        "persons",
        sa.Column(
            "commissions",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("persons", "commissions")
    op.drop_column("persons", "bio_text")
