"""Checking a law's summary against its text, and summarising from the text.

Two contracts:

- the consistency parser only keeps disagreements someone can point at,
  and an unreadable answer is "unknown", never "ok";
- a bill whose text has been read is summarised from its measures, with
  their articles, not from the preamble.
"""

from __future__ import annotations

import json

import pytest

import app.services.plain_summary as ps
from app.services.plain_summary import summary_input_body
from app.services.summary_check import build_check_input, parse_check

POINTS = {
    "es": [
        {"text": "Crea un gravamen sobre patrimonios de más de 50 millones.", "ref": "Art. 3"},
        {"text": "El tipo es del 2 % anual.", "ref": None},
    ],
    "ca": [
        {"text": "Crea un gravamen sobre patrimonis de més de 50 milions.", "ref": "Art. 3"},
        {"text": "El tipus és del 2 % anual.", "ref": None},
    ],
}


# ── parse_check ──────────────────────────────────────────────────────────


def test_no_issues_is_ok() -> None:
    check = parse_check('{"issues": []}')
    assert check is not None
    assert check.verdict == "ok"


def test_contradiction_beats_unsupported() -> None:
    raw = json.dumps(
        {
            "issues": [
                {"kind": "unsupported", "summary_says": "desde 2027", "text_says": None},
                {
                    "kind": "contradiction",
                    "summary_says": "patrimonios de más de 3 millones",
                    "text_says": "más de 50 millones (Art. 3)",
                },
            ]
        }
    )
    check = parse_check(f"Aquí está:\n{raw}\n")
    assert check is not None
    assert check.verdict == "contradiction"
    assert [i.kind for i in check.issues] == ["unsupported", "contradiction"]
    assert check.issues[1].text_says == "más de 50 millones (Art. 3)"


def test_contradiction_without_a_passage_is_only_unsupported() -> None:
    raw = '{"issues": [{"kind": "contradiction", "summary_says": "3 millones", "text_says": null}]}'
    check = parse_check(raw)
    assert check is not None
    assert check.verdict == "unsupported"


@pytest.mark.parametrize(
    "item",
    [
        {"kind": "bias", "summary_says": "algo", "text_says": "otra"},
        {"kind": "contradiction", "summary_says": "", "text_says": "50 millones"},
        "contradiction",
    ],
)
def test_unusable_issues_are_dropped(item: object) -> None:
    check = parse_check(json.dumps({"issues": [item]}))
    assert check is not None
    assert check.verdict == "ok"


def test_issues_are_capped_and_clipped() -> None:
    long = "palabra " * 200
    raw = json.dumps(
        {"issues": [{"kind": "unsupported", "summary_says": long, "text_says": None}] * 5}
    )
    check = parse_check(raw)
    assert check is not None
    assert len(check.issues) == 3
    assert len(check.issues[0].summary_says) <= 240


@pytest.mark.parametrize("raw", ["", "no puedo", "{not json}", '{"verdict": "ok"}', "[1, 2]"])
def test_unreadable_answer_is_unknown(raw: str) -> None:
    assert parse_check(raw) is None


# ── build_check_input ───────────────────────────────────────────────────


def test_check_input_carries_both_sides() -> None:
    data = json.loads(
        build_check_input(
            title="Proposición de Ley del Gravamen sobre la Concentración de Riqueza",
            plain_title="Impuesto a las grandes fortunas",
            summary="Grava los patrimonios de más de 3 millones.",
            points=POINTS["es"] + [{"text": "  ", "ref": "Art. 9"}],
        )
    )
    assert data["resumen"] == "Grava los patrimonios de más de 3 millones."
    assert data["titular"] == "Impuesto a las grandes fortunas"
    assert data["medidas_del_texto"] == [
        "Crea un gravamen sobre patrimonios de más de 50 millones. (Art. 3)",
        "El tipo es del 2 % anual.",
    ]


# ── summary_input_body ──────────────────────────────────────────────────


def test_body_prefers_the_text_measures() -> None:
    body = summary_input_body(
        text_points=POINTS, object_text="Exposición de motivos...", summary=None, lang="es"
    )
    assert body is not None
    lines = body.splitlines()
    assert lines[0].startswith("Medidas que establece el texto")
    assert lines[1] == "- Crea un gravamen sobre patrimonios de más de 50 millones. (Art. 3)"
    assert lines[2] == "- El tipo es del 2 % anual."
    assert "Exposición" not in body


def test_catalan_body_uses_catalan_measures_or_falls_back() -> None:
    ca = summary_input_body(text_points=POINTS, object_text=None, summary=None, lang="ca")
    assert ca is not None and "50 milions" in ca and ca.startswith("Mesures")
    only_es = summary_input_body(
        text_points={"es": POINTS["es"], "ca": []}, object_text=None, summary=None, lang="ca"
    )
    assert only_es is not None and "50 millones" in only_es


@pytest.mark.parametrize("points", [None, {}, {"es": []}, {"es": [{"text": "", "ref": None}]}])
def test_body_without_measures_falls_back_to_preamble_then_summary(
    points: dict[str, list[dict[str, str | None]]] | None,
) -> None:
    body = summary_input_body(text_points=points, object_text="Preámbulo", summary="Feed")
    assert body == "Preámbulo"
    assert summary_input_body(text_points=points, object_text=None, summary="Feed") == "Feed"
    assert summary_input_body(text_points=points, object_text=None, summary=None) is None


@pytest.mark.asyncio
async def test_the_model_reads_the_measures(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str]] = []

    async def fake_llm(_settings: object, *, system: str, user: str) -> str:
        seen.append((system, user))
        return "Crea un gravamen sobre los patrimonios de más de 50 millones."

    monkeypatch.setattr(ps, "_call_llm_for_text", fake_llm)
    body = summary_input_body(text_points=POINTS, object_text="Preámbulo", summary=None)
    result = await ps.generate_plain_summary(
        title="Gravamen sobre la Concentración de Riqueza",
        body=body,
        lang="es",
        kind="proposicion_ley",
    )
    assert result.text is not None and "50 millones" in result.text
    system, user = seen[0]
    assert "(Art. 3)" in user and "Preámbulo" not in user
    # The law prompt tells the model where the figures come from.
    assert "MEDIDAS del texto" in system


@pytest.mark.asyncio
async def test_rewrite_translates_with_the_large_model(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    from app.core.config import get_settings
    from app.ingest.congreso import bootstrap

    models: list[tuple[str, str]] = []

    async def fake_llm(settings: object, *, system: str, user: str) -> str:
        model = str(getattr(settings, "mistral_model", ""))
        if "traductor" in system:
            models.append(("translate", model))
            return "Crea un gravamen sobre els patrimonis de més de 50 milions."
        if "TITULAR" in system:
            return "Gravamen sobre els patrimonis de més de 50 milions"
        models.append(("summary", model))
        return "Crea un gravamen sobre los patrimonios de más de 50 millones."

    monkeypatch.setattr(ps, "_call_llm_for_text", fake_llm)
    row = SimpleNamespace(
        title_original="Gravamen sobre la Concentración de Riqueza",
        text_points=POINTS,
        object_text=None,
        summary=None,
        type="proposicion_ley",
    )
    assert await bootstrap.rewrite_initiative_summary(row)  # type: ignore[arg-type]
    settings = get_settings()
    assert ("summary", settings.mistral_model) in models
    assert ("translate", settings.law_text_verify_model) in models
    assert "50 milions" in row.plain_summary_ca  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_every_translation_uses_the_large_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """The import and repair paths call translate_summary without settings."""
    from app.core.config import get_settings

    models: list[str] = []
    systems: list[str] = []

    async def fake_llm(settings: object, *, system: str, user: str) -> str:
        models.append(str(getattr(settings, "mistral_model", "")))
        systems.append(system)
        return "Modifica la Llei d'Enjudiciament Civil."

    monkeypatch.setattr(ps, "_call_llm_for_text", fake_llm)
    result = await ps.translate_summary(
        text="Modifica la Ley de Enjuiciamiento Civil.", target_lang="ca"
    )
    assert models == [get_settings().law_text_verify_model]
    # Even the large model turned "Crea una ley" into "Proposa una llei"
    # until the prompt pinned the opening verb's tense and mood.
    assert "MATEIX temps i mode" in systems[0]
    assert result.text == "Modifica la Llei d'Enjudiciament Civil."
