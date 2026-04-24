"""Tests for the LLM classifier response parser.

The integrations with Mistral / Anthropic / Qwen are not exercised here —
they need API keys and we don't issue real calls in CI. The parsing logic,
however, is fully testable: it's the boundary where every provider's output
must conform.
"""

from __future__ import annotations

import pytest

from app.classify.keyword import KeywordClassifier
from app.classify.prompts import (
    SDG_SYSTEM_PROMPT,
    THEME_SYSTEM_PROMPT,
    system_prompt_for,
)
from app.classify.providers import (
    ClassifierError,
    ClassifierResult,
    parse_classifier_response,
)

ALLOWED = {"habitatge", "sanitat", "educacio"}


def test_parses_simple_array() -> None:
    out = parse_classifier_response(
        '[{"slug": "habitatge", "confidence": 0.92}]', allowed_slugs=ALLOWED
    )
    assert out == [ClassifierResult(slug="habitatge", confidence=0.92)]


def test_strips_markdown_fence() -> None:
    raw = '```json\n[{"slug": "sanitat", "confidence": 0.7}]\n```'
    out = parse_classifier_response(raw, allowed_slugs=ALLOWED)
    assert out == [ClassifierResult(slug="sanitat", confidence=0.7)]


def test_drops_unknown_slugs_silently() -> None:
    raw = '[{"slug": "habitatge", "confidence": 1.0}, {"slug": "made_up", "confidence": 0.9}]'
    out = parse_classifier_response(raw, allowed_slugs=ALLOWED)
    assert out == [ClassifierResult(slug="habitatge", confidence=1.0)]


def test_clamps_confidence() -> None:
    raw = '[{"slug": "habitatge", "confidence": 1.5}, {"slug": "sanitat", "confidence": -0.2}]'
    out = parse_classifier_response(raw, allowed_slugs=ALLOWED)
    assert out == [
        ClassifierResult(slug="habitatge", confidence=1.0),
        ClassifierResult(slug="sanitat", confidence=0.0),
    ]


def test_empty_array_means_no_topics() -> None:
    assert parse_classifier_response("[]", allowed_slugs=ALLOWED) == []


def test_rejects_non_json() -> None:
    with pytest.raises(ClassifierError):
        parse_classifier_response("not json at all", allowed_slugs=ALLOWED)


def test_rejects_non_array() -> None:
    with pytest.raises(ClassifierError):
        parse_classifier_response('{"slug": "habitatge"}', allowed_slugs=ALLOWED)


def test_skips_malformed_entries() -> None:
    raw = (
        '[{"slug": "habitatge", "confidence": 0.5},'
        '{"slug": 123},'
        '"not an object",'
        '{"confidence": 0.9}]'
    )
    out = parse_classifier_response(raw, allowed_slugs=ALLOWED)
    assert out == [ClassifierResult(slug="habitatge", confidence=0.5)]


# ---------------------------------------------------------------------------
# Knowledge-base selection (theme vs SDG)
# ---------------------------------------------------------------------------


def test_system_prompt_for_theme_returns_theme_prompt() -> None:
    assert system_prompt_for("theme") is THEME_SYSTEM_PROMPT


def test_system_prompt_for_sdg_returns_sdg_prompt() -> None:
    assert system_prompt_for("sdg") is SDG_SYSTEM_PROMPT


def test_system_prompt_for_unknown_kind_raises() -> None:
    with pytest.raises(ValueError):
        system_prompt_for("not-a-kb")


def test_sdg_prompt_mentions_all_17_slugs() -> None:
    # If a slug is missing from the system prompt's definitions, the
    # classifier won't have guidance on when to pick it — guard against
    # silent regressions when editing the prompt.
    expected = [
        "sdg-01-poverty",
        "sdg-02-hunger",
        "sdg-03-health",
        "sdg-04-education",
        "sdg-05-gender-equality",
        "sdg-06-water",
        "sdg-07-energy",
        "sdg-08-decent-work",
        "sdg-09-industry-innovation",
        "sdg-10-reduced-inequalities",
        "sdg-11-sustainable-cities",
        "sdg-12-responsible-consumption",
        "sdg-13-climate",
        "sdg-14-life-below-water",
        "sdg-15-life-on-land",
        "sdg-16-peace-justice",
        "sdg-17-partnerships",
    ]
    for slug in expected:
        assert slug in SDG_SYSTEM_PROMPT, slug


async def test_keyword_classifier_returns_empty_for_sdg() -> None:
    # The keyword fallback only covers the editorial taxonomy. For SDG
    # classification we must return an empty list rather than mislead
    # consumers with low-quality matches.
    cls = KeywordClassifier()
    result = await cls.classify(
        title="Ley de vivienda social y derecho al alquiler",
        topic_slugs=[("sdg-11-sustainable-cities", "Ciudades sostenibles")],
        kind="sdg",
    )
    assert result == []


async def test_keyword_classifier_still_works_for_theme() -> None:
    cls = KeywordClassifier()
    result = await cls.classify(
        title="Proyecto de Ley de vivienda y alquiler",
        topic_slugs=[("habitatge", "Vivienda")],
        kind="theme",
    )
    assert any(r.slug == "habitatge" for r in result)
