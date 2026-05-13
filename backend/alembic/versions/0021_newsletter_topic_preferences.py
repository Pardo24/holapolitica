"""newsletter_subscriptions.topic_slugs — per-subscriber topic interest filter.

Subscribers can now narrow the weekly digest to a chosen subset of the
topic taxonomy. The simplest schema that fits the read pattern is a
single JSON/JSONB column on the existing ``newsletter_subscriptions``
row: every subscriber has exactly one preference set, and reads are
"give me all topic slugs for this email/token" — a single-row lookup
with no joins.

A separate junction table would be more normalised but for the
expected volume (thousands of subscribers each picking < 10 topics from
a closed list of ~34) the cost of joining on every digest render
outweighs the storage savings.

Default ``[]`` preserves the historical behaviour (digest covers every
topic) for already-confirmed subscribers, so no email goes silent.

Revision ID: 0021_newsletter_topic_preferences
Revises: 0020_object_text
Create Date: 2026-05-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "0021_newsletter_topic_preferences"
down_revision: str | None = "0020_object_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "newsletter_subscriptions",
        sa.Column(
            "topic_slugs",
            sa.JSON().with_variant(JSONB(), "postgresql"),
            nullable=False,
            # Postgres can't store a JSON literal directly in a default
            # without server_default; we wrap it as text and let the
            # column coerce. SQLite (test env) honours the same syntax.
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("newsletter_subscriptions", "topic_slugs")
