"""initiatives.object_text — full preamble prose extracted from the BOCG PDF.

The Congreso open-data initiatives JSON serves the bill *title* in its
``OBJETO`` field, not the explanatory prose readers would call the law's
"objeto". The actual prose lives in the BOCG PDF linked from
``ENLACESBOCG``, under a heading that is one of ``Exposición de motivos``
or ``Preámbulo``.

This column stores that prose so the frontend can show "what this law
is about, in plain Spanish, written by the bill's authors" on the
vote-detail page — a complement to (not a replacement for) our
LLM-generated ``plain_summary_ca`` / ``plain_summary_es``. The two
serve different audiences: ``object_text`` is the bill author's
official text (legalese-adjacent but human readable), while
``plain_summary_*`` is our 2-3 sentence non-lawyer-friendly distillation.

Populated by :func:`app.ingest.congreso.object_extractor` during the
initiatives import for newly-created rows, and backfilled for existing
rows via the ``initiative_objects`` bootstrap step.

Revision ID: 0020_object_text
Revises: 0019_group_logo_url
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020_object_text"
down_revision: str | None = "0019_group_logo_url"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "initiatives",
        sa.Column("object_text", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "object_text")
