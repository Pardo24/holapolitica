"""initiatives.boe_entry_in_force — when the published law takes effect.

Companion to the BOE id/url columns added in 0022. The BOE Datos
Abiertos consolidated-legislation API exposes ``fecha_vigencia``
per norm — the date on which the law enters into force (already
parsed from the law's "Disposición final", which in plain Spanish
legal language reads as some variant of "el día siguiente a su
publicación en el «BOE»" or "a los seis meses de su publicación").

Storing this server-side lets the frontend answer "when does this
take effect?" without sending readers off to read the disposición
final themselves, and keeps the per-page render cheap.

Nullable: unmatched / pre-publication initiatives stay NULL, which
the UI treats as "we don't know yet" — the same honest default we
use for every other open-data enrichment field.

Revision ID: 0024_boe_in_force
Revises: 0023_wikipedia_summary
Create Date: 2026-05-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024_boe_in_force"
down_revision: str | None = "0023_wikipedia_summary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "initiatives",
        sa.Column("boe_entry_in_force", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("initiatives", "boe_entry_in_force")
