"""Listmonk integration for the weekly newsletter.

Listmonk owns the recipient list (subscribers, double-opt-in, unsubscribes).
Our backend pushes a generated digest to Listmonk via its REST API and
Listmonk sends it. Compared to running our own SMTP-based newsletter, this
keeps RGPD compliance simpler — Listmonk handles unsubscribe headers and the
sender reputation.

Required env vars (see ``.env.example``):

- ``LISTMONK_BASE_URL`` — e.g. ``http://localhost:9000``
- ``LISTMONK_API_USER`` — created in Listmonk admin → Settings → Users
- ``LISTMONK_API_KEY`` — the API key shown when the user is created
- ``LISTMONK_LIST_ID`` — integer id of the list, visible in the URL of the
  Lists page in admin

If any are missing the digest job logs a warning and skips the send (no
crash). Use :class:`ListmonkClient` directly when you want to push manually.
"""

from app.newsletter.listmonk import (
    ListmonkClient,
    ListmonkError,
    ListmonkNotConfigured,
)

__all__ = ["ListmonkClient", "ListmonkError", "ListmonkNotConfigured"]
