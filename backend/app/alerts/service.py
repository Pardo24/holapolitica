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
from app.models import (
    AlertSubscription,
    NewsletterSubscription,
    ParliamentaryGroup,
    Person,
    Topic,
)

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

    # Validate that the target actually exists before we go and email
    # a confirmation link. Previously an attacker could POST any int
    # against /alerts and we'd persist an orphan row + send a
    # confirmation — both DB bloat and free email amplification. The
    # SELECT cost here is one indexed lookup per request, which the
    # surrounding rate limit (10/min/IP) already caps.
    _target_table = {
        "topic": Topic,
        "person": Person,
        "group": ParliamentaryGroup,
    }[target_type]
    target_exists = (
        await session.execute(select(_target_table.id).where(_target_table.id == target_id))
    ).scalar_one_or_none() is not None
    if not target_exists:
        raise SubscriptionError(f"Unknown {target_type} id: {target_id}")

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
    # We intentionally keep ``confirmation_token`` after confirmation so
    # subsequent emails (welcome, digest, unsubscribe) can embed the
    # same token as a long-lived "manage" handle for the recipient to
    # adjust their topic_slugs or unsubscribe. See the column comment
    # on :class:`NewsletterSubscription`.
    await session.commit()
    return sub


async def set_newsletter_topic_preferences(
    session: AsyncSession,
    *,
    token: str,
    topic_slugs: list[str],
) -> NewsletterSubscription:
    """Replace the topic filter for a subscriber identified by ``token``.

    The token must match a non-unsubscribed row. Confirmation status is
    not enforced: a subscriber who clicks "manage topics" from the
    confirmation email itself should still be able to set their
    preferences in the same session, before bouncing back to read the
    welcome page.

    The ``topic_slugs`` argument is treated as authoritative — it
    REPLACES the existing list rather than appending. Callers wanting
    additive semantics must do a read-modify-write.
    """
    sub = (
        await session.execute(
            select(NewsletterSubscription).where(NewsletterSubscription.confirmation_token == token)
        )
    ).scalar_one_or_none()
    if sub is None:
        raise SubscriptionError("Unknown management token")
    if sub.unsubscribed_at is not None:
        raise SubscriptionError("Subscription is cancelled")
    sub.topic_slugs = list(topic_slugs)
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
        "Confirma la teva subscripció — Hola Política"
        if kind == "alert"
        else "Confirma la subscripció a la newsletter — Hola Política"
    )
    body_text = _render_confirmation_text(confirm_url, kind=kind)
    body_html = _render_confirmation_html(confirm_url, kind=kind)
    await sender.send(
        EmailMessage(to=recipient, subject=subject, body_text=body_text, body_html=body_html)
    )


# ---------------------------------------------------------------------------
# Confirmation email rendering
# ---------------------------------------------------------------------------
#
# We render a small bespoke HTML template inline instead of bringing in
# Jinja for this single message. Constraints (driven by Outlook + Gmail
# clipping rules):
#
#   * Inline styles only — many clients strip ``<style>`` blocks.
#   * Table-based layout for the outer containers — Outlook on Windows
#     ignores CSS flex/grid and treats divs unpredictably.
#   * Max width 560px so the content stays readable on phones.
#   * Brand colors mirror the website tokens in ``frontend/app/globals.css``
#     (``--paper``, ``--ink``, ``--accent``) converted from oklch to the
#     nearest sRGB hex equivalent. Keep these in sync if the design tokens
#     change.

_BRAND_PAPER = "#fbf9f4"  # --paper
_BRAND_INK = "#1a2138"  # --ink
_BRAND_INK_2 = "#4a5675"  # --ink-2
_BRAND_INK_3 = "#7c87a3"  # --ink-3
_BRAND_RULE = "#d8d4c6"  # --rule
_BRAND_ACCENT = "#3a5da8"  # --accent

_FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"
_FONT_SERIF = "Georgia, 'Times New Roman', serif"


def _confirmation_copy(kind: Literal["alert", "newsletter"]) -> dict[str, str]:
    """Catalan source-of-truth copy for the confirmation email."""
    if kind == "newsletter":
        return {
            "preheader": (
                "Confirma la teva subscripció a la newsletter setmanal de Hola Política."
            ),
            "headline": "Confirma la teva subscripció",
            "lede": (
                "Ens has demanat rebre la newsletter setmanal de Hola Política — "
                "un correu cada divendres amb les votacions de la setmana al Congrés. "
                "Sense valoracions, només dades."
            ),
            "cta": "Confirmar subscripció",
            "after_cta": (
                "Si l'enllaç no funciona, copia i enganxa aquesta adreça al teu navegador:"
            ),
            "footer_ignore": (
                "Si no has demanat aquesta subscripció, ignora aquest correu i no "
                "passarà res — el teu correu no s'afegirà a cap llista."
            ),
        }
    return {
        "preheader": ("Confirma la teva subscripció als avisos de Hola Política."),
        "headline": "Confirma els teus avisos",
        "lede": (
            "Ens has demanat rebre avisos de Hola Política — un correu només "
            "quan arribi una nova votació o iniciativa relacionada amb el tema, "
            "persona o grup que segueixes. Sense valoracions, només dades."
        ),
        "cta": "Confirmar subscripció",
        "after_cta": ("Si l'enllaç no funciona, copia i enganxa aquesta adreça al teu navegador:"),
        "footer_ignore": (
            "Si no has demanat aquesta subscripció, ignora aquest correu i no "
            "passarà res — el teu correu no s'afegirà a cap llista."
        ),
    }


def _render_confirmation_text(confirm_url: str, *, kind: Literal["alert", "newsletter"]) -> str:
    copy = _confirmation_copy(kind)
    return (
        f"Hola,\n\n"
        f"{copy['lede']}\n\n"
        f"Per finalitzar la subscripció, obre aquest enllaç al teu navegador:\n\n"
        f"{confirm_url}\n\n"
        f"{copy['footer_ignore']}\n\n"
        f"— Hola Política · Mirall, no megàfon.\n"
    )


def _render_confirmation_html(confirm_url: str, *, kind: Literal["alert", "newsletter"]) -> str:
    """Return a self-contained HTML document for the confirmation email."""
    from html import escape

    copy = _confirmation_copy(kind)
    safe_url = escape(confirm_url, quote=True)

    # Styles — kept as local constants so the f-string body stays readable.
    s_wrap = (
        f"background-color:{_BRAND_PAPER};margin:0;padding:24px 12px;"
        f"font-family:{_FONT_STACK};color:{_BRAND_INK};"
    )
    s_outer_table = "width:100%;border-collapse:collapse;"
    s_card = (
        f"max-width:560px;width:100%;margin:0 auto;background-color:#ffffff;"
        f"border:1px solid {_BRAND_RULE};border-radius:10px;border-collapse:separate;"
    )
    s_header_cell = (
        f"padding:28px 32px 16px;border-bottom:1px solid {_BRAND_RULE};"
        f"font-family:{_FONT_STACK};"
    )
    s_wordmark = (
        f"font-size:18px;font-weight:700;letter-spacing:-0.01em;color:{_BRAND_INK};"
        f"margin:0;line-height:1.2;"
    )
    s_tagline = (
        f"font-family:{_FONT_SERIF};font-style:italic;font-size:13px;"
        f"color:{_BRAND_INK_3};margin:4px 0 0;line-height:1.4;"
    )
    s_body_cell = f"padding:28px 32px;font-family:{_FONT_STACK};"
    s_eyebrow = (
        f"font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"
        f"color:{_BRAND_ACCENT};margin:0 0 10px;"
    )
    s_headline = (
        f"font-family:{_FONT_SERIF};font-size:24px;line-height:1.25;letter-spacing:-0.01em;"
        f"font-weight:600;color:{_BRAND_INK};margin:0 0 14px;"
    )
    s_paragraph = f"font-size:15px;line-height:1.55;color:{_BRAND_INK_2};margin:0 0 16px;"
    s_btn_wrap = "margin:24px 0 8px;"
    s_btn_cell = f"background-color:{_BRAND_INK};border-radius:8px;"
    s_btn_link = (
        f"display:inline-block;padding:14px 28px;font-family:{_FONT_STACK};"
        f"font-size:15px;font-weight:600;color:{_BRAND_PAPER};text-decoration:none;"
        f"border-radius:8px;"
    )
    s_fallback_label = f"font-size:13px;color:{_BRAND_INK_3};margin:18px 0 6px;"
    s_fallback_url = (
        f"font-size:12px;line-height:1.5;color:{_BRAND_ACCENT};" f"word-break:break-all;margin:0;"
    )
    s_footer_cell = (
        f"padding:18px 32px 24px;border-top:1px solid {_BRAND_RULE};"
        f"background-color:{_BRAND_PAPER};font-family:{_FONT_STACK};"
        f"border-radius:0 0 10px 10px;"
    )
    s_footer_text = f"font-size:12px;line-height:1.55;color:{_BRAND_INK_3};margin:0 0 6px;"
    # Hidden preheader (the snippet some clients show next to the subject).
    s_preheader = (
        "display:none;visibility:hidden;opacity:0;color:transparent;height:0;"
        "width:0;overflow:hidden;mso-hide:all;"
    )

    return (
        f"<!doctype html>\n"
        f'<html lang="ca">\n'
        f'<head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(copy['headline'])}</title>"
        f"</head>\n"
        f'<body style="{s_wrap}">'
        # Preheader — improves the inbox preview snippet on Gmail/Outlook.
        f'<span style="{s_preheader}">{escape(copy["preheader"])}</span>'
        f'<table role="presentation" border="0" cellspacing="0" cellpadding="0" '
        f'style="{s_outer_table}"><tr><td align="center">'
        f'<table role="presentation" border="0" cellspacing="0" cellpadding="0" '
        f'style="{s_card}">'
        # ── Header ──────────────────────────────────────────────────────
        f'<tr><td style="{s_header_cell}">'
        f'<p style="{s_wordmark}">Hola Política</p>'
        f'<p style="{s_tagline}">Mirall, no megàfon.</p>'
        f"</td></tr>"
        # ── Body ────────────────────────────────────────────────────────
        f'<tr><td style="{s_body_cell}">'
        f'<p style="{s_eyebrow}">'
        f"{'Newsletter setmanal' if kind == 'newsletter' else 'Alertes'}"
        f"</p>"
        f'<h1 style="{s_headline}">{escape(copy["headline"])}</h1>'
        f'<p style="{s_paragraph}">{escape(copy["lede"])}</p>'
        # CTA button — bullet-proof table-button pattern.
        f'<table role="presentation" border="0" cellspacing="0" cellpadding="0" '
        f'style="{s_btn_wrap}"><tr>'
        f'<td bgcolor="{_BRAND_INK}" style="{s_btn_cell}">'
        f'<a href="{safe_url}" target="_blank" rel="noopener noreferrer" '
        f'style="{s_btn_link}">{escape(copy["cta"])}</a>'
        f"</td></tr></table>"
        # Fallback URL.
        f'<p style="{s_fallback_label}">{escape(copy["after_cta"])}</p>'
        f'<p style="{s_fallback_url}">'
        f'<a href="{safe_url}" target="_blank" rel="noopener noreferrer" '
        f'style="color:{_BRAND_ACCENT};text-decoration:underline;">'
        f"{escape(confirm_url)}</a></p>"
        f"</td></tr>"
        # ── Footer ──────────────────────────────────────────────────────
        f'<tr><td style="{s_footer_cell}">'
        f'<p style="{s_footer_text}">{escape(copy["footer_ignore"])}</p>'
        f'<p style="{s_footer_text}">'
        f"Hola Política · Infraestructura cívica neutra · "
        f"Llicència EUPL-1.2"
        f"</p>"
        f"</td></tr>"
        f"</table></td></tr></table>"
        f"</body></html>\n"
    )
