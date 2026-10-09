"""Issue a free key for the bulk downloads (``/dump/*``).

No account and no email round-trip: whoever asks gets a key on the spot,
having said who they are, what for, and accepted the attribution terms.
That is enough to know who reuses the dataset in bulk and to have their
word that they will cite it. A key can be revoked by hand (``revoked``).
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_access import hash_key
from app.core.rate_limit import limiter
from app.db.session import get_session
from app.models import ApiKey

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

LICENSE = "CC BY 4.0"
ATTRIBUTION = "Dades: Hola Política (holapolitica.org), a partir del Congreso de los Diputados"


class ApiKeyRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=160)
    purpose: str = Field(min_length=10, max_length=1000)
    accept_terms: bool


class ApiKeyIssued(BaseModel):
    key: str
    license: str = LICENSE
    attribution: str = ATTRIBUTION


@router.post("", response_model=ApiKeyIssued)
@limiter.limit("5/hour")
async def issue_key(
    request: Request, body: ApiKeyRequest, session: AsyncSession = Depends(get_session)
) -> ApiKeyIssued:
    if not body.accept_terms:
        raise HTTPException(status_code=400, detail="Cal acceptar les condicions de reutilització.")
    key = "hp_" + secrets.token_urlsafe(24)
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    session.add(
        ApiKey(
            key_hash=hash_key(key),
            key_prefix=key[:11],
            email=str(body.email).lower(),
            name=body.name.strip(),
            purpose=body.purpose.strip(),
            created_ip=ip,
        )
    )
    await session.commit()
    return ApiKeyIssued(key=key)
