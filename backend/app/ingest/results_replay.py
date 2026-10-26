"""Store the night of a past election as result snapshots, to build and test
the results page with real numbers.

    python -m app.ingest.results_replay 2023-07

Downloads the ministry's polling-station files (app/ingest/infoelectoral.py),
replays the count in 20 stages plus the official result, and writes them as
``ElectionResultSnapshot`` rows ``step`` 1..21, replacing any there were.
The stages are spaced 12 minutes apart from 20:00 on polling day, about the
pace of a real count.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete

from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.ingest.candidacies import ELECTIONS, USER_AGENT
from app.ingest.infoelectoral import PROVINCES, URL, open_zip, parse_lists, replay
from app.models import ElectionResultSnapshot
from app.services.election_results import build

configure_logging()
log = get_logger(__name__)

MADRID = ZoneInfo("Europe/Madrid")


async def store_replay(election: str, data: bytes | None = None) -> int:
    day, seats = ELECTIONS[election]
    if data is None:
        async with httpx.AsyncClient(
            timeout=120, headers={"User-Agent": USER_AGENT}, follow_redirects=True
        ) as client:
            res = await client.get(URL.format(yyyymm=election.replace("-", "")))
            res.raise_for_status()
            data = res.content
    z = open_zip(data)
    lists = parse_lists(z)
    stages = replay(z, {PROVINCES[ine]: seats[PROVINCES[ine]] for ine in PROVINCES})
    start = datetime(day.year, day.month, day.day, 20, 0, tzinfo=MADRID)
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(ElectionResultSnapshot).where(ElectionResultSnapshot.election == election)
        )
        for step, provinces in enumerate(stages, start=1):
            official = step == len(stages)
            taken_at = (
                start + timedelta(minutes=12 * step) if not official else start + timedelta(days=4)
            )
            payload = build(election, provinces, lists, official=official, taken_at=taken_at)
            session.add(
                ElectionResultSnapshot(
                    election=election,
                    step=step,
                    source="official" if official else "replay",
                    official=official,
                    counted_pct=payload["counted_pct"],
                    taken_at=taken_at,
                    payload=payload,
                )
            )
        await session.commit()
    log.info("results.replay_stored", election=election, steps=len(stages))
    return len(stages)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("election", choices=[e for e in ELECTIONS if e != "2026-11"])
    parser.add_argument("--file", help="A local copy of the ministry's zip")
    args = parser.parse_args()
    data = None
    if args.file:
        with open(args.file, "rb") as f:
            data = f.read()
    print(asyncio.run(store_replay(args.election, data)))


if __name__ == "__main__":
    main()
