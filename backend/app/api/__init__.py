"""API routers aggregator.

Each module exposes a `router: APIRouter`. They are registered in `app.main`.
"""

from app.api import agenda, chambers, dump, health, legislatures, persons, topics, votes

__all__ = [
    "agenda",
    "chambers",
    "dump",
    "health",
    "legislatures",
    "persons",
    "topics",
    "votes",
]
