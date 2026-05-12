"""persons.role_title + persons.role_kind

Captures the parliamentary or executive role a deputy holds (President
of Government, Minister, Mesa officer…) so the UI can attach caveats
to metrics that the role itself distorts. NULL for ordinary deputies.

Revision ID: 0017_person_role
Revises: 0016_person_seat
Create Date: 2026-05-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_person_role"
down_revision: Union[str, None] = "0016_person_seat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("role_title", sa.String(200), nullable=True))
    op.add_column("persons", sa.Column("role_kind", sa.String(16), nullable=True))
    op.create_index("ix_persons_role_kind", "persons", ["role_kind"])


def downgrade() -> None:
    op.drop_index("ix_persons_role_kind", table_name="persons")
    op.drop_column("persons", "role_kind")
    op.drop_column("persons", "role_title")
