"""Subscription endpoints (alerts + newsletter)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import (
    SubscriptionError,
    build_sender,
    confirm_alert_subscription,
    confirm_newsletter_subscription,
    create_alert_subscription,
    create_newsletter_subscription,
    unsubscribe_alert,
    unsubscribe_newsletter,
)
from app.db.session import get_session

router = APIRouter(tags=["subscriptions"])


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
async def subscribe_alert(
    payload: AlertCreate, session: AsyncSession = Depends(get_session)
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
async def subscribe_newsletter(
    payload: NewsletterCreate, session: AsyncSession = Depends(get_session)
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
    return SubscriptionResponse(status="pending_confirmation")


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
