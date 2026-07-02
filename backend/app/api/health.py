"""Health check endpoints for monitoring."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.ingest.quality import run_data_quality_checks
from app.services.cache import cached

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    """Verify the API is up and the database is reachable."""
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unreachable",
    }


@router.get("/health/data")
async def data_health(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    """Run the data-quality invariant checks and report the outcome.

    Exposes only aggregate counts (nothing sensitive), so it's public —
    useful both for uptime monitors and as a transparency signal. Cached
    15 min: the checks are a handful of COUNT queries but there's no
    reason to run them per request.
    """

    async def _compute() -> dict[str, Any]:
        report = await run_data_quality_checks(session)
        return {
            "status": "ok" if report.ok else "failing",
            "checks": [
                {
                    "name": c.name,
                    "ok": c.ok,
                    "violations": c.violations,
                    "detail": c.detail,
                }
                for c in report.checks
            ],
        }

    result: dict[str, Any] = await cached("health:data", 900, _compute)
    return result
