"""Who is using the API, and how much: keys, per-IP limits, usage counts.

The data is public and reuse is welcome (CC BY 4.0), but the API runs on
one small server that also renders the site. Three rules:

- **Our own frontend** sends ``X-HP-Key`` (a secret shared with the Vercel
  deployment, ``API_INTERNAL_KEYS``) on its server-side requests and is
  never limited. It is most of the traffic, from ever-changing AWS IPs.
- **Bulk downloads** (``/dump/*``) need a free key (``X-API-Key`` header or
  ``?key=``), requested on /apidocs with an email, a name, a purpose and
  the attribution terms. We then know who reuses the dataset, and they
  have agreed to cite it.
- **Everyone else** (people's browsers, scripts) is limited per IP, high
  enough for a person (or a carrier NAT full of people) and low enough to
  make a bulk scrape slow and visible. A valid key gets its own, higher
  allowance.

Every request that is not our frontend is counted per week in Redis
(``apiuse:<ISO week>``), so the weekly report (``app.services.api_usage``)
can name the heaviest external consumers.

``API_RATE_LIMIT_ENFORCE=false`` (the default) counts and logs without
refusing anything: switch it on once the frontend is sending its key, or
the site's own rendering would be the first thing limited.

Redis trouble fails open: the API never goes down over its own meter.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from urllib.parse import parse_qs

import structlog
from redis.asyncio import Redis
from sqlalchemy import select
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.services.cache import _client, _client_override

log = structlog.get_logger(__name__)

# Never metered: liveness probes and the schema.
_EXEMPT_PATHS = ("/health", "/openapi.json", "/docs", "/redoc")
_DOCS_URL = "https://www.holapolitica.org/apidocs#clau"


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def week_key(now: datetime | None = None) -> str:
    year, week, _ = (now or datetime.now(UTC)).isocalendar()
    return f"apiuse:{year}-W{week:02d}"


def _redis() -> Redis:
    return _client_override() or _client()


async def _key_is_valid(key: str) -> str | None:
    """The key's public prefix when it is a live key, else ``None``.

    Cached in Redis for five minutes either way, so a revoked key stops
    working within minutes and a valid one costs no query per request.
    """
    from app.db.session import AsyncSessionLocal
    from app.models import ApiKey

    digest = hash_key(key)
    r = _redis()
    cached = await r.get(f"apikey:{digest}")
    if cached is not None:
        return cached or None
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(ApiKey.key_prefix).where(
                    ApiKey.key_hash == digest, ApiKey.revoked.is_(False)
                )
            )
        ).first()
    prefix = row[0] if row else ""
    await r.set(f"apikey:{digest}", prefix, ex=300)
    return prefix or None


class ApiAccessMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        s = get_settings()
        self.internal = [k.strip() for k in s.api_internal_keys.split(",") if k.strip()]
        self.enforce = s.api_rate_limit_enforce
        self.anon_minute = s.api_anon_per_minute
        self.anon_hour = s.api_anon_per_hour
        self.key_hour = s.api_key_per_hour

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http" or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        if path.startswith(_EXEMPT_PATHS):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        given = headers.get("x-hp-key", "")
        if given and any(hmac.compare_digest(given, k) for k in self.internal):
            await self.app(scope, receive, send)
            return

        refusal = None
        try:
            refusal = await self._meter(scope, headers, path)
        except Exception as e:  # Redis or DB trouble: fail open.
            log.warning("api_access.meter_failed", error=str(e))
        if refusal is not None and self.enforce:
            status, body, extra = refusal
            await send(
                {
                    "type": "http.response.start",
                    "status": status,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"access-control-allow-origin", b"*"),
                        *extra,
                    ],
                }
            )
            await send({"type": "http.response.body", "body": json.dumps(body).encode()})
            return
        await self.app(scope, receive, send)

    async def _meter(
        self, scope: Scope, headers: dict[str, str], path: str
    ) -> tuple[int, dict[str, str], list[tuple[bytes, bytes]]] | None:
        # Behind Caddy, which overwrites X-Forwarded-For with the real peer.
        ip = (
            headers.get("x-forwarded-for", "").split(",")[0].strip()
            or ((scope.get("client") or ("?", 0))[0])
        )
        query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        key = headers.get("x-api-key") or (query.get("key") or [""])[0]
        prefix = await _key_is_valid(key) if key else None

        client = f"key:{prefix}" if prefix else f"ip:{ip}"
        r = _redis()
        week = week_key()
        now = int(time.time())
        pipe = r.pipeline()
        pipe.hincrby(week, client, 1)
        pipe.expire(week, 60 * 60 * 24 * 40)
        pipe.hsetnx(f"{week}:ua", client, headers.get("user-agent", "")[:160])
        pipe.expire(f"{week}:ua", 60 * 60 * 24 * 40)
        if path.startswith("/dump/"):
            pipe.hincrby(f"{week}:dump", client, 1)
            pipe.expire(f"{week}:dump", 60 * 60 * 24 * 40)
        minute_key = f"rl:{client}:m:{now // 60}"
        hour_key = f"rl:{client}:h:{now // 3600}"
        pipe.incr(minute_key)
        pipe.expire(minute_key, 120)
        pipe.incr(hour_key)
        pipe.expire(hour_key, 7200)
        res = await pipe.execute()
        per_minute, per_hour = int(res[-4]), int(res[-2])

        if path.startswith("/dump/") and not prefix:
            return (
                401,
                {
                    "detail": (
                        "Les descarregues completes necessiten una clau gratuita "
                        "(capçalera X-API-Key o ?key=). Demana-la a " + _DOCS_URL
                    )
                },
                [],
            )
        over = (
            per_hour > self.key_hour
            if prefix
            else (per_minute > self.anon_minute or per_hour > self.anon_hour)
        )
        if over:
            log.info("api_access.over_limit", client=client, path=path, enforce=self.enforce)
            return (
                429,
                {
                    "detail": (
                        "Massa peticions. Per reutilitzar les dades, fes servir les "
                        "descarregues amb clau: " + _DOCS_URL
                    )
                },
                [(b"retry-after", b"60")],
            )
        return None
