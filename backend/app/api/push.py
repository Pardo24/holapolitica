"""Web Push subscription endpoints.

These run as a *parallel channel* to the email-based newsletter and alert
endpoints in :mod:`app.api.subscriptions`. They share no state with the
email channel by design — they're keyed by the browser endpoint, not an
email address.

Endpoints:

- ``GET /push/public-key`` — returns the VAPID public key the browser
  needs to call ``pushManager.subscribe()``. Safe to expose.
- ``POST /push/subscribe`` — idempotent upsert of a browser subscription
  with an initial set of topic interests.
- ``PATCH /push/interests`` — replace the topic interests for an
  existing subscription. The endpoint itself is the identifier.
- ``POST /push/unsubscribe`` — delete the subscription (browser-side
  ``pushSubscription.unsubscribe()`` should be called too).

No user auth is required: the W3C Push API endpoint URL is a
cryptographically opaque, browser-issued capability token. Anyone who
already knows it can already send notifications, so requiring auth would
add operational cost without security benefit.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session
from app.services.push import (
    delete_subscription,
    update_interests,
    upsert_subscription,
)

router = APIRouter(prefix="/push", tags=["push"])
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PublicKeyResponse(BaseModel):
    public_key: str = Field(
        ...,
        description=(
            "VAPID public key, base64url-encoded uncompressed EC P-256 point "
            "(prefix 0x04, 65 bytes total before encoding)."
        ),
    )


class PushKeys(BaseModel):
    p256dh: str = Field(..., min_length=1, max_length=255)
    auth: str = Field(..., min_length=1, max_length=255)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    keys: PushKeys
    topic_slugs: list[str] = Field(default_factory=list)


class InterestsRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    topic_slugs: list[str] = Field(default_factory=list)


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)


class SubscriptionResponse(BaseModel):
    id: int
    endpoint: str
    topic_slugs: list[str]


class StatusResponse(BaseModel):
    status: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/public-key", response_model=PublicKeyResponse)
async def get_public_key() -> PublicKeyResponse:
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=503,
            detail="VAPID_PUBLIC_KEY not configured on the server.",
        )
    return PublicKeyResponse(public_key=settings.vapid_public_key)


def _interests_slugs_from(subscription_interests: list[object]) -> list[str]:
    """Best-effort extraction of topic slugs from loaded ``PushTopicInterest`` rows.

    Returns an empty list when the caller did not eagerly load topics — the
    /subscribe path always returns the *requested* slugs to spare an extra
    DB roundtrip. Callers that need authoritative values can refetch.
    """
    out: list[str] = []
    for row in subscription_interests:
        topic = getattr(row, "topic", None)
        if topic is not None and getattr(topic, "slug", None):
            out.append(topic.slug)
    return out


@router.post(
    "/subscribe",
    response_model=SubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("20/minute")
async def subscribe(
    payload: SubscribeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> SubscriptionResponse:
    ua = request.headers.get("user-agent")
    sub = await upsert_subscription(
        session,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=ua,
        topic_slugs=payload.topic_slugs,
    )
    return SubscriptionResponse(
        id=sub.id,
        endpoint=sub.endpoint,
        topic_slugs=list(payload.topic_slugs),
    )


@router.patch("/interests", response_model=SubscriptionResponse)
@limiter.limit("30/minute")
async def patch_interests(
    request: Request,
    payload: InterestsRequest,
    session: AsyncSession = Depends(get_session),
) -> SubscriptionResponse:
    sub = await update_interests(
        session,
        endpoint=payload.endpoint,
        topic_slugs=payload.topic_slugs,
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return SubscriptionResponse(
        id=sub.id,
        endpoint=sub.endpoint,
        topic_slugs=list(payload.topic_slugs),
    )


@router.post("/unsubscribe", response_model=StatusResponse)
@limiter.limit("20/minute")
async def unsubscribe(
    request: Request,
    payload: UnsubscribeRequest,
    session: AsyncSession = Depends(get_session),
) -> StatusResponse:
    deleted = await delete_subscription(session, endpoint=payload.endpoint)
    if not deleted:
        # Idempotency: a client retrying after a timeout shouldn't 404.
        return StatusResponse(status="not_found", detail="No subscription was registered.")
    return StatusResponse(status="unsubscribed")
