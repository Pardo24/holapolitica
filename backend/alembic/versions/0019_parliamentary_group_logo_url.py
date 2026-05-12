"""parliamentary_groups.logo_url

Adds an optional column that lets the frontend render an official party
logo in place of the abbreviation disc. The Congreso website **does not
publish group logos as standalone, publicly-fetchable images**: the only
place a logo appears on the portal is embedded inside the deputy ficha
page as an inline ``data:image/jpeg;base64,…`` blob (verified
2026-05-12). Probing the obvious folder layouts —
``/o/diputados/img/escudos_grupos/``, ``/docu/imgweb/grupos/``,
``/o/grupos/img/`` and several variants — every candidate returns 404.

That leaves us with three options:

1. **Re-host the party logos ourselves.** Each logo is a registered
   trademark of its respective political party. Using it on a
   third-party site (even one with strictly factual, neutral framing)
   in 2026 Spain falls into a grey area; parties have historically
   complained when their marks are reused without permission, including
   in cases where the reuse was clearly journalistic. We are not
   prepared to litigate that, especially given the project's
   "infrastructure, not megaphone" stance — we never want to look like
   we are endorsing or amplifying a particular party's brand.

2. **Decode the base64 blob from the ficha page and serve it through
   our CDN.** This is technically possible but inherits exactly the
   same trademark problem as option 1, plus it's brittle (the embedded
   image changes whenever the portal is reskinned).

3. **Leave the column NULL and keep the existing color-disc +
   abbreviation rendering as the canonical visual.** The colored disc
   is our own neutral mark, derived only from the party's brand colour
   (a fact, not a trademark) and the official short name string. No
   logo, no party identity beyond what we already cite textually.

We pick (3) as the default. The column is added so a future operator
who has obtained proper written permission from a party (or who is
working in a jurisdiction where these uses are clearly de minimis fair
use) can populate it via a one-off SQL ``UPDATE`` and have the
frontend pick it up automatically — no schema change required at that
point. The frontend's :file:`GroupBadge` / :file:`GroupChip` components
treat NULL as "fall back to the disc", so the production install ships
with the disc behaviour intact until an admin explicitly opts in.

Revision ID: 0019_group_logo_url
Revises: 0018_person_bio_commissions
Create Date: 2026-05-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_group_logo_url"
down_revision: str | None = "0018_person_bio_commissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "parliamentary_groups",
        sa.Column("logo_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("parliamentary_groups", "logo_url")
