"""LLM provider interface and implementations for topic classification.

Each provider is an async callable that takes a fully rendered prompt and
returns a list of ``ClassifierResult`` objects. Providers are stateless;
they're constructed from settings at request time.

To add a new provider:

1. Implement :class:`Classifier` (an ABC with a single ``classify`` method).
2. Register it in :func:`build_classifier` keyed by the provider name used in
   ``Settings.llm_provider``.
3. Cover JSON parsing in ``app.classify.service.parse_classifier_response``
   tests so any provider with the same JSON shape benefits.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.classify.prompts import build_user_prompt, system_prompt_for
from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ClassifierResult:
    """A single (topic_slug, confidence) decision from the LLM."""

    slug: str
    confidence: float


class ClassifierError(RuntimeError):
    """Raised when a classifier fails irrecoverably or returns malformed output."""


class Classifier(ABC):
    """Async LLM classifier interface.

    Implementations receive the (already-filtered) ``topic_slugs`` for the
    classification knowledge base being run, plus the ``kind`` so they can
    pick the right system prompt. ``kind`` is one of ``'theme'``,
    ``'sdg'``; see :mod:`app.classify.prompts`.
    """

    name: str  # short label used in logs and ``InitiativeTopic.classified_by``

    @abstractmethod
    async def classify(
        self,
        *,
        title: str,
        topic_slugs: list[tuple[str, str]],
        kind: str = "theme",
    ) -> list[ClassifierResult]: ...


class _ChatCompletionsClassifier(Classifier):
    """Shared implementation for OpenAI-compatible chat completions APIs.

    Both Mistral La Plateforme and the locally-hosted Qwen via Ollama expose
    OpenAI-compatible ``/v1/chat/completions`` endpoints, so the wire format
    is identical aside from the auth header and the model id.
    """

    def __init__(self, *, base_url: str, model: str, api_key: str | None, name: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self.name = name

    async def classify(
        self,
        *,
        title: str,
        topic_slugs: list[tuple[str, str]],
        kind: str = "theme",
    ) -> list[ClassifierResult]:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt_for(kind)},
                {
                    "role": "user",
                    "content": build_user_prompt(title=title, topic_slugs=topic_slugs),
                },
            ],
            "temperature": 0,
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await _retrying_post(
                client, f"{self._base_url}/v1/chat/completions", body, headers
            )

        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            raise ClassifierError(f"Unexpected response shape from {self.name}") from e

        return parse_classifier_response(content, allowed_slugs={s for s, _ in topic_slugs})


class MistralClassifier(_ChatCompletionsClassifier):
    """Mistral La Plateforme — preferred provider per CLAUDE.md."""

    def __init__(self, settings: Settings) -> None:
        if not settings.mistral_api_key:
            raise ClassifierError("MISTRAL_API_KEY is not configured")
        super().__init__(
            base_url="https://api.mistral.ai",
            model="mistral-small-latest",
            api_key=settings.mistral_api_key,
            name="llm:mistral-small",
        )


class QwenClassifier(_ChatCompletionsClassifier):
    """Local Qwen via an Ollama-compatible server."""

    def __init__(self, settings: Settings) -> None:
        super().__init__(
            base_url=settings.qwen_base_url,
            model="qwen2.5:7b-instruct",
            api_key=None,
            name="llm:qwen2.5-7b",
        )


class AnthropicClassifier(Classifier):
    """Claude Haiku via the Anthropic Messages API.

    Anthropic's API does not implement OpenAI's /chat/completions, so the
    body shape and content extraction differ from the chat-completions
    classifiers above.
    """

    name = "llm:claude-haiku"

    def __init__(self, settings: Settings) -> None:
        if not settings.anthropic_api_key:
            raise ClassifierError("ANTHROPIC_API_KEY is not configured")
        self._api_key = settings.anthropic_api_key

    async def classify(
        self,
        *,
        title: str,
        topic_slugs: list[tuple[str, str]],
        kind: str = "theme",
    ) -> list[ClassifierResult]:
        body = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 512,
            "system": system_prompt_for(kind),
            "messages": [
                {"role": "user", "content": build_user_prompt(title=title, topic_slugs=topic_slugs)}
            ],
        }
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "anthropic-version": "2023-06-01",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await _retrying_post(
                client, "https://api.anthropic.com/v1/messages", body, headers
            )

        try:
            blocks = response.json()["content"]
            content = next(b["text"] for b in blocks if b.get("type") == "text")
        except (KeyError, StopIteration, json.JSONDecodeError) as e:
            raise ClassifierError("Unexpected response shape from Anthropic") from e

        return parse_classifier_response(content, allowed_slugs={s for s, _ in topic_slugs})


# ---------------------------------------------------------------------------


async def _retrying_post(
    client: httpx.AsyncClient,
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
) -> httpx.Response:
    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=20),
            retry=retry_if_exception_type((httpx.HTTPError,)),
            reraise=True,
        ):
            with attempt:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                return response
    except RetryError as e:
        raise ClassifierError(f"LLM request failed: {e}") from e
    raise RuntimeError("Unreachable")  # mypy


def parse_classifier_response(content: str, *, allowed_slugs: set[str]) -> list[ClassifierResult]:
    """Parse the JSON array returned by the LLM, filtering to allowed slugs.

    The system prompt forbids markdown fences, but real-world models still
    produce them sometimes; we strip the most common pattern defensively.
    Slugs not in ``allowed_slugs`` are dropped with a warning so a
    hallucinated topic never reaches the database. Confidences are clamped to
    ``[0.0, 1.0]``.
    """
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]  # drop the fence's language tag
        text = text.strip("`").strip()

    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise ClassifierError(f"Classifier did not return valid JSON: {content!r}") from e
    if not isinstance(raw, list):
        raise ClassifierError(f"Classifier did not return a JSON array: {content!r}")

    results: list[ClassifierResult] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        slug = item.get("slug")
        confidence = item.get("confidence")
        if not isinstance(slug, str) or not isinstance(confidence, (int, float)):
            continue
        if slug not in allowed_slugs:
            log.warning("classify.unknown_slug", slug=slug)
            continue
        results.append(
            ClassifierResult(slug=slug, confidence=max(0.0, min(1.0, float(confidence))))
        )
    return results


def build_classifier(settings: Settings | None = None) -> Classifier:
    """Pick the classifier configured by ``Settings.llm_provider``.

    Falls back to the keyword classifier if the configured LLM provider
    requires an API key that isn't set, so the topic charts work even
    before the user has wired Mistral / Anthropic / Qwen.
    """
    from app.classify.keyword import KeywordClassifier  # local import: cycles

    s = settings or get_settings()
    if s.llm_provider == "keyword":
        return KeywordClassifier()
    try:
        if s.llm_provider == "mistral":
            return MistralClassifier(s)
        if s.llm_provider == "anthropic":
            return AnthropicClassifier(s)
        if s.llm_provider == "local_qwen":
            return QwenClassifier(s)
    except ClassifierError as e:
        log.warning(
            "classify.fallback_to_keyword",
            requested=s.llm_provider,
            reason=str(e),
        )
        return KeywordClassifier()
    raise ClassifierError(f"Unknown llm_provider: {s.llm_provider}")
