"""The plain-summary cleaner strips markdown the site would show literally."""

from __future__ import annotations

import pytest

from app.services.plain_summary import _strip_markdown


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "Tipifica la **violencia vicaria** y crea espacios *Barnahus*.",
            "Tipifica la violencia vicaria y crea espacios Barnahus.",
        ),
        ("Modifica la __Ley 3/2024__ sobre `ELA`.", "Modifica la Ley 3/2024 sobre ELA."),
        # Arithmetic and lone asterisks are not emphasis: left alone.
        (
            "Multiplica 2 * 3 y añade un asterisco * suelto.",
            "Multiplica 2 * 3 y añade un asterisco * suelto.",
        ),
        ("Sin formato.", "Sin formato."),
    ],
)
def test_strip_markdown(raw: str, expected: str) -> None:
    assert _strip_markdown(raw) == expected
