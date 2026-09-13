"""Shared HTTP transport for LLM calls: spacing, backoff, and a clear stop.

Every call to an LLM provider (plain summaries, translations, topic
classification, "who does this affect") goes through :func:`post_llm`.
It exists because production runs on Mistral's free plan, which allows
very few requests per minute:

- **Spacing.** Calls are serialised process-wide with a minimum interval
  (``Settings.llm_min_interval_s``), so a batch job can never burst past
  the per-minute limit however fast its loop runs.
- **Backoff.** A 429 or 5xx is retried a few times, honouring the
  provider's ``Retry-After`` when it sends one, instead of failing the
  row on the first refusal.
- **Clear stop.** When the provider reports a limit of zero requests per
  minute (Mistral's ``x-ratelimit-limit-req-minute: 0``: plan inactive or
  quota exhausted), retrying can't help. We raise
  :class:`LLMUnavailableError` at once so batch jobs can stop early and the
  logs say why, rather than burning hundreds of doomed calls.
"""

from __future__ import annotations

import asyncio
import time
import weakref
from typing import Any

import httpx

from app.core.logging import get_logger

log = get_logger(__name__)


class LLMUnavailableError(RuntimeError):
    """The provider refuses every request (e.g. a 0 requests/minute limit)."""


_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 4
_BACKOFF_S = (5.0, 15.0, 45.0)
_MAX_WAIT_S = 120.0

# Indirection so tests can observe waits without really sleeping.
_sleep = asyncio.sleep

# Time of the last call in this process. RQ runs each job through its own
# ``asyncio.run``, so the lock is kept per event loop (a lock can't be
# shared across loops) while the timestamp is process-wide.
_last_call = 0.0
_locks: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = (
    weakref.WeakKeyDictionary()
)


def _lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    lock = _locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _locks[loop] = lock
    return lock


async def _throttle(min_interval_s: float) -> None:
    global _last_call
    async with _lock():
        wait = _last_call + min_interval_s - time.monotonic()
        if wait > 0:
            await _sleep(wait)
        _last_call = time.monotonic()


def _retry_after_s(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if raw is None:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None


def _quota_is_zero(response: httpx.Response) -> bool:
    limit = str(response.headers.get("x-ratelimit-limit-req-minute", ""))
    return limit.strip() == "0"


async def post_llm(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_body: dict[str, Any],
    headers: dict[str, str],
    min_interval_s: float,
) -> httpx.Response:
    """POST to an LLM endpoint with spacing and bounded retries.

    Returns the successful response. Raises :class:`LLMUnavailableError`
    when the provider reports a zero quota, or the last
    :class:`httpx.HTTPError` once the retries are exhausted.
    """
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        await _throttle(min_interval_s)
        last_attempt = attempt == _MAX_ATTEMPTS
        try:
            response = await client.post(url, json=json_body, headers=headers)
        except httpx.TransportError as e:
            if last_attempt:
                raise
            delay = _BACKOFF_S[attempt - 1]
            log.warning("llm.transport_retry", attempt=attempt, delay_s=delay, error=str(e))
            await _sleep(delay)
            continue

        if response.status_code == 429 and _quota_is_zero(response):
            log.error("llm.quota_zero", url=url, body=response.text[:200])
            raise LLMUnavailableError(
                "LLM provider allows 0 requests/minute: the plan is inactive or out of quota"
            )
        if response.status_code in _RETRY_STATUSES and not last_attempt:
            delay = min(_retry_after_s(response) or _BACKOFF_S[attempt - 1], _MAX_WAIT_S)
            log.warning("llm.retry", status=response.status_code, attempt=attempt, delay_s=delay)
            await _sleep(delay)
            continue

        response.raise_for_status()
        return response
    raise RuntimeError("unreachable")  # the loop always returns or raises
