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


# --- election news merge ----------------------------------------------------

from datetime import UTC, datetime, timedelta  # noqa: E402

from app.services.topic_news import NewsItem, merge_news  # noqa: E402


def _item(title: str, source: str, hours_ago: float | None, url: str | None = None) -> NewsItem:
    when = (
        None
        if hours_ago is None
        else datetime(2026, 10, 21, 12, tzinfo=UTC) - timedelta(hours=hours_ago)
    )
    return NewsItem(
        title=f"{title} - {source}",
        url=url or f"https://n/{source}/{title}",
        source=source,
        published_at=when,
    )


def test_merge_newest_first_without_repeats() -> None:
    a = [_item("Pacto electoral A", "El País", 5), _item("Lista B", "RTVE", 1)]
    b = [
        _item("Pacto electoral A", "La Vanguardia", 2),
        _item("Lista C", "Público", 3, url="https://n/RTVE/Lista B"),
    ]
    out = merge_news([a, b])
    # Same headline from another outlet and the same link are repeats.
    assert [(i.title, i.source) for i in out] == [
        ("Lista B", "RTVE"),
        ("Pacto electoral A", "El País"),
    ]


def test_merge_caps_each_outlet_and_strips_the_suffix() -> None:
    feed = [_item(f"Llista {n}", "Demòcrata", n) for n in range(10)] + [
        _item("Altra llista", "3Cat", 20)
    ]
    out = merge_news([feed], per_source=3)
    assert [i.title for i in out] == ["Llista 0", "Llista 1", "Llista 2", "Altra llista"]


def test_merge_puts_undated_items_last() -> None:
    out = merge_news(
        [[_item("Candidats sense data", "X", None), _item("Candidats amb data", "Y", 30)]]
    )
    assert [i.title for i in out] == ["Candidats amb data", "Candidats sense data"]


@pytest.mark.parametrize(
    ("title", "kept"),
    [
        ("Llistes d'ERC a les eleccions espanyoles del 29-N: qui acompanya Gabriel Rufián?", True),
        ("Albiol veu molt complicat un acord d'investidura PP-Junts", True),
        ("Front Ampli desmenteix contactes amb el PSOE", True),
        ("El PSOE aparta de sus listas electorales a cuatro diputados", True),
        (
            "Turquia, Qatar, Pakistan i Indonèsia tanquen un pacte estratègic en indústria de Defensa",
            False,
        ),
    ],
)
def test_only_election_headlines_stay(title: str, kept: bool) -> None:
    out = merge_news([[_item(title, "Mitjà", 1)]])
    assert bool(out) is kept
