"""Subscription endpoints (alerts + newsletter)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import (
    SubscriptionError,
    build_sender,
    confirm_alert_subscription,
    confirm_newsletter_subscription,
    create_alert_subscription,
    create_newsletter_subscription,
    set_newsletter_topic_preferences,
    unsubscribe_alert,
    unsubscribe_newsletter,
)
from app.db.session import get_session

router = APIRouter(tags=["subscriptions"])

# Local Limiter handle so the decorators below can reference a
# concrete limiter object. slowapi uses ``request.app.state.limiter`` at
# runtime, so we don't need to share the global instance here — this is
# only for the decorator API to type-check.
limiter = Limiter(key_func=get_remote_address)


class AlertCreate(BaseModel):
    email: EmailStr
    target_type: Literal["topic", "person", "group"]
    target_id: int
    language: Literal["ca", "es", "en"] = "ca"


class NewsletterCreate(BaseModel):
    email: EmailStr
    language: Literal["ca", "es", "en"] = "ca"


class SubscriptionResponse(BaseModel):
    status: Literal["pending_confirmation", "confirmed", "unsubscribed"]
    detail: str = Field(
        default="Hem enviat un correu de confirmació. Revisa la teva safata d'entrada."
    )


@router.post("/alerts", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def subscribe_alert(
    request: Request,
    payload: AlertCreate,
    session: AsyncSession = Depends(get_session),
) -> SubscriptionResponse:
    try:
        await create_alert_subscription(
            session,
            build_sender(),
            email=str(payload.email),
            target_type=payload.target_type,
            target_id=payload.target_id,
            language=payload.language,
        )
    except SubscriptionError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return SubscriptionResponse(status="pending_confirmation")


@router.post(
    "/newsletter", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def subscribe_newsletter(
    request: Request,
    payload: NewsletterCreate,
    session: AsyncSession = Depends(get_session),
) -> SubscriptionResponse:
    try:
        await create_newsletter_subscription(
            session,
            build_sender(),
            email=str(payload.email),
            language=payload.language,
        )
    except SubscriptionError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (ImportError, ConnectionError, TimeoutError) as e:
        # SMTP transport problems (missing aiosmtplib, network, broken
        # credentials). The subscription row was already committed in
        # `create_newsletter_subscription` before the send call, so the
        # email pending in DB; a future redelivery job (or the user
        # re-submitting) will retry the confirmation. Surface a clear 503
        # instead of letting FastAPI render an opaque 500.
        raise HTTPException(
            status_code=503,
            detail=(
                "El servei de correu està temporalment indisponible. "
                "La teva subscripció s'ha guardat; rebràs el correu de "
                "confirmació quan el servei estigui restablert."
            ),
        ) from e
    return SubscriptionResponse(status="pending_confirmation")


class NewsletterPreferencesUpdate(BaseModel):
    """Body of ``POST /newsletter/preferences``.

    ``token`` is the long-lived ``confirmation_token`` from the
    subscriber's welcome email. ``topic_slugs`` is the authoritative
    list — it replaces the existing filter rather than appending to it
    (the frontend reads the current value, lets the user edit it, and
    POSTs the full set back).
    """

    token: str = Field(min_length=8, max_length=64)
    topic_slugs: list[str] = Field(default_factory=list, max_length=50)


class NewsletterPreferencesResponse(BaseModel):
    status: Literal["saved"] = "saved"
    topic_slugs: list[str]


@router.post(
    "/newsletter/preferences",
    response_model=NewsletterPreferencesResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit("20/minute")
async def update_newsletter_preferences(
    request: Request,
    payload: NewsletterPreferencesUpdate,
    session: AsyncSession = Depends(get_session),
) -> NewsletterPreferencesResponse:
    try:
        sub = await set_newsletter_topic_preferences(
            session,
            token=payload.token,
            topic_slugs=payload.topic_slugs,
        )
    except SubscriptionError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return NewsletterPreferencesResponse(topic_slugs=list(sub.topic_slugs))


@router.get("/confirm/alert/{token}", response_model=SubscriptionResponse)
async def confirm_alert(
    token: str, session: AsyncSession = Depends(get_session)
) -> SubscriptionResponse:
    try:
        await confirm_alert_subscription(session, token=token)
    except SubscriptionError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return SubscriptionResponse(status="confirmed", detail="Subscripció confirmada.")


@router.get("/confirm/newsletter/{token}", response_model=SubscriptionResponse)
async def confirm_newsletter(
    token: str, session: AsyncSession = Depends(get_session)
) -> SubscriptionResponse:
    try:
        await confirm_newsletter_subscription(session, token=token)
    except SubscriptionError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return SubscriptionResponse(status="confirmed", detail="Subscripció confirmada.")


@router.delete("/unsubscribe/alert/{token}", response_model=SubscriptionResponse)
async def cancel_alert(
    token: str, session: AsyncSession = Depends(get_session)
) -> SubscriptionResponse:
    try:
        await unsubscribe_alert(session, token=token)
    except SubscriptionError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return SubscriptionResponse(status="unsubscribed", detail="Has cancel·lat la subscripció.")


@router.delete("/unsubscribe/newsletter/{token}", response_model=SubscriptionResponse)
async def cancel_newsletter(
    token: str, session: AsyncSession = Depends(get_session)
) -> SubscriptionResponse:
    try:
        await unsubscribe_newsletter(session, token=token)
    except SubscriptionError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return SubscriptionResponse(status="unsubscribed", detail="Has cancel·lat la subscripció.")
