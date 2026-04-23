"""Email-based subscription system for alerts and newsletter.

Two subscription types share the same double-opt-in flow:

- ``AlertSubscription`` — granular subscriptions to a topic, person or group;
  one email is sent when a relevant event lands (e.g. a new vote on a
  followed topic).
- ``NewsletterSubscription`` — weekly digest sent on a fixed schedule.

Both use a confirmation token generated at signup and emailed to the user.
Until the token is hit nothing else is sent. ``unsubscribed_at`` and a
deletion endpoint together implement RGPD-compliant withdrawal.
"""

from app.alerts.email import EmailMessage, EmailSender, build_sender
from app.alerts.service import (
    SubscriptionError,
    confirm_alert_subscription,
    confirm_newsletter_subscription,
    create_alert_subscription,
    create_newsletter_subscription,
    unsubscribe_alert,
    unsubscribe_newsletter,
)

__all__ = [
    "EmailMessage",
    "EmailSender",
    "SubscriptionError",
    "build_sender",
    "confirm_alert_subscription",
    "confirm_newsletter_subscription",
    "create_alert_subscription",
    "create_newsletter_subscription",
    "unsubscribe_alert",
    "unsubscribe_newsletter",
]
