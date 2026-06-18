"""widen parliamentary_groups.slug + name_short to 120 chars.

Historical coalition groups (legislatures XIV…) have long names and slugs —
e.g. "GP Confederal de Unidas Podemos-En Comú Podem-Galicia en Común" — which
overflow the original VARCHAR(50). Widening to 120 is a metadata-only change
on Postgres (no table rewrite, no data loss). XV groups are unaffected.

Revision ID: 0027_widen_group_slug
Revises: 0026_device_tokens
Create Date: 2026-06-18
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0027_widen_group_slug"
down_revision: str | None = "0026_device_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "parliamentary_groups",
        "slug",
        type_=sa.String(length=120),
        existing_type=sa.String(length=50),
        existing_nullable=False,
    )
    op.alter_column(
        "parliamentary_groups",
        "name_short",
        type_=sa.String(length=120),
        existing_type=sa.String(length=50),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "parliamentary_groups",
        "name_short",
        type_=sa.String(length=50),
        existing_type=sa.String(length=120),
        existing_nullable=False,
    )
    op.alter_column(
        "parliamentary_groups",
        "slug",
        type_=sa.String(length=50),
        existing_type=sa.String(length=120),
        existing_nullable=False,
    )
