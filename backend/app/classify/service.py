"""Service that classifies an Initiative and persists the result.

The service is the integration point between the classifier providers and
the domain model. It expects an already-instantiated :class:`Classifier` so
tests can inject a stub. It writes one ``initiative_topics`` row per
returned slug, replacing any prior rows that came from the same
``(classifier, kind)`` pair.

Two classification knowledge bases coexist: ``'theme'`` (the editorial
17-topic taxonomy) and ``'sdg'`` (the 17 UN Sustainable Development Goals).
:meth:`ClassificationService.classify_initiative` takes a ``kind`` argument
that drives which set of Topics is offered to the LLM and which prompt is
used. The two runs are independent; running ``'sdg'`` never deletes
``'theme'`` rows or vice versa.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.classify.providers import Classifier
from app.core.logging import get_logger
from app.models import Initiative, InitiativeTopic, Topic

log = get_logger(__name__)


# Per-kind suffix appended to ``InitiativeTopic.classified_by`` so the two
# knowledge bases' rows never overwrite each other on re-run. For ``theme``
# we keep the bare classifier name for backwards compatibility with rows
# already in the database.
def _classified_by_label(classifier_name: str, kind: str) -> str:
    if kind == "theme":
        return classifier_name
    return f"{classifier_name}:{kind}"


class ClassificationService:
    def __init__(self, session: AsyncSession, classifier: Classifier) -> None:
        self.session = session
        self.classifier = classifier

    async def classify_initiative(self, initiative_id: int, *, kind: str = "theme") -> int:
        """Classify a single initiative in one knowledge base.

        Args:
            initiative_id: PK of the initiative to classify.
            kind: which classification knowledge base to use — ``'theme'``
                or ``'sdg'``. Drives both the system prompt and which
                ``Topic`` rows are offered to the classifier.

        Returns:
            The number of topics assigned. Idempotent per
            ``(initiative, classifier, kind)``: re-running replaces just
            those rows, leaving rows from other KBs untouched.
        """
        initiative = await self.session.get(Initiative, initiative_id, options=[selectinload("*")])
        if initiative is None:
            raise ValueError(f"Initiative {initiative_id} not found")

        topic_pairs = await self._load_topic_taxonomy(kind=kind)
        if not topic_pairs:
            log.warning("classify.no_topics_for_kind", kind=kind)
            return 0
        slugs_to_id = {slug: tid for tid, slug, _ in topic_pairs}
        topic_choices = [(slug, desc) for _, slug, desc in topic_pairs]

        decisions = await self.classifier.classify(
            title=initiative.title_original, topic_slugs=topic_choices, kind=kind
        )

        classified_by = _classified_by_label(self.classifier.name, kind)

        # Replace prior rows from the SAME (classifier, kind) so re-running
        # is idempotent without clobbering the other knowledge base.
        await self.session.execute(
            delete(InitiativeTopic)
            .where(InitiativeTopic.initiative_id == initiative.id)
            .where(InitiativeTopic.classified_by == classified_by)
        )

        now = datetime.now(UTC)
        added = 0
        for d in decisions:
            topic_id = slugs_to_id.get(d.slug)
            if topic_id is None:
                continue
            self.session.add(
                InitiativeTopic(
                    initiative_id=initiative.id,
                    topic_id=topic_id,
                    confidence=d.confidence,
                    classified_by=classified_by,
                    classified_at=now,
                )
            )
            added += 1

        await self.session.commit()
        log.info(
            "classify.done",
            initiative_id=initiative.id,
            classifier=self.classifier.name,
            kind=kind,
            topics_assigned=added,
        )
        return added

    async def _load_topic_taxonomy(self, *, kind: str = "theme") -> list[tuple[int, str, str]]:
        """Return ``(id, slug, short_description)`` tuples for every Topic in ``kind``.

        The short description fed to the LLM is the topic's Spanish name
        (the portal is Spanish-language); if absent, we fall back to the
        slug itself. The SDG rows additionally carry a Spanish
        ``description_es`` — when present, we concatenate it after the
        name for richer disambiguation in the prompt.
        """
        result = await self.session.execute(select(Topic).where(Topic.kind == kind))
        topics = list(result.scalars())
        pairs: list[tuple[int, str, str]] = []
        for t in topics:
            label = t.name_es or t.slug
            if t.description_es:
                label = f"{label} — {t.description_es}"
            pairs.append((t.id, t.slug, label))
        return pairs
