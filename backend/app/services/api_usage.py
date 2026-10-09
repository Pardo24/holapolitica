"""Weekly report of who uses the API from outside the site.

Reads the per-week counters kept by app/core/api_access.py and names the
heaviest external consumers (by IP, or by key with who asked for it).
Our own frontend never appears: it identifies itself and is not counted.

    python -m app.services.api_usage            # last complete ISO week
    python -m app.services.api_usage --current  # the week so far
"""

from __future__ import annotations

import asyncio
import sys
from collections.abc import Awaitable
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import select

from app.core.api_access import _redis, week_key
from app.db.session import AsyncSessionLocal
from app.models import ApiKey


async def _hash(key: str) -> dict[str, str]:
    return await cast(Awaitable[dict[str, str]], _redis().hgetall(key))


async def report(current: bool = False, top: int = 15) -> str:
    when = datetime.now(UTC) - (timedelta(0) if current else timedelta(days=7))
    week = week_key(when)
    counts = {k: int(v) for k, v in (await _hash(week)).items()}
    dumps = {k: int(v) for k, v in (await _hash(f"{week}:dump")).items()}
    uas = await _hash(f"{week}:ua")
    owners: dict[str, str] = {}
    prefixes = [c[4:] for c in counts if c.startswith("key:")]
    if prefixes:
        async with AsyncSessionLocal() as session:
            for prefix, name, email in (
                await session.execute(
                    select(ApiKey.key_prefix, ApiKey.name, ApiKey.email).where(
                        ApiKey.key_prefix.in_(prefixes)
                    )
                )
            ).all():
                owners[prefix] = f"{name} <{email}>"
    total = sum(counts.values())
    lines = [
        "Us extern de l'API, setmana " + week.split(":")[1],
        f"{total} peticions de {len(counts)} clients (sense comptar la web).",
        "",
    ]
    for client, n in sorted(counts.items(), key=lambda kv: -kv[1])[:top]:
        who = owners.get(client[4:], "") if client.startswith("key:") else ""
        dump = f", {dumps[client]} descàrregues" if client in dumps else ""
        ua = uas.get(client, "")
        lines.append(f"{n:7d}  {client}{dump}  {who}  [{ua[:70]}]")
    return "\n".join(lines)


if __name__ == "__main__":
    print(asyncio.run(report(current="--current" in sys.argv)))
