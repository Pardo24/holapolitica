"""What a single vote decided within its law, from the XML's subgroup lines.

The 25 June 2026 sitting voted the conversion-therapy bill ten times: six
amendments the majority turned down, then the dictamen and the organic
whole-text vote, both approved. Without the subgroup they read as one
question answered "no" six times and "yes" twice.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.ingest.congreso.votes import parse_vote_xml
from app.services.vote_stage import amendment_groups, stage_groups_for, vote_stage

DICTAMEN = "Dictámenes de Comisiones sobre iniciativas legislativas."
LAW = "Proposición de Ley Orgánica por la que se modifica la Ley Orgánica 10/1995."


def test_amendments_and_final_votes() -> None:
    pp = "Enmiendas presentadas por el Grupo Parlamentario Popular en el Congreso"
    assert vote_stage(DICTAMEN, LAW, pp, "Enmienda 26.") == "amendment"
    assert (
        vote_stage(
            DICTAMEN,
            LAW,
            "Votos particulares del Grupo Parlamentario Popular en el Congreso.",
            "Voto particular a la enmienda transaccional nº 1",
        )
        == "amendment"
    )
    assert vote_stage(DICTAMEN, LAW, "Votación del dictamen.", "Votación del dictamen.") == "final"
    assert (
        vote_stage(DICTAMEN, LAW, "Votación de conjunto.", "Votación de conjunto de la …")
        == "whole"
    )


def test_other_stages() -> None:
    assert (
        vote_stage("Toma en consideración de Proposiciones de Ley.", LAW, None) == "consideration"
    )
    assert (
        vote_stage(
            "Debates de totalidad de iniciativas de reforma del Reglamento del Congreso.",
            "Proposición de reforma del Reglamento del Congreso.",
            "Enmiendas a la totalidad de texto alternativo.",
            "Enmienda a la totalidad de texto alternativo presentada por el Grupo Parlamentario VOX.",
        )
        == "totality"
    )
    assert (
        vote_stage(
            "Enmiendas del Senado.",
            LAW,
            "Votación separada de las enmiendas.",
            "Resto de las enmiendas.",
        )
        == "senate_amendment"
    )
    assert (
        vote_stage("Enmiendas del Senado.", "Votación de conjunto de la Proposición…", None)
        == "whole"
    )
    assert (
        vote_stage(
            "Mociones consecuencia de interpelaciones urgentes.",
            "Moción…",
            "Votación separada por puntos.",
            "Punto 3.",
        )
        == "point"
    )
    assert (
        vote_stage(
            "Convalidación o derogación de Reales Decretos-leyes.",
            "Real Decreto-ley 14/2026, de 9 de junio…",
            None,
        )
        == "validation"
    )
    assert (
        vote_stage(
            "Convalidación o derogación de Reales Decretos-leyes.",
            "Tramitación como Proyecto de Ley por el procedimiento de urgencia del Real Decreto-ley 14/2026",
            None,
        )
        == "as_bill"
    )
    assert (
        vote_stage(
            "Proposiciones no de Ley.", "Proposición no de Ley del Grupo Parlamentario VOX…", None
        )
        is None
    )


def _group(slug: str, short: str, long: str) -> Any:
    return SimpleNamespace(slug=slug, name_short=short, name_long=long, color_hex="#000")


GROUPS = [
    _group("gp-popular", "GP Popular", "Grupo Parlamentario Popular en el Congreso"),
    _group("gp-popular", "GP Popular", "Grupo Parlamentario Popular"),  # an older term's row
    _group("gp-sumar", "GP Sumar", "Grupo Parlamentario Plurinacional SUMAR"),
    _group("gp-republicano", "GP Republicano", "Grupo Parlamentario Republicano"),
    _group("gp-bildu", "GP EH Bildu", "Grupo Parlamentario Euskal Herria Bildu"),
    _group("gp-mixto", "GP Mixto", "Grupo Parlamentario Mixto"),
    _group("gp-vox", "GP VOX", "Grupo Parlamentario VOX"),
]


def test_amendment_groups_in_order_once_each() -> None:
    text = (
        "Enmiendas presentadas por el Grupo Parlamentario Plurinacional SUMAR, el Grupo "
        "Parlamentario Republicano, el Grupo Parlamentario Euskal Herria Bildu y el Grupo "
        "Parlamentario Mixto (Sra. Micó Micó y Sr. Rego Candamil)."
    )
    assert [g.slug for g in amendment_groups(text, GROUPS)] == [
        "gp-sumar",
        "gp-republicano",
        "gp-bildu",
        "gp-mixto",
    ]
    pp = amendment_groups(
        "Enmiendas presentadas por el Grupo Parlamentario Popular en el Congreso", GROUPS
    )
    assert [g.name_long for g in pp] == ["Grupo Parlamentario Popular en el Congreso"]


def test_stage_groups_only_for_amendments() -> None:
    assert stage_groups_for("final", "Votación del dictamen.", None, GROUPS) == []
    signers = stage_groups_for(
        "totality",
        "Enmiendas a la totalidad de texto alternativo.",
        "Enmienda a la totalidad de texto alternativo presentada por el Grupo Parlamentario VOX.",
        GROUPS,
    )
    assert [s["slug"] for s in signers] == ["gp-vox"]


def test_parser_keeps_the_subgroup() -> None:
    xml = """<?xml version="1.0" encoding="ISO-8859-1"?><Resultado>
    <Informacion><Sesion>191</Sesion><NumeroVotacion>3</NumeroVotacion><Fecha>25/6/2026</Fecha>
    <Titulo>Dictámenes de Comisiones sobre iniciativas legislativas.</Titulo>
    <TextoExpediente>Proposición de Ley Orgánica.</TextoExpediente>
    <TituloSubGrupo>Enmiendas presentadas por el Grupo Parlamentario Popular en el Congreso</TituloSubGrupo>
    <TextoSubGrupo>Enmienda 26.</TextoSubGrupo></Informacion>
    <Totales><Asentimiento>No</Asentimiento><Presentes>349</Presentes><AFavor>138</AFavor>
    <EnContra>204</EnContra><Abstenciones>7</Abstenciones><NoVotan>1</NoVotan></Totales>
    <Votaciones></Votaciones></Resultado>""".encode("iso-8859-1")
    parsed = parse_vote_xml(xml)
    assert (
        parsed.subgroup_title
        == "Enmiendas presentadas por el Grupo Parlamentario Popular en el Congreso"
    )
    assert parsed.subgroup_text == "Enmienda 26."
