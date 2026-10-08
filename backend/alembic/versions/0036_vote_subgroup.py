"""vote subgroup: which part of a law a vote decided.

The vote XML's ``<TituloSubGrupo>`` / ``<TextoSubGrupo>`` say whether a vote
was a group's amendment ("Enmiendas presentadas por el Grupo Parlamentario
Popular en el Congreso" / "Enmienda 26."), the committee's text ("Votación
del dictamen."), the organic-law whole-text vote ("Votación de conjunto.")
or one point of a motion ("Votación separada por puntos." / "Punto 3.").
We dropped them at ingest, so a law's ten votes read as one question with
contradictory answers. Kept verbatim; the stage is derived from them in
app/services/vote_stage.py.

Purely additive; filled by re-importing the sessions.

Revision ID: 0036_vote_subgroup
Revises: 0035_profile_effects
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0036_vote_subgroup"
down_revision: str | None = "0035_profile_effects"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("votes", sa.Column("subgroup_title", sa.Text(), nullable=True))
    op.add_column("votes", sa.Column("subgroup_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("votes", "subgroup_text")
    op.drop_column("votes", "subgroup_title")
