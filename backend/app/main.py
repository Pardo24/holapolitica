"""FastAPI application entry point.

This module wires up the FastAPI app: middleware, routers, lifespan, logging.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app import __version__
from app.api import (
    agenda,
    chambers,
    dump,
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

configure_logging()
log = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run startup and shutdown tasks."""
    log.info("backend.startup", version=__version__, environment=settings.environment)
    yield
    log.info("backend.shutdown")


app = FastAPI(
    title="Hola Política API",
    description=(
        "Open data API for the Spanish Congress. Vote tracking, deputies, "
        "initiatives, topics, agenda, stats. EUPL-1.2 / CC-BY 4.0."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


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
