"""Minimal Bluesky / AT Protocol client for posting vote announcements.

We don't pull in the full ``atproto`` SDK — the only operation we need
is ``com.atproto.repo.createRecord`` against the Personal Data Server,
preceded by a session login that returns the access JWT. Two HTTP
calls, both already supported by httpx which is in the dependency
tree.

Lifecycle:

    async with BlueskyClient.from_settings() as client:
        await client.post_with_link(text, url)

The client raises :class:`BlueskySocialError` for any operational
failure (bad credentials, network, malformed response). Worker code
catches the error and logs it so a transient outage doesn't kill the
whole batch.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from types import TracebackType
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


class BlueskySocialError(RuntimeError):
    """Operational failure while talking to Bluesky."""


@dataclass(frozen=True, slots=True)
class _Session:
    access_jwt: str
    did: str


_URL_RE = re.compile(rb"https?://[^\s)]+", re.IGNORECASE)


def _byte_indices_for_url(text: str, url: str) -> tuple[int, int] | None:
    """Return (byteStart, byteEnd) for ``url`` inside ``text``.

    AT Protocol facets use UTF-8 byte offsets (not code-point offsets)
    so we encode the text and search the raw bytes. Returning ``None``
    when the URL is missing keeps the caller's flow tidy — the post
    still goes out, just without a clickable link facet.
    """
    encoded = text.encode("utf-8")
    target = url.encode("utf-8")
    idx = encoded.find(target)
    if idx == -1:
        return None
    return (idx, idx + len(target))


class BlueskyClient:
    """Async context manager wrapping a single session against a PDS."""

    def __init__(self, handle: str, app_password: str, pds_url: str) -> None:
        self.handle = handle
        self.app_password = app_password
        # Strip a trailing slash so ``f"{pds}/xrpc/..."`` is always valid.
        self.pds_url = pds_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._session: _Session | None = None

    @classmethod
    def from_settings(cls) -> BlueskyClient | None:
        """Build a client from environment-bound settings.

        Returns ``None`` when the publisher is disabled or any of the
        required credentials are unset, so the caller can no-op
        cleanly. The worker uses this to skip the post step entirely
        until the operator turns it on.
        """
        s = get_settings()
        if not s.bluesky_enable:
            return None
        if not s.bluesky_handle or not s.bluesky_app_password:
            return None
        return cls(
            handle=s.bluesky_handle,
            app_password=s.bluesky_app_password,
            pds_url=s.bluesky_pds_url,
        )

    async def __aenter__(self) -> BlueskyClient:
        self._client = httpx.AsyncClient(
            timeout=20.0,
            headers={
                "User-Agent": "monitor-parlamentari-social/0.1 (+https://www.holapolitica.org)",
            },
        )
        await self._login()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._client is not None:
            await self._client.aclose()

    async def _login(self) -> None:
        assert self._client is not None
        url = f"{self.pds_url}/xrpc/com.atproto.server.createSession"
        try:
            resp = await self._client.post(
                url,
                json={
                    "identifier": self.handle,
                    "password": self.app_password,
                },
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:  # network or 4xx/5xx
            raise BlueskySocialError(f"Bluesky login failed: {e}") from e
        data: Any = resp.json()
        access = data.get("accessJwt")
        did = data.get("did")
        if not isinstance(access, str) or not isinstance(did, str):
            raise BlueskySocialError("Bluesky login returned malformed session.")
        self._session = _Session(access_jwt=access, did=did)
        log.info("bluesky.login.ok", handle=self.handle, did=did)

    async def post_with_link(self, text: str, url: str) -> str:
        """Publish a status post with a clickable link facet.

        Returns the AT-URI of the created record on success; raises
        :class:`BlueskySocialError` otherwise. Bluesky's frontend will
        unfurl ``url``'s Open Graph card automatically — we don't need
        to attach a thumbnail blob ourselves.

        The post text is capped at 300 graphemes by Bluesky; we leave
        the truncation to the caller so it can choose what to clip.
        """
        if self._client is None or self._session is None:
            raise BlueskySocialError("BlueskyClient must be used as an async context.")

        # Build the link facet so the URL is clickable in the Bluesky UI.
        facets: list[dict[str, Any]] = []
        idx = _byte_indices_for_url(text, url)
        if idx is not None:
            facets.append(
                {
                    "index": {"byteStart": idx[0], "byteEnd": idx[1]},
                    "features": [
                        {"$type": "app.bsky.richtext.facet#link", "uri": url}
                    ],
                }
            )

        record = {
            "$type": "app.bsky.feed.post",
            "text": text,
            "createdAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "langs": ["ca", "es"],
            "facets": facets,
        }
        body = {
            "repo": self._session.did,
            "collection": "app.bsky.feed.post",
            "record": record,
        }
        endpoint = f"{self.pds_url}/xrpc/com.atproto.repo.createRecord"
        try:
            resp = await self._client.post(
                endpoint,
                headers={"Authorization": f"Bearer {self._session.access_jwt}"},
                json=body,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise BlueskySocialError(f"Bluesky createRecord failed: {e}") from e

        data: Any = resp.json()
        uri = data.get("uri")
        if not isinstance(uri, str):
            raise BlueskySocialError("Bluesky createRecord returned malformed body.")
        return uri
