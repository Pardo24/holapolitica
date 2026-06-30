"""Shared resolution helpers for parliamentary groups."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Legislature, ParliamentaryGroup


async def resolve_latest_group(session: AsyncSession, slug: str) -> ParliamentaryGroup | None:
    """Resolve the most recent parliamentary-group instance for ``slug``.

    Groups are stored one row per legislature (unique on
    ``legislature_id`` + ``slug``), so a party's history spans several ids
    sharing one slug. We want the instance from the most recent legislature
    the slug appears in, ordered by the legislature's ``start_date`` — NOT by
    ``legislature_id``.

    Legislature ids are NOT chronological: the historical backfill assigned
    the current XV term ``id=1`` and older terms higher ids, so the previous
    ``ParliamentaryGroup.legislature_id.desc()`` ordering resolved to the
    OLDEST legislature (the X, 2011) instead of the current one. That silently
    fed several group widgets (composition, members, topic stats, ...) with
    decade-old data.
    """
    return (
        await session.execute(
            select(ParliamentaryGroup)
            .join(Legislature, Legislature.id == ParliamentaryGroup.legislature_id)
            .where(ParliamentaryGroup.slug == slug)
            .order_by(Legislature.start_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
