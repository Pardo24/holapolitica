#!/bin/sh
# One-off: rewrite every summary and headline with the current model+prompt.
#
# Three stages, each with the model that fits it and the pace that model's
# rate limit allows (the API states both in x-ratelimit-* headers):
#
#   mistral-small-4   100 req/min    100.000 tokens/min
#   mistral-large-3    15 req/min    400.000 tokens/min
#
#   1. Headlines for summaries that already have none — short calls, so the
#      request limit binds: small, 0.65 s apart.
#   2. The 1.5k initiatives, rewritten end to end. Their input is a whole
#      bill (~2.700 tokens), so the TOKEN limit binds: small would be capped
#      at ~35 calls/min anyway, and large has four times the token budget
#      for the same wall clock. Large, 4.2 s apart.
#   3. The historical vote archive — short texts, small, 0.65 s apart.
#
# Each stage is idempotent and picks up where it left off, so it is safe to
# re-run after an interruption. The env goes on the `docker exec`, not in
# the .env, so the daily cron jobs keep their own settings.
set -eu

LOG=${LOG:-/var/log/holapolitica-regen.log}
C=holapolitica-backend-1
SMALL="-e MISTRAL_MODEL=mistral-small-latest -e LLM_MIN_INTERVAL_S=0.65"
LARGE="-e MISTRAL_MODEL=mistral-large-latest -e LLM_MIN_INTERVAL_S=4.2"

stage() {
  label="$1"
  envflags="$2"
  code="$3"
  echo "=== $label — $(date -u)" >> "$LOG"
  # shellcheck disable=SC2086  # the env flags are meant to word-split
  docker exec -w /app $envflags "$C" python -c "$code" >> "$LOG" 2>&1
}

stage "1. headlines for existing summaries (small)" "$SMALL" '
import asyncio
from app.ingest.congreso.bootstrap import generate_plain_titles
async def main():
    print(await generate_plain_titles(lang="es"), flush=True)
    print(await generate_plain_titles(lang="ca"), flush=True)
asyncio.run(main())
'

stage "2. initiatives rewritten end to end (large)" "$LARGE" '
import asyncio
from app.ingest.congreso.bootstrap import regenerate_initiative_summaries
print(asyncio.run(regenerate_initiative_summaries()), flush=True)
'

stage "3. the vote archive: summaries, translations, headlines (small)" "$SMALL" '
import asyncio
from app.ingest.congreso.bootstrap import (
    generate_plain_titles,
    generate_vote_plain_summaries,
    repair_summary_language_gaps,
)
async def main():
    print(await generate_vote_plain_summaries(lang="es"), flush=True)
    print(await repair_summary_language_gaps(), flush=True)
    print(await generate_plain_titles(lang="es"), flush=True)
    print(await generate_plain_titles(lang="ca"), flush=True)
asyncio.run(main())
'

echo "=== done — $(date -u)" >> "$LOG"
