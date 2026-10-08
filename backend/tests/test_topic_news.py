"""Google News feed URL per locale.

Google only serves its canonical edition triples (hl, gl, ceid)
directly; anything else is a 302 to the canonical URL, which is how
the Catalan feed broke (``hl=ca&gl=ES`` without ``ceid``). The
expected triples below are the redirect targets Google returned on
2026-10-08.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest

from app.services.topic_news import NEWS_BASE_URL, _build_feed_url


def _params(url: str) -> dict[str, str]:
    parts = urlsplit(url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == NEWS_BASE_URL
    return {k: v[0] for k, v in parse_qs(parts.query).items()}


@pytest.mark.parametrize(
    ("locale", "hl", "gl", "ceid"),
    [
        ("ca", "ca-ES", "ES", "ES:ca"),
        ("es", "es", "ES", "ES:es"),
        ("en", "en-US", "US", "US:en"),
    ],
)
def test_feed_url_uses_canonical_edition(locale: str, hl: str, gl: str, ceid: str) -> None:
    params = _params(_build_feed_url("Aigua neta i sanejament", locale))
    assert params == {
        "q": "Aigua neta i sanejament Congreso España",
        "hl": hl,
        "gl": gl,
        "ceid": ceid,
    }


def test_feed_url_falls_back_to_catalan() -> None:
    assert _build_feed_url("Habitatge", "fr") == _build_feed_url("Habitatge", "ca")


def test_feed_url_encodes_query() -> None:
    url = _build_feed_url("Aigua neta i sanejament", "ca")
    assert "q=Aigua+neta+i+sanejament+Congreso+Espa%C3%B1a" in url
