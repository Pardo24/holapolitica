"""Subscription management service.

The flow:

1. ``create_alert_subscription`` / ``create_newsletter_subscription`` create
   the row with ``confirmed=False`` and a fresh ``confirmation_token``, then
   email a link containing that token.
2. The user clicks the link; ``confirm_*`` flips ``confirmed=True`` and
   clears the token.
3. ``unsubscribe_*`` sets ``unsubscribed_at`` (we keep the row for audit).

If the same email subscribes twice we *re-issue* the token rather than
duplicate the row — this is also the recovery path if the original email
gets lost.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.email import EmailMessage, EmailSender
from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import AlertSubscription, NewsletterSubscription

log = get_logger(__name__)

AlertTargetType = Literal["topic", "person", "group"]


class SubscriptionError(RuntimeError):
    """Raised for invalid subscription requests (bad token, missing target, ...)."""


# ---------------------------------------------------------------------------
# Alert subscriptions
# ---------------------------------------------------------------------------


async def create_alert_subscription(
    session: AsyncSession,
    email_sender: EmailSender,
    *,
    email: str,
    target_type: AlertTargetType,
    target_id: int,
    language: str = "ca",
) -> AlertSubscription:
    """Create or refresh an alert subscription and dispatch the confirmation email."""
    if target_type not in ("topic", "person", "group"):
        raise SubscriptionError(f"Invalid target_type: {target_type}")

    existing = (
        await session.execute(
            select(AlertSubscription)
            .where(AlertSubscription.email == email.lower())
            .where(AlertSubscription.target_type == target_type)
            .where(AlertSubscription.target_id == target_id)
        )
    ).scalar_one_or_none()

    token = _new_token()
    if existing is not None:
        existing.confirmation_token = token
        existing.confirmed = False
        existing.unsubscribed_at = None
        existing.language = language
        sub = existing
    else:
        sub = AlertSubscription(
            email=email.lower(),
            target_type=target_type,
            target_id=target_id,
            language=language,
            confirmed=False,
            confirmation_token=token,
        )
        session.add(sub)

    await session.commit()
    await _send_confirmation(email_sender, email, token, kind="alert")
    return sub


async def confirm_alert_subscription(session: AsyncSession, *, token: str) -> AlertSubscription:
    sub = (
        await session.execute(
            select(AlertSubscription).where(AlertSubscription.confirmation_token == token)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise SubscriptionError("Unknown or expired confirmation token")
    sub.confirmed = True
    sub.confirmation_token = None
    await session.commit()
    return sub


async def unsubscribe_alert(session: AsyncSession, *, token: str) -> None:
    sub = (
        await session.execute(
            select(AlertSubscription).where(AlertSubscription.confirmation_token == token)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise SubscriptionError("Unknown unsubscribe token")
    sub.unsubscribed_at = datetime.now(UTC)
    await session.commit()


# ---------------------------------------------------------------------------
# Newsletter subscriptions
# ---------------------------------------------------------------------------


async def create_newsletter_subscription(
    session: AsyncSession,
    email_sender: EmailSender,
    *,
    email: str,
    language: str = "ca",
) -> NewsletterSubscription:
    existing = (
        await session.execute(
            select(NewsletterSubscription).where(NewsletterSubscription.email == email.lower())
        )
    ).scalar_one_or_none()

    token = _new_token()
    if existing is not None:
        existing.confirmation_token = token
        existing.confirmed = False
        existing.unsubscribed_at = None
        existing.language = language
        sub = existing
    else:
        sub = NewsletterSubscription(
            email=email.lower(),
            language=language,
            confirmed=False,
            confirmation_token=token,
        )
        session.add(sub)

    await session.commit()
    await _send_confirmation(email_sender, email, token, kind="newsletter")
    return sub


async def confirm_newsletter_subscription(
    session: AsyncSession, *, token: str
) -> NewsletterSubscription:
    sub = (
        await session.execute(
            select(NewsletterSubscription).where(NewsletterSubscription.confirmation_token == token)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise SubscriptionError("Unknown or expired confirmation token")
    sub.confirmed = True
    sub.confirmation_token = None
    await session.commit()
    return sub


async def unsubscribe_newsletter(session: AsyncSession, *, token: str) -> None:
    sub = (
        await session.execute(
            select(NewsletterSubscription).where(NewsletterSubscription.confirmation_token == token)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise SubscriptionError("Unknown unsubscribe token")
    sub.unsubscribed_at = datetime.now(UTC)
    await session.commit()


# ---------------------------------------------------------------------------


def _new_token() -> str:
    return secrets.token_urlsafe(32)


async def _send_confirmation(
    sender: EmailSender, recipient: str, token: str, *, kind: Literal["alert", "newsletter"]
) -> None:
    site = get_settings().backend_cors_origins.split(",")[0].strip().rstrip("/")
    confirm_url = f"{site}/confirm/{kind}/{token}"
    subject = (
        "Confirma la teva subscripció — Monitor Parlamentari"
        if kind == "alert"
        else "Confirma la subscripció a la newsletter — Monitor Parlamentari"
    )
    body = (
        "Hola,\n\n"
        "Ens has demanat rebre informació de Monitor Parlamentari. "
        "Per finalitzar la subscripció, fes clic a l'enllaç següent:\n\n"
        f"{confirm_url}\n\n"
        "Si no has demanat aquesta subscripció, ignora aquest correu.\n\n"
        "— Monitor Parlamentari\n"
    )
    await sender.send(EmailMessage(to=recipient, subject=subject, body_text=body))
