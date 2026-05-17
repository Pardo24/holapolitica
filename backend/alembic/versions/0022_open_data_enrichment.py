"""persons.wikidata + initiatives.boe — open-data enrichment columns.

Two parallel enrichment tracks land in the same migration because
they expand different rows but read identical (nullable, opt-in,
populated by background workers).

* ``persons.wikidata_qid`` + ``wikipedia_url_*`` + ``education`` +
  ``profession`` come from a Wikidata SPARQL match (worker
  :func:`app.workers.jobs.enrich_persons_wikidata`). The QID is the
  durable identifier; the URL columns are pre-computed for the three
  UI locales so the frontend never has to hit Wikidata client-side.

* ``initiatives.boe_id`` + ``boe_url`` reference the Boletín Oficial
  del Estado entry for an approved law. The worker
  :func:`enrich_initiatives_boe` matches via the expediente raw or
  the title; only ever populates rows whose initiative resulted in a
  published law.

Every column is nullable + has no default — an un-enriched row stays
visibly indistinguishable from one whose match failed, which is the
honest representation.

Revision ID: 0022_open_data
Revises: 0021_nl_topics
Create Date: 2026-05-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_open_data"
down_revision: str | None = "0021_nl_topics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # persons — Wikidata enrichment
    op.add_column("persons", sa.Column("wikidata_qid", sa.String(16), nullable=True))
    op.create_index(
        "ix_persons_wikidata_qid",
        "persons",
        ["wikidata_qid"],
        unique=True,
    )
    op.add_column("persons", sa.Column("wikipedia_url_ca", sa.String(500), nullable=True))
    op.add_column("persons", sa.Column("wikipedia_url_es", sa.String(500), nullable=True))
    op.add_column("persons", sa.Column("wikipedia_url_en", sa.String(500), nullable=True))
    op.add_column("persons", sa.Column("education", sa.String(255), nullable=True))
    op.add_column("persons", sa.Column("profession", sa.String(255), nullable=True))

    # initiatives — BOE reference
    op.add_column("initiatives", sa.Column("boe_id", sa.String(40), nullable=True))
    op.add_column("initiatives", sa.Column("boe_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("initiatives", "boe_url")
    op.drop_column("initiatives", "boe_id")
    op.drop_column("persons", "profession")
    op.drop_column("persons", "education")
    op.drop_column("persons", "wikipedia_url_en")
    op.drop_column("persons", "wikipedia_url_es")
    op.drop_column("persons", "wikipedia_url_ca")
    op.drop_index("ix_persons_wikidata_qid", table_name="persons")
    op.drop_column("persons", "wikidata_qid")
