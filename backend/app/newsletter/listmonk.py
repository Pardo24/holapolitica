"""Listmonk REST API client.

We use the ``/api/campaigns`` endpoint to create — and optionally start — a
campaign on a specific list. Listmonk authenticates with HTTP Basic Auth
using ``LISTMONK_API_USER`` / ``LISTMONK_API_KEY``.

This client is intentionally narrow: only the endpoints needed to send the
weekly digest. Add new methods as we add new newsletter types.

Idempotency
-----------
Listmonk has no native "upsert" for campaigns, but every campaign carries a
unique ``name``. We use that field as our idempotency key (the caller passes
something like ``monitor-weekly-2026-W19``). :meth:`find_campaign_by_name`
walks ``GET /api/campaigns`` looking for an exact name match so a re-run
returns the existing campaign id instead of double-sending.
"""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.core.config import Settings, get_settings

CampaignStatus = Literal["draft", "scheduled", "running", "paused", "cancelled", "finished"]


class ListmonkError(RuntimeError):
    """Raised when Listmonk returns a non-2xx or unexpected payload."""


class ListmonkNotConfigured(ListmonkError):  # noqa: N818
    """Raised when LISTMONK_* env vars are missing.

    Callers can choose to skip silently (the weekly digest job does this,
    per the brief: development environments without Listmonk shouldn't crash
    the worker).
    """


def _wrap_httpx_errors(exc: httpx.HTTPError) -> ListmonkError:
    """Coerce httpx connection / timeout failures into ``ListmonkError``."""
    return ListmonkError(f"Listmonk request failed: {exc!r}")


class ListmonkClient:
    """Minimal async client for the subset of Listmonk we use."""

    def __init__(self, settings: Settings | None = None) -> None:
        s = settings or get_settings()
        if not (s.listmonk_base_url and s.listmonk_api_user and s.listmonk_api_key):
            raise ListmonkNotConfigured(
                "Listmonk is not configured. Set LISTMONK_BASE_URL, "
                "LISTMONK_API_USER and LISTMONK_API_KEY in your environment."
            )
        if s.listmonk_list_id is None:
            raise ListmonkNotConfigured("LISTMONK_LIST_ID is required.")
        self._base_url: str = s.listmonk_base_url.rstrip("/")
        self._auth: tuple[str, str] = (s.listmonk_api_user, s.listmonk_api_key)
        self._list_id: int = s.listmonk_list_id

    # ------------------------------------------------------------------
    # High-level helpers
    # ------------------------------------------------------------------

    async def send_campaign(
        self, *, name: str, subject: str, body_html: str, from_email: str
    ) -> int:
        """Create-or-reuse a campaign by ``name`` and start it.

        Idempotent: if a campaign with the same name already exists we
        return its id without re-creating it. If the existing campaign is
        already ``running`` / ``finished`` / ``cancelled`` we leave it
        alone (we'd otherwise risk double-sending). If it's still
        ``draft`` we kick it into ``running``.

        Returns the Listmonk campaign id.
        """
        existing = await self.find_campaign_by_name(name)
        if existing is not None:
            campaign_id, status = existing
            if status in ("running", "finished", "cancelled"):
                return campaign_id
            if status == "draft":
                await self._set_status(campaign_id, "running")
                return campaign_id
            # paused / scheduled: leave alone, surface the id.
            return campaign_id

        campaign_id = await self.create_draft_campaign(
            name=name, subject=subject, body_html=body_html, from_email=from_email
        )
        await self._set_status(campaign_id, "running")
        return campaign_id

    async def create_draft_campaign(
        self, *, name: str, subject: str, body_html: str, from_email: str
    ) -> int:
        """Create a draft campaign and return its id.

        Useful for ``dry_run=True`` callers: the campaign appears in the
        Listmonk admin so a human can preview it without it being sent.

        Idempotent: if a campaign with the same name already exists we
        return its id rather than creating a duplicate.
        """
        existing = await self.find_campaign_by_name(name)
        if existing is not None:
            return existing[0]

        try:
            async with httpx.AsyncClient(timeout=30.0, auth=self._auth) as client:
                response = await client.post(
                    f"{self._base_url}/api/campaigns",
                    json={
                        "name": name,
                        "subject": subject,
                        "lists": [self._list_id],
                        "from_email": from_email,
                        "type": "regular",
                        "content_type": "html",
                        "body": body_html,
                        "send_at": None,
                    },
                )
        except httpx.HTTPError as e:
            raise _wrap_httpx_errors(e) from e
        self._raise_for_status(response)
        return self._extract_campaign_id(response.json())

    async def find_campaign_by_name(self, name: str) -> tuple[int, str] | None:
        """Look up an existing campaign by exact ``name``. Returns ``(id, status)`` or ``None``.

        Listmonk's ``GET /api/campaigns?query=`` does a SQL ``ILIKE`` match
        on subject (not name), so we filter the response by name on the
        client side. Volume is low (one campaign per week) so paging
        through the first page is enough for the foreseeable future.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0, auth=self._auth) as client:
                response = await client.get(
                    f"{self._base_url}/api/campaigns",
                    params={
                        "per_page": 100,
                        "order_by": "created_at",
                        "order": "DESC",
                    },
                )
        except httpx.HTTPError as e:
            raise _wrap_httpx_errors(e) from e
        self._raise_for_status(response)

        for row in self._extract_campaign_list(response.json()):
            if row.get("name") == name:
                try:
                    return int(row["id"]), str(row.get("status", ""))
                except (KeyError, TypeError, ValueError) as e:
                    raise ListmonkError(f"Unexpected campaign list row: {row!r}") from e
        return None

    # ------------------------------------------------------------------
    # Low-level
    # ------------------------------------------------------------------

    async def _set_status(self, campaign_id: int, status: CampaignStatus) -> None:
        try:
            async with httpx.AsyncClient(timeout=30.0, auth=self._auth) as client:
                response = await client.put(
                    f"{self._base_url}/api/campaigns/{campaign_id}/status",
                    json={"status": status},
                )
        except httpx.HTTPError as e:
            raise _wrap_httpx_errors(e) from e
        self._raise_for_status(response)

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if not response.is_success:
            raise ListmonkError(f"Listmonk returned {response.status_code}: {response.text[:200]}")

    @staticmethod
    def _extract_campaign_id(payload: dict[str, Any]) -> int:
        try:
            return int(payload["data"]["id"])
        except (KeyError, TypeError, ValueError) as e:
            raise ListmonkError(f"Unexpected campaign create response: {payload!r}") from e

    @staticmethod
    def _extract_campaign_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
        """Listmonk wraps lists under ``data.results`` (paginated) — be defensive."""
        try:
            data = payload["data"]
        except KeyError as e:
            raise ListmonkError(f"Unexpected campaigns list response: {payload!r}") from e
        if isinstance(data, dict):
            results = data.get("results")
            if isinstance(results, list):
                return [r for r in results if isinstance(r, dict)]
        if isinstance(data, list):
            # Older Listmonk versions return data as a bare list.
            return [r for r in data if isinstance(r, dict)]
        raise ListmonkError(f"Unexpected campaigns list shape: {payload!r}")
