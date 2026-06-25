"""FastAPI application entry point.

This module wires up the FastAPI app: middleware, routers, lifespan, logging.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app import __version__
from app.api import (
    agenda,
    align,
    chambers,
    daily_question,
    dump,
    game,
    groups,
    health,
    initiatives,
    legislatures,
    metrics,
    newsletter_preview,
    persons,
    push,
    stats,
    subscriptions,
    topics,
    votes,
)
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.rate_limit import limiter

configure_logging()
log = get_logger(__name__)
settings = get_settings()


_DEFAULT_SECRET = "change-me-in-production-please"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run startup and shutdown tasks."""
    # Refuse to boot in production with the placeholder secret. The
    # default value used to silently propagate when an operator forgot
    # to set ``SECRET_KEY`` in .env; any token signed with it would be
    # trivially forgeable. Failing fast here makes the misconfiguration
    # visible.
    if settings.is_production and settings.secret_key == _DEFAULT_SECRET:
        raise RuntimeError(
            "SECRET_KEY is the default placeholder in production. "
            "Set the SECRET_KEY env var to a random 64-char string."
        )
    log.info("backend.startup", version=__version__, environment=settings.environment)
    yield
    log.info("backend.shutdown")


_docs_enabled = settings.backend_docs_public or not settings.is_production

app = FastAPI(
    title="Hola Política API",
    description=(
        "Open data API for the Spanish Congress. Vote tracking, deputies, "
        "initiatives, topics, agenda, stats. EUPL-1.2 / CC-BY 4.0."
    ),
    version="0.1.0",
    lifespan=lifespan,
    # In production the Swagger UI and ReDoc HTML are hidden — the
    # OpenAPI JSON spec is still served so internal tooling and the
    # /apidocs static page on the frontend can reference endpoints.
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json",
)

# ---------------------------------------------------------------------------
# Rate limiting (slowapi)
# ---------------------------------------------------------------------------
# Applied selectively via decorators on the abuse-sensitive POSTs
# (subscriptions, push). The Limiter lives in :mod:`app.core.rate_limit`
# so the routers and the ASGI middleware reference the SAME instance —
# slowapi keeps the request counter on the instance, two different
# Limiter objects each get their own bucket and the limits silently
# never trigger.
app.state.limiter = limiter
# slowapi's exported handler is typed against `RateLimitExceeded` while
# Starlette's `add_exception_handler` expects the wider `Exception` in
# the callable annotation. The runtime shape is correct (Starlette
# dispatches by exception type), so this is a pure typing mismatch.
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach defensive HTTP headers to every response.

    None of the headers below carry credentials or affect caching; they're
    a baseline against MIME sniffing, click-jacking and referer leakage
    that nginx / Cloudflare would otherwise have to set for us. HSTS is
    only attached in production — local dev runs over plain HTTP and the
    header would persist in browsers and break the next dev session.
    """

    async def dispatch(
        self, request: Request, call_next: Any
    ) -> Response:  # pragma: no cover — trivial wiring
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        # The API serves JSON — never frame it.
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), camera=(), microphone=()"
        )
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# CORS
#
# The bulk ``/dump/*`` endpoints are explicitly designed for journalists,
# academics and other third-party JS clients to fetch directly from the
# browser without proxying. The data is already public by law and the
# dump payloads carry no auth context, so opening them up to ``*`` is
# safe. Everything else stays scoped to the configured
# ``cors_origins_list`` (our own frontend, admin tooling, etc.).
#
# Implementation: one ASGI dispatcher that owns two pre-built
# CORSMiddleware instances (one open, one restricted) and forwards each
# request to whichever matches the URL prefix. Each middleware keeps its
# own immutable state, so the dispatcher is safe under concurrency.
class _PathAwareCORSDispatch:
    """ASGI middleware that picks one of two CORS policies by path prefix."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        default_origins: list[str],
        open_origins: list[str],
        allow_methods: list[str],
        allow_headers: list[str],
    ) -> None:
        # Build two independent CORS middlewares wrapping the same
        # downstream app. Whichever we delegate to per-request handles
        # its own preflight + header injection.
        self._open = CORSMiddleware(
            app,
            allow_origins=open_origins,
            allow_credentials=False,
            allow_methods=allow_methods,
            allow_headers=allow_headers,
        )
        self._default = CORSMiddleware(
            app,
            allow_origins=default_origins,
            allow_credentials=False,
            allow_methods=allow_methods,
            allow_headers=allow_headers,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path_value: Any = scope.get("path", "") if scope.get("type") == "http" else ""
        path = path_value if isinstance(path_value, str) else ""
        target = self._open if path.startswith("/dump/") else self._default
        await target(scope, receive, send)


app.add_middleware(
    _PathAwareCORSDispatch,
    default_origins=settings.cors_origins_list,
    open_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(chambers.router)
app.include_router(legislatures.router)
app.include_router(persons.router)
app.include_router(topics.router)
app.include_router(initiatives.router)
app.include_router(votes.router)
app.include_router(groups.router)
app.include_router(metrics.router)
app.include_router(stats.router)
app.include_router(subscriptions.router)
app.include_router(newsletter_preview.router)
app.include_router(agenda.router)
app.include_router(align.router)
app.include_router(game.router)
app.include_router(daily_question.router)
app.include_router(push.router)
app.include_router(dump.router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint with basic info."""
    return {
        "name": "Hola Política API",
        "version": __version__,
        "docs": "/docs",
        "license": "EUPL-1.2",
        "data_license": "CC-BY 4.0",
    }
