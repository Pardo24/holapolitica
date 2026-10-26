"""initiative topics: set aside the classifier's guesses.

Theme assignments below 0.65 confidence (app/classify/service.py
``MIN_CONFIDENCE``) move to ``initiative_topics_low_confidence``, except the
most confident topic of each initiative, so none is left without one: 291
of 2,667 rows on 2026-10-26, mostly second topics ("labour" on 81 texts,
"energy" on 42). New classifications skip them from now on.

Moved, not deleted: the downgrade puts them back.

Revision ID: 0041_topic_low_confidence
Revises: 0040_election_result_snapshots
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0041_topic_low_confidence"
down_revision: str | None = "0040_election_result_snapshots"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LOW = """
    SELECT it.id FROM (
        SELECT it.id, it.confidence,
               row_number() OVER (
                   PARTITION BY it.initiative_id ORDER BY it.confidence DESC, it.id
               ) AS rk
        FROM initiative_topics it JOIN topics t ON t.id = it.topic_id
        WHERE t.kind = 'theme'
    ) it
    WHERE it.confidence < 0.65 AND it.rk > 1
"""


def upgrade() -> None:
    op.execute(
        "CREATE TABLE initiative_topics_low_confidence AS "
        "SELECT * FROM initiative_topics WITH NO DATA"
    )
    op.execute(
        f"INSERT INTO initiative_topics_low_confidence "
        f"SELECT * FROM initiative_topics WHERE id IN ({_LOW})"
    )
    op.execute(
        "DELETE FROM initiative_topics WHERE id IN "
        "(SELECT id FROM initiative_topics_low_confidence)"
    )


def downgrade() -> None:
    op.execute("INSERT INTO initiative_topics SELECT * FROM initiative_topics_low_confidence")
    op.execute("DROP TABLE initiative_topics_low_confidence")
