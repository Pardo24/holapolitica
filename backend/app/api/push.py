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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_session
from app.services.native_push import (
    delete_device_token,
    register_device_token,
)
from app.services.push import (
    delete_subscription,
    update_interests,
    upsert_subscription,
)

router = APIRouter(prefix="/push", tags=["push"])


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
    # Parliamentary group slugs the subscriber wants to follow. A
    # vote tabled by any of these groups triggers a notification
    # regardless of topic match. Optional; omit to keep
    # backwards-compat with the original topic-only payload.
    group_slugs: list[str] = Field(default_factory=list)


class InterestsRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)
    topic_slugs: list[str] = Field(default_factory=list)
    # When omitted the existing group interests are LEFT UNTOUCHED
    # (None semantics). Pass an empty list explicitly to clear all
    # group interests.
    group_slugs: list[str] | None = None


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=1)


class SubscriptionResponse(BaseModel):
    id: int
    endpoint: str
    topic_slugs: list[str]
    group_slugs: list[str]


class StatusResponse(BaseModel):
    status: str
    detail: str | None = None


class DeviceRegisterRequest(BaseModel):
    """Native (APNs/FCM) device-token registration from the Capacitor app."""

    token: str = Field(..., min_length=1)
    platform: str = Field("web", pattern="^(ios|android|web)$")
    topic_slugs: list[str] = Field(default_factory=list)
    group_slugs: list[str] = Field(default_factory=list)


class DeviceResponse(BaseModel):
    token: str
    platform: str
    topic_slugs: list[str]
    group_slugs: list[str]


class DeviceUnregisterRequest(BaseModel):
    token: str = Field(..., min_length=1)


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
        group_slugs=payload.group_slugs,
    )
    return SubscriptionResponse(
        id=sub.id,
        endpoint=sub.endpoint,
        topic_slugs=list(payload.topic_slugs),
        group_slugs=list(payload.group_slugs),
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
        group_slugs=payload.group_slugs,
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    # For the response we echo back the requested topic slugs and —
    # for groups — whatever the caller provided (None means "kept as
    # they were"; we don't refetch to spare the roundtrip, the
    # client already knows the value it didn't change).
    return SubscriptionResponse(
        id=sub.id,
        endpoint=sub.endpoint,
        topic_slugs=list(payload.topic_slugs),
        group_slugs=list(payload.group_slugs) if payload.group_slugs is not None else [],
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


# ---------------------------------------------------------------------------
# Native push (APNs/FCM) — the Capacitor app registers its device token here.
# Parallel to the Web Push endpoints above; the actual FCM delivery is
# dormant until FCM_SERVICE_ACCOUNT_JSON is configured (see services.native_push).
# ---------------------------------------------------------------------------


@router.post("/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def register_device(
    request: Request,
    payload: DeviceRegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> DeviceResponse:
    device = await register_device_token(
        session,
        token=payload.token,
        platform=payload.platform,
        topic_slugs=payload.topic_slugs,
        group_slugs=payload.group_slugs,
    )
    return DeviceResponse(
        token=device.token,
        platform=device.platform,
        topic_slugs=list(device.topic_slugs),
        group_slugs=list(device.group_slugs),
    )


@router.post("/devices/unregister", response_model=StatusResponse)
@limiter.limit("20/minute")
async def unregister_device(
    request: Request,
    payload: DeviceUnregisterRequest,
    session: AsyncSession = Depends(get_session),
) -> StatusResponse:
    deleted = await delete_device_token(session, token=payload.token)
    if not deleted:
        return StatusResponse(status="not_found", detail="No device token was registered.")
    return StatusResponse(status="unregistered")
