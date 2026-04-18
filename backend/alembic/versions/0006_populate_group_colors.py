"""populate color_hex for the 9 active parliamentary groups in legislature XV

The Congreso open data feed does not publish group brand colors. We hardcode
the conventional Spanish parliamentary palette for the 9 currently-active
groups so the frontend can render colored chips, swatches and topic charts
without per-render lookups.

Colors are intentionally muted (Tailwind ``500`` shades or close) so they
read well on light AND dark backgrounds. Brand-strict tones (e.g. PP's
Pantone) would clash; this is a CIVIC dashboard, not a campaign poster.

Revision ID: 0006_group_colors
Revises: 0005_vote_graphic_url
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_group_colors"
down_revision: Union[str, None] = "0005_vote_graphic_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (slug, color_hex). Values are conventional but readable; tweak in a follow-up
# migration if a group raises a brand objection.
GROUP_COLORS: list[tuple[str, str]] = [
    ("gp-popular", "#1E88E5"),  # PP — blue
    ("gp-socialista", "#E53935"),  # PSOE — red
    ("gp-vox", "#43A047"),  # VOX — green
    ("gp-plurinacional-sumar", "#8E24AA"),  # Sumar — magenta
    ("gp-junts-per-catalunya", "#00ACC1"),  # Junts — cyan
    ("gp-euskal-herria-bildu", "#7CB342"),  # EH Bildu — light green
    ("gp-republicano", "#FB8C00"),  # ERC — amber
    ("gp-vasco-eaj-pnv", "#00897B"),  # EAJ-PNV — teal
    ("gp-mixto", "#757575"),  # Mixto — grey
]


def upgrade() -> None:
    bind = op.get_bind()
    for slug, color in GROUP_COLORS:
        bind.execute(
            sa.text(
                "UPDATE parliamentary_groups SET color_hex = :color "
                "WHERE slug = :slug AND color_hex IS NULL"
            ),
            {"slug": slug, "color": color},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE parliamentary_groups SET color_hex = NULL " "WHERE slug = ANY(:slugs)"),
        {"slugs": [s for s, _ in GROUP_COLORS]},
    )
