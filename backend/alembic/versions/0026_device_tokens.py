"""device_tokens — native (APNs/FCM) push registrations for the mobile app.

Parallel to ``push_subscriptions`` (Web Push), for the Capacitor wrapper:
a native WebView can't use the Web Push API, so the app registers for native
push and stores its device token here. Interests live inline as JSON slug
lists so this is a single additive table; ``platform`` is a plain string
('ios'/'android'/'web') rather than a DB enum to stay dialect-agnostic.

Additive and dormant: no code path writes here until the native app + FCM
credentials are configured, so applying this migration is a no-op for the
running site.

Revision ID: 0026_device_tokens
Revises: 0025_push_group_interests
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026_device_tokens"
down_revision: str | None = "0025_push_group_interests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("topic_slugs", sa.JSON(), nullable=False),
        sa.Column("group_slugs", sa.JSON(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_send_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_device_tokens_token", "device_tokens", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_device_tokens_token", table_name="device_tokens")
    op.drop_table("device_tokens")
