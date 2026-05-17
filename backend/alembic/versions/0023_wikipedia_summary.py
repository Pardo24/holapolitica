"""persons.wikipedia_summary_ca/_es/_en — short biographical blurb.

The Wikidata enrichment in 0022 records each deputy's per-locale
Wikipedia URL. This migration adds a companion column for the
plain-text "extract" pulled from the Wikipedia REST summary API
(typically the article's first paragraph, 200-500 chars).

We store the extract directly rather than only the URL so the
frontend stays a single DB query — no client-side fetch to a third
party, no Wikipedia outage blanking the page. The text is
re-fetched periodically (worker
:func:`app.workers.jobs.enrich_persons_wikipedia`) to follow
upstream edits.

Revision ID: 0023_wikipedia_summary
Revises: 0022_open_data
Create Date: 2026-05-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_wikipedia_summary"
down_revision: str | None = "0022_open_data"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("wikipedia_summary_ca", sa.Text(), nullable=True))
    op.add_column("persons", sa.Column("wikipedia_summary_es", sa.Text(), nullable=True))
    op.add_column("persons", sa.Column("wikipedia_summary_en", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("persons", "wikipedia_summary_en")
    op.drop_column("persons", "wikipedia_summary_es")
    op.drop_column("persons", "wikipedia_summary_ca")
