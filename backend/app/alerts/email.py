"""Email sender abstraction.

We support three concrete senders:

- ``SmtpSender`` — direct SMTP via :mod:`aiosmtplib` for self-hosted setups.
- ``LogSender`` — used in dev and tests; just logs the message instead of
  sending. Activated automatically when no SMTP host is configured.

Listmonk integration is handled separately in :mod:`app.newsletter.listmonk`
because Listmonk owns the recipient list rather than us, so we delegate
sending to its API instead of reimplementing transactional email here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to: str
    subject: str
    body_text: str
    body_html: str | None = None


class EmailSender(ABC):
    @abstractmethod
    async def send(self, message: EmailMessage) -> None: ...


class LogSender(EmailSender):
    """Writes the message to the structured log instead of sending it.

    Used in dev/tests to avoid sending real email. The message body is logged
    at info level so a developer can pluck the confirmation token from the
    logs while testing the double-opt-in flow.
    """

    async def send(self, message: EmailMessage) -> None:
        log.info(
            "email.log_sender.send",
            to=message.to,
            subject=message.subject,
            body=message.body_text,
        )


class SmtpSender(EmailSender):
    def __init__(self, settings: Settings) -> None:
        if not settings.smtp_host:
            raise RuntimeError("SMTP_HOST is not configured")
        self._settings = settings

    async def send(self, message: EmailMessage) -> None:
        # aiosmtplib is imported lazily so the module can be loaded in
        # environments that haven't installed the optional email extra yet
        # (tests, dev without SMTP configured).
        import aiosmtplib

        s = self._settings
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{s.smtp_from_name} <{s.smtp_from_email}>"
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg.attach(MIMEText(message.body_text, "plain", "utf-8"))
        if message.body_html:
            msg.attach(MIMEText(message.body_html, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=s.smtp_host,
            port=s.smtp_port,
            username=s.smtp_username,
            password=s.smtp_password,
            start_tls=True,
        )


def build_sender(settings: Settings | None = None) -> EmailSender:
    s = settings or get_settings()
    if s.smtp_host:
        return SmtpSender(s)
    return LogSender()
