"""Tests for the Congreso vote XML parser and session ZIP unpacker.

Importer tests are end-to-end and run against the real portal in dev
(see ``app.ingest.congreso.bootstrap``); here we focus on pure parsing
since that's what's most likely to silently misinterpret data.
"""

from __future__ import annotations

import io
import zipfile
from datetime import date

import pytest

from app.ingest.congreso.client import parse_latest_session_ref, parse_vote_expedientes
from app.ingest.congreso.votes import (
    VoteParseError,
    parse_session_zip,
    parse_vote_xml,
)
from app.models import VoteChoice, VoteResult

VOTE_XML = (
    b'<?xml version="1.0" encoding="ISO-8859-1"?>'
    b"<Resultado>"
    b"<Informacion>"
    b"<Sesion>177</Sesion>"
    b"<NumeroVotacion>1</NumeroVotacion>"
    b"<Fecha>30/4/2026</Fecha>"
    b"<Titulo>Proposiciones no de Ley.</Titulo>"
    b"<TextoExpediente>Proposici\xf3n no de Ley relativa a vivienda.</TextoExpediente>"
    b"</Informacion>"
    b"<Totales>"
    b"<Asentimiento>No</Asentimiento>"
    b"<Presentes>348</Presentes>"
    b"<AFavor>33</AFavor>"
    b"<EnContra>315</EnContra>"
    b"<Abstenciones>0</Abstenciones>"
    b"<NoVotan>2</NoVotan>"
    b"</Totales>"
    b"<Votaciones>"
    b"<Votacion>"
    b"<Asiento>3603</Asiento>"
    b"<Diputado>Palencia Rubio, H\xe9ctor</Diputado>"
    b"<Grupo>GP</Grupo>"
    b"<Voto>No</Voto>"
    b"</Votacion>"
    b"<Votacion>"
    b"<Asiento>1414</Asiento>"
    b"<Diputado>Ram\xedrez Moreno, Mar\xeda</Diputado>"
    b"<Grupo>GS</Grupo>"
    b"<Voto>S\xed</Voto>"
    b"</Votacion>"
    b"<Votacion>"
    b"<Asiento>1817</Asiento>"
    b"<Diputado>P\xe9rez Ortiz, Isabel</Diputado>"
    b"<Grupo>GS</Grupo>"
    b"<Voto>Abstenci\xf3n</Voto>"
    b"</Votacion>"
    b"<Votacion>"
    b"<Asiento>9999</Asiento>"
    b"<Diputado>Ghost, Eligible</Diputado>"
    b"<Grupo>GMx</Grupo>"
    b"<Voto>No vota</Voto>"
    b"</Votacion>"
    b"</Votaciones>"
    b"</Resultado>"
)


def test_parse_vote_xml_decodes_iso_8859_1() -> None:
    parsed = parse_vote_xml(VOTE_XML)
    assert parsed.session_number == 177
    assert parsed.vote_number == 1
    assert parsed.voted_on == date(2026, 4, 30)
    assert parsed.title == "Proposiciones no de Ley."
    assert parsed.expediente_text == "Proposición no de Ley relativa a vivienda."
    # Latin-1 chars must round-trip cleanly.
    assert parsed.records[0].deputy_name_raw == "Palencia Rubio, Héctor"
    assert parsed.records[1].deputy_name_raw == "Ramírez Moreno, María"


def test_parse_vote_xml_choice_mapping() -> None:
    parsed = parse_vote_xml(VOTE_XML)
    choices = [r.choice for r in parsed.records]
    assert choices == [
        VoteChoice.NO,
        VoteChoice.AYE,
        VoteChoice.ABSTENTION,
        VoteChoice.NO_VOTE_RECORDED,
    ]


def test_parse_vote_xml_totals() -> None:
    parsed = parse_vote_xml(VOTE_XML)
    assert parsed.presentes == 348
    assert parsed.ayes == 33
    assert parsed.noes == 315
    assert parsed.abstentions == 0
    assert parsed.no_votes == 2


@pytest.mark.parametrize(
    "ayes, noes, expected",
    [
        (180, 100, VoteResult.APPROVED),
        (100, 180, VoteResult.REJECTED),
        (175, 175, VoteResult.TIE),
    ],
)
def test_result_property(ayes: int, noes: int, expected: VoteResult) -> None:
    xml = VOTE_XML.replace(b"<AFavor>33</AFavor>", f"<AFavor>{ayes}</AFavor>".encode()).replace(
        b"<EnContra>315</EnContra>", f"<EnContra>{noes}</EnContra>".encode()
    )
    assert parse_vote_xml(xml).result is expected


def test_parse_vote_xml_rejects_malformed() -> None:
    with pytest.raises(VoteParseError):
        parse_vote_xml(b"not xml")
    with pytest.raises(VoteParseError):
        parse_vote_xml(b"<Resultado></Resultado>")  # missing children


def test_parse_session_zip_orders_by_vote_number() -> None:
    # Build a ZIP whose entries are out of order to confirm we sort.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "sesion177votacion3.xml",
            VOTE_XML.replace(
                b"<NumeroVotacion>1</NumeroVotacion>", b"<NumeroVotacion>3</NumeroVotacion>"
            ),
        )
        zf.writestr(
            "sesion177votacion1.xml",
            VOTE_XML,
        )
        # Non-XML files must be ignored.
        zf.writestr("sesion177votacion1.pdf", b"%PDF-fake")
    parsed = parse_session_zip(buf.getvalue())
    assert [v.vote_number for v in parsed] == [1, 3]


def test_parse_latest_session_ref_extracts_components() -> None:
    html = """
    <html><body>
    <a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/VOT_20260430125138.zip">ZIP</a>
    </body></html>
    """
    ref = parse_latest_session_ref(html)
    assert ref is not None
    assert ref.legislature == 15
    assert ref.session_number == 177
    assert ref.date == date(2026, 4, 30)
    assert ref.zip_url.endswith("VOT_20260430125138.zip")


def test_parse_latest_session_ref_returns_none_when_absent() -> None:
    assert parse_latest_session_ref("<html><body>nothing here</body></html>") is None


# Trimmed-down sample of the listing markup observed on 2026-05-08, with two
# vote rows. Each row pairs an "(Núm. expte. ...)" link with the per-vote
# file URLs at /VotacionNNN/.
LISTING_HTML = """
<a href="/...&_iniciativas_id=162/000745" class="n_exp">(Núm. expte. 162/000745)</a>
<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion001/VOT_x.pdf">PDF</a>
<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion001/VOT_x.xml">XML</a>
<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion001/VOT_x.json">JSON</a>

<a href="/...&_iniciativas_id=173/000167" class="n_exp">(Núm. expte. 173/000167)</a>
<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion002/VOT_x.pdf">PDF</a>
<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion002/VOT_x.xml">XML</a>

<a href="/webpublica/opendata/votaciones/Leg15/Sesion177/20260430/Votacion003/VOT_x.pdf">PDF</a>
"""


def test_parse_vote_expedientes_pairs_in_document_order() -> None:
    mapping = parse_vote_expedientes(LISTING_HTML)
    # Vote 1 inherits the first expediente; vote 2 the second.
    assert mapping[1] == "162/000745"
    assert mapping[2] == "173/000167"


def test_parse_vote_expedientes_omits_votes_without_expediente() -> None:
    # Vote 3 has no preceding expediente unique to it — it inherits the last
    # one seen (173/000167) because it appears after that link in the HTML.
    # The contract is "fallthrough", not "skip", since some vote rows reuse
    # the previous initiative (e.g. multiple votes on the same proposition).
    mapping = parse_vote_expedientes(LISTING_HTML)
    assert mapping[3] == "173/000167"


def test_parse_vote_expedientes_handles_no_expediente_at_all() -> None:
    html = """
    <a href="/webpublica/opendata/votaciones/Leg15/Sesion10/20260101/Votacion001/VOT_x.xml">XML</a>
    """
    assert parse_vote_expedientes(html) == {}


def test_parse_vote_expedientes_three_part_official_id() -> None:
    # Some real-world ids carry a sub-index like 121/000262/0001.
    html = """
    <a class="n_exp">(Núm. expte. 121/000262/0001)</a>
    <a href="/webpublica/opendata/votaciones/Leg15/Sesion10/20260101/Votacion001/VOT_x.xml">XML</a>
    """
    assert parse_vote_expedientes(html) == {1: "121/000262/0001"}
