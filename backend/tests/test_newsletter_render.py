"""Tests for the newsletter renderer.

Renderer tests use a hand-built ``Digest`` so we don't need a DB. They
guard against editorial drift (CLAUDE.md "mirall, no megàfon"): explicit
asserts make sure no evaluative wording leaks into the output.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.metrics.calc import CohesionResult
from app.models import (
    Chamber,
    ChamberLevel,
    InitiativeStatus,
    Legislature,
    LegislatureStatus,
    VoteResult,
)
from app.newsletter.digest import (
    Digest,
    DigestInitiativeEntry,
    DigestVoteEntry,
    is_empty,
)
from app.newsletter.render import render_html, render_subject, render_text


def _chamber() -> Chamber:
    c = Chamber(
        slug="es-congreso",
        name_ca="Congrés dels Diputats",
        name_es="Congreso de los Diputados",
        name_en="Spanish Congress of Deputies",
        country="ES",
        region=None,
        level=ChamberLevel.NATIONAL,
        website="https://www.congreso.es",
    )
    c.id = 1
    return c


def _legislature() -> Legislature:
    leg = Legislature(
        chamber_id=1,
        number="XV",
        name_ca="XV legislatura",
        name_es="XV legislatura",
        name_en="15th legislature",
        start_date=date(2023, 8, 17),
        end_date=None,
        status=LegislatureStatus.ACTIVE,
    )
    leg.id = 1
    return leg


def _vote_entry(
    *, vote_id: int, ayes: int, noes: int, result: VoteResult, expediente: str | None = None
) -> DigestVoteEntry:
    return DigestVoteEntry(
        vote_id=vote_id,
        title="Proposició no de Llei sobre habitatge",
        description="Text breu de l'expedient.",
        voted_at=datetime(2026, 4, 30, 12, 0, tzinfo=UTC),
        result=result,
        ayes=ayes,
        noes=noes,
        abstentions=2,
        margin=abs(ayes - noes),
        expediente_raw=expediente,
        cohesion=[
            CohesionResult(
                group_slug="gp-popular",
                group_name_short="GP Popular",
                group_color_hex="#1E88E5",
                cohesion=1.0,
                members_voting=137,
                ayes=137,
                noes=0,
                abstentions=0,
                no_vote=0,
            ),
            CohesionResult(
                group_slug="gp-socialista",
                group_name_short="GP Socialista",
                group_color_hex="#E53935",
                cohesion=1.0,
                members_voting=120,
                ayes=0,
                noes=120,
                abstentions=0,
                no_vote=0,
            ),
        ],
    )


def _digest(**overrides: object) -> Digest:
    base = Digest(
        chamber=_chamber(),
        legislature=_legislature(),
        period_from=date(2026, 4, 27),
        period_to=date(2026, 5, 3),
        sessions_in_period=1,
        votes_in_period=12,
        most_consensual_votes=[
            _vote_entry(
                vote_id=11, ayes=348, noes=0, result=VoteResult.APPROVED, expediente="130/000040"
            ),
        ],
        closest_votes=[
            _vote_entry(
                vote_id=3, ayes=172, noes=171, result=VoteResult.APPROVED, expediente="162/000756"
            ),
            _vote_entry(
                vote_id=2, ayes=170, noes=170, result=VoteResult.TIE, expediente="162/000756"
            ),
        ],
        tied_votes=[
            _vote_entry(
                vote_id=2, ayes=170, noes=170, result=VoteResult.TIE, expediente="162/000756"
            ),
        ],
        initiatives_status_changes=[
            DigestInitiativeEntry(
                initiative_id=42,
                official_id="121/000999",
                title="Proyecto de Ley de prova",
                status=InitiativeStatus.SUBMITTED,
                submitted_at=date(2026, 5, 2),
            )
        ],
    )
    return base


def test_render_subject_includes_period_and_count() -> None:
    subject = render_subject(_digest())
    assert "Monitor Parlamentari" in subject
    assert "27" in subject and "03/05/2026" in subject
    assert "12 votacions" in subject


def test_render_html_uses_descriptive_section_titles_only() -> None:
    """Editorial guardrail: no evaluative words in HTML."""
    html = render_html(_digest(), site_url="https://example.org")

    # Allowed descriptive labels.
    assert "Votacions amb resultat més estret" in html
    assert "Votacions amb major consens" in html
    assert "Votacions empat" in html

    # Banned editorial framings — must NOT appear.
    forbidden = [
        "polèmic",
        "polèmica",
        "polémico",
        "polémica",
        "important",
        "importants",
        "destacad",
        "clau",
        "key votes",
        "votes that matter",
        "controvèrsia",
        "controversy",
        "highlight",
        "espectacular",
    ]
    lowered = html.lower()
    for term in forbidden:
        assert term not in lowered, f"Editorial wording leaked: {term!r}"


def test_render_html_links_when_site_url_given() -> None:
    html = render_html(_digest(), site_url="https://example.org")
    assert 'href="https://example.org/votes/3"' in html
    assert 'href="https://example.org/votes/11"' in html


def test_render_html_no_links_without_site_url() -> None:
    html = render_html(_digest(), site_url="")
    assert "<a href" not in html or "unsubscribe_url" not in html
    # And no href to a vote id (we only emit them when site_url is set).
    assert 'href="/votes/' not in html


def test_render_html_unsubscribe_link_optional() -> None:
    no_unsub = render_html(_digest(), site_url="x")
    assert "Cancel" not in no_unsub  # Cancel·la is the link text
    with_unsub = render_html(_digest(), site_url="x", unsubscribe_url="https://example.org/u/abc")
    assert "Cancel" in with_unsub  # "Cancel·la la subscripció" link present
    assert 'href="https://example.org/u/abc"' in with_unsub


def test_render_html_carries_expediente_when_present() -> None:
    html = render_html(_digest(), site_url="x")
    assert "162/000756" in html
    assert "130/000040" in html


def test_render_text_is_plain_no_html_tags() -> None:
    text = render_text(_digest(), site_url="https://example.org")
    assert "<" not in text
    # And the descriptive labels are still there.
    assert "estret" in text
    assert "consens" in text
    assert "https://example.org/votes/3" in text


def test_editor_note_renders_when_set() -> None:
    from dataclasses import replace

    digest_with_note = replace(
        _digest(), editor_note="Aquesta setmana hi ha hagut sessió de control."
    )
    html = render_html(digest_with_note, site_url="x")
    assert "sessió de control" in html
    text = render_text(digest_with_note)
    assert "sessió de control" in text


def test_is_empty_handles_no_data() -> None:
    base = _digest()
    empty = Digest(
        chamber=base.chamber,
        legislature=base.legislature,
        period_from=base.period_from,
        period_to=base.period_to,
        sessions_in_period=0,
        votes_in_period=0,
    )
    assert is_empty(empty)
    assert not is_empty(base)
