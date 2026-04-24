"""Single-shot smoke test of the configured classifier."""

import asyncio
import sys

from app.classify.providers import build_classifier
from app.classify.service import ClassificationService
from app.db.session import AsyncSessionLocal


async def main(initiative_id: int = 1) -> None:
    classifier = build_classifier()
    print(f"classifier: {classifier.name}")
    async with AsyncSessionLocal() as session:
        n = await ClassificationService(session, classifier).classify_initiative(initiative_id)
        print(f"topics assigned: {n}")


if __name__ == "__main__":
    arg = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    asyncio.run(main(arg))
