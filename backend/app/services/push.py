"""Web Push notification service.

Encapsulates two concerns:

1. **Sending one notification** to a single :class:`PushSubscription`
   via the Web Push protocol (RFC 8030 / RFC 8291 / RFC 8292), using
   ``pywebpush`` for payload encryption and VAPID auth.
2. **Fan-out** of a new :class:`Vote` to every subscription whose topic
   interests intersect with the vote's classified topics, with bounded
   concurrency.

Neutrality: the notification body is plain factual data — the vote's
title, truncated. No emojis, no editorial framing. See
``docs/neutrality-guidelines.md``.

Dead-endpoint handling: the W3C Push API spec says the push service
returns ``404`` or ``410 Gone`` when a browser uninstalls the SW or the
user revokes permission. Those statuses are *terminal* — we delete the
subscription row immediately. Transient failures (5xx, timeouts) bump
``failed_send_count``; a row crosses :data:`MAX_FAILURES` and is
pruned on the next attempt.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC
from typing import Any, Literal

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import (
    Initiative,
    InitiativeTopic,
    PushSubscription,
    PushTopicInterest,
    Topic,
    Vote,
)

log = get_logger(__name__)

# Pruning policy: after this many consecutive transient failures the
# subscription is considered dead and deleted by ``send_to_subscription``.
MAX_FAILURES: int = 5

# Fan-out concurrency: caps simultaneous HTTPS connections to push
# providers. Push services are external, geographically distributed, and
# generally tolerant; 10 is a polite default that keeps a vote fan-out
# bounded even at thousands of subscribers.
FAN_OUT_CONCURRENCY: int = 10

# Body subject is truncated for both notification ergonomics and the
# 4 KB payload limit that most push services enforce.
BODY_MAX_CHARS: int = 90


SendStatus = Literal["sent", "deleted", "failed", "unconfigured"]


@dataclass(frozen=True, slots=True)
class SendResult:
    """Outcome of one send attempt against a single subscription."""

    subscription_id: int
    status: SendStatus
    http_status: int | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class FanOutResult:
    """Aggregate outcome of a fan-out for one vote."""

    vote_id: int
    sent: int
    deleted: int
    failed: int
    skipped: int


# ---------------------------------------------------------------------------
# Payload composition
# ---------------------------------------------------------------------------


def _truncate(text: str, limit: int = BODY_MAX_CHARS) -> str:
    """Word-boundary-friendly truncation with an ellipsis."""
    text = text.strip()
    if len(text) <= limit:
        return text
    head = text[: limit - 1].rsplit(" ", 1)[0]
    return f"{head}…"


def compose_payload(
    *,
    vote: Vote,
    topic_name: str | None,
    site_origin: str = "",
) -> dict[str, str]:
    """Build the JSON payload the SW will receive.

    Layout is intentionally minimal:

    - ``title``: factual context ("Nou vot al Congrés [· Tema]").
    - ``body``: the vote's title, truncated. Plain text only.
    - ``url``: deep link to the vote detail page.
    - ``icon``: app icon path served by the frontend.
    """
    base_title = "Nou vot al Congrés"
    title = f"{base_title} · {topic_name}" if topic_name else base_title
    body = _truncate(vote.title or "")
    url = f"{site_origin.rstrip('/')}/votes/{vote.id}" if site_origin else f"/votes/{vote.id}"
    return {
        "title": title,
        "body": body,
        "url": url,
        "icon": "/icon.svg",
    }


# ---------------------------------------------------------------------------
# Single-subscription send
# ---------------------------------------------------------------------------


def _webpush_blocking(
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: dict[str, Any],
    vapid_private_key: str,
    vapid_subject: str,
) -> Any:
    """Thin wrapper to keep the ``pywebpush`` call site isolated for tests.

    ``pywebpush.webpush`` is synchronous (uses ``requests``); callers wrap it
    in ``asyncio.to_thread`` so the FastAPI/RQ event loop stays responsive.
    """
    return webpush(
        subscription_info={
            "endpoint": endpoint,
            "keys": {"p256dh": p256dh, "auth": auth},
        },
        data=json.dumps(payload),
        vapid_private_key=vapid_private_key,
        vapid_claims={"sub": vapid_subject},
    )


async def send_to_subscription(
    session: AsyncSession,
    subscription: PushSubscription,
    payload: dict[str, Any],
) -> SendResult:
    """Send one notification and reconcile the subscription on failure.

    On terminal errors (404, 410), the row is deleted in the same session
    (caller commits). On transient errors (5xx, timeouts), ``failed_send_count``
    is incremented and the row is deleted if it has now exceeded
    :data:`MAX_FAILURES`. Successful sends reset the counter.
    """
    settings = get_settings()
    priv = settings.vapid_private_key
    sub_subject = settings.vapid_subject
    if not priv:
        log.warning("push.send.unconfigured", subscription_id=subscription.id)
        return SendResult(
            subscription_id=subscription.id,
            status="unconfigured",
            reason="VAPID_PRIVATE_KEY not set",
        )

    try:
        await asyncio.to_thread(
            _webpush_blocking,
            endpoint=subscription.endpoint,
            p256dh=subscription.p256dh,
            auth=subscription.auth,
            payload=payload,
            vapid_private_key=priv,
            vapid_subject=sub_subject,
        )
    except WebPushException as exc:
        http_status: int | None = (
            getattr(exc.response, "status_code", None) if exc.response is not None else None
        )
        if http_status in (404, 410):
            log.info(
                "push.send.gone",
                subscription_id=subscription.id,
                http_status=http_status,
            )
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id == subscription.id)
            )
            return SendResult(
                subscription_id=subscription.id,
                status="deleted",
                http_status=http_status,
                reason="subscription expired",
            )

        subscription.failed_send_count = (subscription.failed_send_count or 0) + 1
        log.warning(
            "push.send.failed",
            subscription_id=subscription.id,
            http_status=http_status,
            failed_count=subscription.failed_send_count,
            error=str(exc),
        )
        if subscription.failed_send_count >= MAX_FAILURES:
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id == subscription.id)
            )
            return SendResult(
                subscription_id=subscription.id,
                status="deleted",
                http_status=http_status,
                reason="exceeded MAX_FAILURES",
            )
        return SendResult(
            subscription_id=subscription.id,
            status="failed",
            http_status=http_status,
            reason=str(exc),
        )
    except Exception as exc:  # pragma: no cover — defensive
        log.error(
            "push.send.exception",
            subscription_id=subscription.id,
            error=str(exc),
        )
        return SendResult(subscription_id=subscription.id, status="failed", reason=str(exc))

    # Success path. Reset the counter so a long-lived endpoint with
    # one earlier blip doesn't get pruned.
    if subscription.failed_send_count:
        subscription.failed_send_count = 0
    return SendResult(subscription_id=subscription.id, status="sent", http_status=201)


# ---------------------------------------------------------------------------
# Fan-out for a newly-created vote
# ---------------------------------------------------------------------------


async def _resolve_vote_topics(
    session: AsyncSession, vote_id: int
) -> tuple[Vote | None, list[Topic]]:
    """Load the vote and its classified topics (via the linked Initiative).

    Votes without a linked Initiative return an empty topic list, which
    causes :func:`fan_out_new_vote` to short-circuit — orphan votes
    don't generate notifications.
    """
    vote = (await session.execute(select(Vote).where(Vote.id == vote_id))).scalar_one_or_none()
    if vote is None or vote.initiative_id is None:
        return vote, []

    rows = (
        (
            await session.execute(
                select(Topic)
                .join(InitiativeTopic, InitiativeTopic.topic_id == Topic.id)
                .join(Initiative, Initiative.id == InitiativeTopic.initiative_id)
                .where(Initiative.id == vote.initiative_id)
            )
        )
        .scalars()
        .all()
    )
    return vote, list(rows)


async def _subscriptions_interested_in(
    session: AsyncSession, topic_ids: list[int]
) -> list[PushSubscription]:
    """Distinct subscriptions following any of ``topic_ids``."""
    if not topic_ids:
        return []
    result = await session.execute(
        select(PushSubscription)
        .join(
            PushTopicInterest,
            PushTopicInterest.subscription_id == PushSubscription.id,
        )
        .where(PushTopicInterest.topic_id.in_(topic_ids))
        .distinct()
    )
    return list(result.scalars().all())


async def fan_out_new_vote(
    session: AsyncSession,
    vote_id: int,
    *,
    site_origin: str = "",
    concurrency: int = FAN_OUT_CONCURRENCY,
) -> FanOutResult:
    """Fan out a single new vote to every interested subscription.

    The fan-out is bounded by ``concurrency`` (default
    :data:`FAN_OUT_CONCURRENCY`) so a spike doesn't overwhelm the push
    providers or our outbound socket budget. The function commits before
    returning so all bookkeeping (deletions, fail counts) is durable.
    """
    vote, topics = await _resolve_vote_topics(session, vote_id)
    if vote is None:
        return FanOutResult(vote_id=vote_id, sent=0, deleted=0, failed=0, skipped=0)
    if not topics:
        return FanOutResult(vote_id=vote_id, sent=0, deleted=0, failed=0, skipped=1)

    topic_ids = [t.id for t in topics]
    primary_topic_name = topics[0].name_ca if topics else None
    subs = await _subscriptions_interested_in(session, topic_ids)
    if not subs:
        return FanOutResult(vote_id=vote_id, sent=0, deleted=0, failed=0, skipped=0)

    payload = compose_payload(vote=vote, topic_name=primary_topic_name, site_origin=site_origin)

    sem = asyncio.Semaphore(concurrency)

    async def _one(sub: PushSubscription) -> SendResult:
        async with sem:
            return await send_to_subscription(session, sub, payload)

    results = await asyncio.gather(*(_one(s) for s in subs))
    await session.commit()

    sent = sum(1 for r in results if r.status == "sent")
    deleted = sum(1 for r in results if r.status == "deleted")
    failed = sum(1 for r in results if r.status == "failed")
    log.info(
        "push.fanout.done",
        vote_id=vote_id,
        topics=[t.slug for t in topics],
        recipients=len(subs),
        sent=sent,
        deleted=deleted,
        failed=failed,
    )
    return FanOutResult(
        vote_id=vote_id,
        sent=sent,
        deleted=deleted,
        failed=failed,
        skipped=0,
    )


# ---------------------------------------------------------------------------
# Subscription management helpers (used by API)
# ---------------------------------------------------------------------------


async def upsert_subscription(
    session: AsyncSession,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
    topic_slugs: list[str],
) -> PushSubscription:
    """Idempotent insert/update on ``endpoint`` with topic-interest sync.

    Re-subscribing the same endpoint refreshes the ECDH keys (the browser
    rotates them), the user agent, and the interest list. The interest
    list is *replaced*, not merged: the client always sends the full
    intended set.
    """
    from datetime import datetime

    sub = (
        await session.execute(
            select(PushSubscription)
            .options(selectinload(PushSubscription.interests))
            .where(PushSubscription.endpoint == endpoint)
        )
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if sub is None:
        sub = PushSubscription(
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
            last_seen_at=now,
            failed_send_count=0,
        )
        session.add(sub)
        await session.flush()
    else:
        sub.p256dh = p256dh
        sub.auth = auth
        if user_agent is not None:
            sub.user_agent = user_agent
        sub.last_seen_at = now
        sub.failed_send_count = 0

    await _sync_interests(session, sub, topic_slugs)
    await session.commit()
    return sub


async def _sync_interests(
    session: AsyncSession,
    subscription: PushSubscription,
    topic_slugs: list[str],
) -> None:
    """Replace the subscription's interests with the slugs provided.

    Unknown slugs are silently ignored (we never fail the upsert because
    a client cached a stale taxonomy).
    """
    desired = (
        (await session.execute(select(Topic).where(Topic.slug.in_(topic_slugs)))).scalars().all()
    )
    desired_ids = {t.id for t in desired}

    existing = (
        (
            await session.execute(
                select(PushTopicInterest).where(
                    PushTopicInterest.subscription_id == subscription.id
                )
            )
        )
        .scalars()
        .all()
    )
    existing_ids = {row.topic_id for row in existing}

    to_remove = existing_ids - desired_ids
    if to_remove:
        await session.execute(
            delete(PushTopicInterest).where(
                PushTopicInterest.subscription_id == subscription.id,
                PushTopicInterest.topic_id.in_(to_remove),
            )
        )
    for tid in desired_ids - existing_ids:
        session.add(PushTopicInterest(subscription_id=subscription.id, topic_id=tid))


async def update_interests(
    session: AsyncSession, *, endpoint: str, topic_slugs: list[str]
) -> PushSubscription | None:
    """Update interests for an existing endpoint. Returns None if not found."""
    sub = (
        await session.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    ).scalar_one_or_none()
    if sub is None:
        return None
    await _sync_interests(session, sub, topic_slugs)
    await session.commit()
    return sub


async def delete_subscription(session: AsyncSession, *, endpoint: str) -> bool:
    """Delete a subscription by endpoint. Returns whether anything was deleted."""
    result = await session.execute(
        delete(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    await session.commit()
    rowcount = getattr(result, "rowcount", 0) or 0
    return rowcount > 0
