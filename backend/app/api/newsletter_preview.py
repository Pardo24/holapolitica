"""Preview endpoint for the weekly newsletter digest.

Renders the digest exactly as it would be sent through Listmonk, so a human
can sanity-check the content before scheduling the campaign. Read-only —
clicking this never sends email.

Currently no auth: rely on the deployment to gate this behind the admin
network. Once we have an auth system this should move into the admin scope.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.newsletter.digest import build_digest, is_empty
from app.newsletter.render import render_html, render_subject, render_text

router = APIRouter(prefix="/admin/newsletter", tags=["admin"])


@router.get("/preview", response_class=HTMLResponse)
async def preview_html(
    period_to: date | None = Query(None, description="End of period (defaults to today)"),
    period_days: int = Query(7, ge=1, le=31),
    chamber_slug: str = Query("es-congreso"),
    session: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    digest = await build_digest(
        session,
        chamber_slug=chamber_slug,
        period_to=period_to,
        period_days=period_days,
    )
    if is_empty(digest):
        body = "<p>El digest està buit per al període seleccionat. " "No s'enviaria.</p>"
        return HTMLResponse(body, status_code=200)
    return HTMLResponse(render_html(digest, site_url="http://localhost:3000"))


@router.get("/preview.txt", response_class=PlainTextResponse)
async def preview_text(
    period_to: date | None = Query(None),
    period_days: int = Query(7, ge=1, le=31),
    chamber_slug: str = Query("es-congreso"),
    session: AsyncSession = Depends(get_session),
) -> PlainTextResponse:
    digest = await build_digest(
        session,
        chamber_slug=chamber_slug,
        period_to=period_to,
        period_days=period_days,
    )
    return PlainTextResponse(render_text(digest, site_url="http://localhost:3000"))


@router.get("/preview/subject", response_class=PlainTextResponse)
async def preview_subject(
    period_to: date | None = Query(None),
    period_days: int = Query(7, ge=1, le=31),
    chamber_slug: str = Query("es-congreso"),
    session: AsyncSession = Depends(get_session),
) -> PlainTextResponse:
    digest = await build_digest(
        session,
        chamber_slug=chamber_slug,
        period_to=period_to,
        period_days=period_days,
    )
    return PlainTextResponse(render_subject(digest))
