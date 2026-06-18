"""Native push (APNs/FCM) for the Capacitor app — parallel to Web Push.

A native WebView can't use the Web Push API, so the wrapper registers for
native push and posts its device token to :func:`register_device_token`.
:func:`fan_out_native_for_vote` mirrors the web fan-out (union of topic OR
proposing-group interest) but delivers via Firebase Cloud Messaging.

DORMANT BY DEFAULT: the fan-out returns a ``skipped`` result (a pure no-op)
whenever ``FCM_SERVICE_ACCOUNT_JSON`` is absent, so this module is safe to
ship before the native app, the Apple Developer key or the Firebase project
exist. Activation = set that env var and wire ``fan_out_native_for_vote``
into the vote-ingest path alongside the web fan-out.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import DeviceToken, ParliamentaryGroup
from app.services.push import _resolve_vote_topics

log = get_logger(__name__)

_VALID_PLATFORMS = {"ios", "android", "web"}


async def register_device_token(
    session: AsyncSession,
    *,
    token: str,
    platform: str,
    topic_slugs: list[str],
    group_slugs: list[str],
) -> DeviceToken:
    """Idempotent upsert of a native device token + its interests (by token)."""
    token = token.strip()
    if not token:
        raise ValueError("token must be non-empty")
    plat = platform if platform in _VALID_PLATFORMS else "web"

    existing = (
        await session.execute(select(DeviceToken).where(DeviceToken.token == token))
    ).scalar_one_or_none()
    if existing is None:
        existing = DeviceToken(token=token, platform=plat, topic_slugs=[], group_slugs=[])
        session.add(existing)
    existing.platform = plat
    existing.topic_slugs = sorted({s for s in topic_slugs if s})
    existing.group_slugs = sorted({s for s in group_slugs if s})
    existing.last_seen_at = datetime.now(UTC)
    existing.failed_send_count = 0
    await session.commit()
    await session.refresh(existing)
    return existing


async def delete_device_token(session: AsyncSession, *, token: str) -> bool:
    """Delete a device token (idempotent). Returns whether a row was removed."""
    result = await session.execute(delete(DeviceToken).where(DeviceToken.token == token.strip()))
    await session.commit()
    return (getattr(result, "rowcount", 0) or 0) > 0


def _fcm_credentials() -> dict[str, Any] | None:
    """Parse the FCM service-account JSON from the environment, or None."""
    raw = os.environ.get("FCM_SERVICE_ACCOUNT_JSON")
    if not raw:
        return None
    try:
        return dict(json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        log.error("native_push.fcm.bad_credentials_json")
        return None


@dataclass(frozen=True, slots=True)
class NativeFanOutResult:
    sent: int = 0
    failed: int = 0
    deleted: int = 0
    skipped: str | None = None


async def fan_out_native_for_vote(
    session: AsyncSession, vote_id: int, *, site_origin: str
) -> NativeFanOutResult:
    """Deliver a vote to matching native device tokens via FCM.

    No-op (``skipped='fcm_not_configured'``) unless FCM_SERVICE_ACCOUNT_JSON is
    set — so this is safe to call on every ingest before push is activated.
    Matching is by slug intersection (topic OR proposing group), in Python:
    the device table is tiny and JSON-array containment differs by dialect;
    a SQL-side filter is an easy later optimisation.
    """
    creds = _fcm_credentials()
    if creds is None:
        return NativeFanOutResult(skipped="fcm_not_configured")

    vote, topics = await _resolve_vote_topics(session, vote_id)
    if vote is None:
        return NativeFanOutResult(skipped="vote_not_found")

    topic_slugs = {t.slug for t in topics}
    interested_groups: set[str] = set()
    if vote.proposing_group_id is not None:
        slug = (
            await session.execute(
                select(ParliamentaryGroup.slug).where(
                    ParliamentaryGroup.id == vote.proposing_group_id
                )
            )
        ).scalar_one_or_none()
        if slug:
            interested_groups.add(slug)
    if vote.proposed_by_government:
        interested_groups.add("govern")
    if not topic_slugs and not interested_groups:
        return NativeFanOutResult(skipped="no_targets")

    tokens = list((await session.execute(select(DeviceToken))).scalars().all())
    matched = [
        d
        for d in tokens
        if (set(d.topic_slugs) & topic_slugs) or (set(d.group_slugs) & interested_groups)
    ]
    if not matched:
        return NativeFanOutResult(skipped="no_matches")

    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except ImportError:
        log.error("native_push.fcm.sdk_missing")
        return NativeFanOutResult(skipped="sdk_missing")

    # firebase_admin._apps is the SDK's documented way to check whether the
    # default app is already initialised (it has no public accessor).
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(creds))

    body = (vote.description or vote.title or "").strip()[:140]
    url = f"{site_origin.rstrip('/')}/votes/{vote.id}"
    message = messaging.MulticastMessage(
        tokens=[d.token for d in matched],
        notification=messaging.Notification(title="Hola Política", body=body),
        data={"url": url},
    )
    response = messaging.send_each_for_multicast(message)

    deleted = 0
    for device, result in zip(matched, response.responses, strict=False):
        if not result.success:
            reason = str(getattr(result, "exception", "")).lower()
            if "not-registered" in reason or "invalid" in reason:
                await session.execute(delete(DeviceToken).where(DeviceToken.id == device.id))
                deleted += 1
    if deleted:
        await session.commit()

    log.info(
        "native_push.fanout.done",
        vote_id=vote_id,
        sent=response.success_count,
        failed=response.failure_count,
        deleted=deleted,
    )
    return NativeFanOutResult(
        sent=response.success_count, failed=response.failure_count, deleted=deleted
    )
