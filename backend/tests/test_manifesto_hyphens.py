"""Words split at a line end are rejoined before the literal check."""

from app.ingest.manifestos import _join_line_hyphens


def test_split_words_are_rejoined() -> None:
    text = "rebajaremos los tributos en el pro -\nceso edificatorio, con menos re-\ncursos"
    assert _join_line_hyphens(text) == (
        "rebajaremos los tributos en el proceso edificatorio, con menos recursos"
    )


def test_compounds_and_dashes_stay() -> None:
    assert _join_line_hyphens("el eje Norte-\nSur") == "el eje Norte-\nSur"
    assert _join_line_hyphens("dos opciones -\n1. la primera") == "dos opciones -\n1. la primera"
