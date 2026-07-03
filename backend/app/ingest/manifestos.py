"""Electoral-manifesto ingestion: PDF → literal commitments → review → DB.

The "Programa vs. voto" pipeline. Three stages, deliberately separated
so a human ALWAYS reviews before anything reaches the site:

1. ``extract`` — walk the manifesto PDF page by page, ask the LLM for
   commitment sentences mapped to our theme taxonomy, and — the
   neutrality backbone — **verify each quote is a literal substring of
   the page text** (whitespace-normalised). Non-literal output is
   dropped, not fixed. Results land in a JSONL review file.
2. Human review — read/edit the JSONL (drop misclassified rows).
3. ``import`` — load the reviewed JSONL into ``manifesto_points``,
   idempotent per (group, election, topic, quote).

Usage (inside the backend container)::

    python -m app.ingest.manifestos extract programa.pdf gp-socialista \
        --election 2023-07 --source-url https://... --out review.jsonl
    python -m app.ingest.manifestos import review.jsonl

Neutrality contract (CLAUDE.md "mirall, no megàfon"): quotes only,
verbatim, page-referenced. The extractor selects what the party itself
wrote; the site never paraphrases a promise and never judges whether
it was kept.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal
from app.models import ManifestoPoint, Topic
from app.services.plain_summary import _call_llm_for_text

configure_logging()
log = get_logger(__name__)

# Pages are processed in windows this size; big enough for context,
# small enough that the model quotes precisely.
_PAGES_PER_CHUNK = 2
# Cap per (chunk) so one dense page can't flood the review file.
_MAX_POINTS_PER_CHUNK = 6

_PROMPT_TEMPLATE = """\
Eres un documentalista que extrae COMPROMISOS ELECTORALES de un
programa de partido español, de forma NEUTRAL y LITERAL.

Recibirás el texto de una o dos páginas del programa. Extrae las
frases que expresan un compromiso de acción concreto ("aprobaremos…",
"impulsaremos…", "derogaremos…", "garantizaremos…").

REGLAS ESTRICTAS:
- CITA LITERAL: copia la frase EXACTAMENTE como aparece, sin corregir
  ni acortar con "...". Una frase completa (o dos consecutivas como
  máximo).
- Asigna cada cita a UN tema de esta lista (usa el slug tal cual):
{topics}
- Solo compromisos de acción; ignora diagnósticos, críticas al rival y
  autoelogios.
- Máximo {max_points} citas por fragmento; elige las más concretas.
- Si el fragmento no contiene compromisos, devuelve una lista vacía.

Devuelve SOLO este JSON:
{{"points": [{{"quote": "...", "topic_slug": "..."}}]}}
"""


@dataclass(slots=True)
class ExtractedPoint:
    group_slug: str
    election: str
    topic_slug: str
    quote: str
    page: int
    source_url: str | None


def _normalise(text: str) -> str:
    """Whitespace/diacritics-stable form for literal-substring checks."""
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def _pdf_pages(path: Path) -> list[str]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return [(page.extract_text() or "") for page in reader.pages]


async def _theme_slugs() -> list[str]:
    async with AsyncSessionLocal() as session:
        rows = (
            (await session.execute(select(Topic.slug).where(Topic.kind == "theme"))).scalars().all()
        )
    return sorted(rows)


async def extract(
    pdf_path: Path,
    group_slug: str,
    election: str,
    source_url: str | None,
    out_path: Path,
    start_page: int = 1,
    end_page: int | None = None,
) -> int:
    """Stage 1: PDF → JSONL of literal, page-referenced commitments."""
    settings = get_settings()
    slugs = await _theme_slugs()
    prompt = _PROMPT_TEMPLATE.format(
        topics="\n".join(f"  - {s}" for s in slugs),
        max_points=_MAX_POINTS_PER_CHUNK,
    )

    pages = _pdf_pages(pdf_path)
    last = min(end_page or len(pages), len(pages))
    written = 0
    seen_quotes: set[str] = set()

    with out_path.open("w", encoding="utf-8") as out:
        for i in range(start_page - 1, last, _PAGES_PER_CHUNK):
            chunk_pages = pages[i : i + _PAGES_PER_CHUNK]
            chunk_text = "\n".join(chunk_pages)
            if len(chunk_text.strip()) < 200:
                continue  # cover / images / TOC noise
            try:
                raw = await _call_llm_for_text(settings, system=prompt, user=chunk_text[:12000])
            except Exception as exc:
                log.warning("manifesto.extract.llm_failed", page=i + 1, error=str(exc))
                await asyncio.sleep(2)
                continue

            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`").strip()
                if "\n" in cleaned:
                    cleaned = cleaned.split("\n", 1)[1].strip()
            s, e = cleaned.find("{"), cleaned.rfind("}")
            if s < 0 or e <= s:
                continue
            try:
                payload = json.loads(cleaned[s : e + 1])
            except json.JSONDecodeError:
                log.warning("manifesto.extract.bad_json", page=i + 1, raw=raw[:150])
                continue

            norm_chunk = _normalise(chunk_text)
            for item in (payload.get("points") or [])[:_MAX_POINTS_PER_CHUNK]:
                quote = str(item.get("quote", "")).strip()
                topic_slug = str(item.get("topic_slug", "")).strip()
                if not quote or topic_slug not in slugs:
                    continue
                if len(quote) < 25 or len(quote) > 600:
                    continue
                norm_quote = _normalise(quote)
                # THE literalness gate: the quote must exist verbatim
                # (modulo whitespace/case) in the pages it came from.
                if norm_quote not in norm_chunk:
                    log.info("manifesto.extract.non_literal_drop", page=i + 1)
                    continue
                if norm_quote in seen_quotes:
                    continue
                seen_quotes.add(norm_quote)
                # Attribute to the first chunk page containing the quote.
                page_no = i + 1
                for offset, page_text in enumerate(chunk_pages):
                    if norm_quote in _normalise(page_text):
                        page_no = i + 1 + offset
                        break
                point = ExtractedPoint(
                    group_slug=group_slug,
                    election=election,
                    topic_slug=topic_slug,
                    quote=quote,
                    page=page_no,
                    source_url=source_url,
                )
                out.write(json.dumps(asdict(point), ensure_ascii=False) + "\n")
                written += 1
            # Pace for provider rate limits.
            await asyncio.sleep(1.2)

    log.info("manifesto.extract.done", points=written, out=str(out_path))
    return written


async def import_points(jsonl_path: Path) -> int:
    """Stage 3: reviewed JSONL → manifesto_points (idempotent)."""
    imported = 0
    async with AsyncSessionLocal() as session:
        for line in jsonl_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            exists = (
                await session.execute(
                    select(ManifestoPoint.id)
                    .where(ManifestoPoint.group_slug == row["group_slug"])
                    .where(ManifestoPoint.election == row["election"])
                    .where(ManifestoPoint.topic_slug == row["topic_slug"])
                    .where(ManifestoPoint.quote == row["quote"])
                )
            ).scalar_one_or_none()
            if exists is not None:
                continue
            session.add(
                ManifestoPoint(
                    group_slug=row["group_slug"],
                    election=row["election"],
                    topic_slug=row["topic_slug"],
                    quote=row["quote"],
                    page=row.get("page"),
                    source_url=row.get("source_url"),
                )
            )
            imported += 1
        await session.commit()
    log.info("manifesto.import.done", imported=imported)
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_extract = sub.add_parser("extract")
    p_extract.add_argument("pdf", type=Path)
    p_extract.add_argument("group_slug")
    p_extract.add_argument("--election", default="2023-07")
    p_extract.add_argument("--source-url", default=None)
    p_extract.add_argument("--out", type=Path, default=Path("manifesto_review.jsonl"))
    p_extract.add_argument("--start-page", type=int, default=1)
    p_extract.add_argument("--end-page", type=int, default=None)

    p_import = sub.add_parser("import")
    p_import.add_argument("jsonl", type=Path)

    args = parser.parse_args()
    if args.cmd == "extract":
        asyncio.run(
            extract(
                args.pdf,
                args.group_slug,
                args.election,
                args.source_url,
                args.out,
                start_page=args.start_page,
                end_page=args.end_page,
            )
        )
    else:
        asyncio.run(import_points(args.jsonl))


if __name__ == "__main__":
    main()
