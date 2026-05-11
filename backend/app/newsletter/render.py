"""Render a :class:`Digest` to HTML and to plain text.

The HTML is intentionally simple — table-based layout, inline styles, no
external CSS or fonts — because most mail clients strip or break modern
CSS. We avoid all editorial framing per CLAUDE.md "mirall, no megàfon":
labels are descriptive ("Votacions amb resultat més estret"), never
evaluative ("Votacions polèmiques", "Decisions clau").
"""

from __future__ import annotations

from datetime import date
from html import escape

from app.newsletter.digest import Digest, DigestInitiativeEntry, DigestVoteEntry

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def render_subject(digest: Digest) -> str:
    return (
        f"Monitor Parlamentari — {_format_date_range(digest.period_from, digest.period_to)} "
        f"({digest.votes_in_period} votacions)"
    )


def render_text(digest: Digest, *, site_url: str = "") -> str:
    out: list[str] = []
    out.append(
        f"Monitor Parlamentari — Setmana de {_format_date_range(digest.period_from, digest.period_to)}"
    )
    out.append("")
    out.append(f"Cambra: {digest.chamber.name_ca}")
    out.append(f"Legislatura: {digest.legislature.name_ca}")
    out.append(f"Sessions plenàries: {digest.sessions_in_period}")
    out.append(f"Votacions: {digest.votes_in_period}")
    out.append("")

    if digest.editor_note:
        out.append("--")
        out.append(digest.editor_note.strip())
        out.append("--")
        out.append("")

    if digest.most_consensual_votes:
        out.append("Votacions amb major consens (margen més ampli):")
        for v in digest.most_consensual_votes:
            out.append(_text_vote_line(v, site_url))
        out.append("")

    if digest.closest_votes:
        out.append("Votacions amb resultat més estret (menor margen):")
        for v in digest.closest_votes:
            out.append(_text_vote_line(v, site_url))
        out.append("")

    if digest.tied_votes:
        out.append("Votacions empat:")
        for v in digest.tied_votes:
            out.append(_text_vote_line(v, site_url))
        out.append("")

    if digest.initiatives_status_changes:
        out.append("Iniciatives presentades aquesta setmana:")
        for i in digest.initiatives_status_changes:
            out.append(_text_initiative_line(i))
        out.append("")

    out.append("--")
    out.append("Aquest correu només conté dades. Cap valoració editorial.")
    out.append("Per cancel·lar la subscripció, segueix l'enllaç de baix de l'email HTML.")
    return "\n".join(out)


def render_html(digest: Digest, *, site_url: str = "", unsubscribe_url: str | None = None) -> str:
    """Render a single-column, mail-safe HTML document."""
    parts: list[str] = []
    parts.append(_HTML_HEADER)
    parts.append(_html_header_block(digest))

    if digest.editor_note:
        parts.append(
            f'<div style="{_S_NOTE}">{escape(digest.editor_note).replace(chr(10), "<br>")}</div>'
        )

    parts.append(_html_summary_table(digest))

    if digest.most_consensual_votes:
        parts.append(
            _html_section(
                "Votacions amb major consens",
                "El marge entre Sí i No és el més ample del període.",
                [_html_vote_card(v, site_url) for v in digest.most_consensual_votes],
            )
        )

    if digest.closest_votes:
        parts.append(
            _html_section(
                "Votacions amb resultat més estret",
                "El marge entre Sí i No és el més curt del període.",
                [_html_vote_card(v, site_url) for v in digest.closest_votes],
            )
        )

    if digest.tied_votes:
        parts.append(
            _html_section(
                "Votacions empat",
                "Mateix nombre de Sí i de No.",
                [_html_vote_card(v, site_url) for v in digest.tied_votes],
            )
        )

    if digest.initiatives_status_changes:
        parts.append(
            _html_section(
                "Iniciatives presentades aquesta setmana",
                None,
                [_html_initiative_row(i) for i in digest.initiatives_status_changes],
            )
        )

    parts.append(_html_footer(unsubscribe_url=unsubscribe_url))
    return "".join(parts)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


_S_NOTE = "background:#fff8e1;border-left:4px solid #fb8c00;padding:12px 14px;margin:0 0 18px 0;font-size:14px;color:#3d2c00;"
_S_BODY = (
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;"
    "font-size:15px;line-height:1.5;color:#1a1a1a;background:#fafafa;margin:0;padding:0;"
)
_S_CONTAINER = "max-width:640px;margin:0 auto;padding:24px;background:#ffffff;"
_S_H1 = "font-size:22px;font-weight:600;margin:0 0 8px 0;color:#1a1a1a;"
_S_H2 = "font-size:16px;font-weight:600;margin:24px 0 4px 0;color:#1a1a1a;"
_S_SUBTLE = "color:#6b7280;font-size:13px;margin:0 0 12px 0;"
_S_CARD = (
    "border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:0 0 10px 0;background:#ffffff;"
)
_S_BADGE_APPROVED = "background:#dcfce7;color:#14532d;"
_S_BADGE_REJECTED = "background:#fee2e2;color:#7f1d1d;"
_S_BADGE_TIE = "background:#fef9c3;color:#713f12;"


_HTML_HEADER = (
    f'<!doctype html><html lang="ca"><head><meta charset="utf-8"><title>Monitor Parlamentari</title>'
    f'</head><body style="{_S_BODY}"><div style="{_S_CONTAINER}">'
)


def _html_header_block(digest: Digest) -> str:
    return (
        f'<h1 style="{_S_H1}">Monitor Parlamentari</h1>'
        f'<p style="{_S_SUBTLE}">{escape(digest.chamber.name_ca)} · '
        f"{escape(digest.legislature.name_ca)} · "
        f"{_format_date_range(digest.period_from, digest.period_to)}</p>"
    )


def _html_summary_table(digest: Digest) -> str:
    return (
        '<table style="width:100%;border-collapse:collapse;margin:0 0 18px 0;font-size:14px;">'
        "<tr>"
        f'<td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;width:50%;">'
        f"<strong>{digest.sessions_in_period}</strong> sessions plenàries"
        "</td>"
        f'<td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;width:50%;">'
        f"<strong>{digest.votes_in_period}</strong> votacions"
        "</td>"
        "</tr></table>"
    )


def _html_section(title: str, subtitle: str | None, items: list[str]) -> str:
    parts = [f'<h2 style="{_S_H2}">{escape(title)}</h2>']
    if subtitle:
        parts.append(f'<p style="{_S_SUBTLE}">{escape(subtitle)}</p>')
    parts.extend(items)
    return "".join(parts)


def _html_vote_card(v: DigestVoteEntry, site_url: str) -> str:
    result = _result_str(v.result)
    badge_style = {
        "approved": _S_BADGE_APPROVED,
        "rejected": _S_BADGE_REJECTED,
        "tie": _S_BADGE_TIE,
    }[result]
    badge_label = {
        "approved": "Aprovada",
        "rejected": "Rebutjada",
        "tie": "Empat",
    }[result]
    link = f"{site_url.rstrip('/')}/votes/{v.vote_id}" if site_url else None
    # Pick the most readable text we have, in priority order:
    #   1) LLM plain-language summary (best for human reading)
    #   2) description (actual subject text from the expediente)
    #   3) title (procedural category — fallback only)
    subject_text = (v.plain_summary or v.description or v.title or "").strip()
    procedural = (v.title or "").strip()
    # If subject == procedural we only show one line; otherwise we show the
    # procedural as a small eyebrow so the reader knows the type.
    subject_html = (
        f'<a href="{escape(link)}" style="color:#0b5ed7;text-decoration:none;">{escape(subject_text)}</a>'
        if link
        else escape(subject_text)
    )
    expediente = f" · Núm. expte. {escape(v.expediente_raw)}" if v.expediente_raw else ""
    procedural_label = (
        f'<div style="{_S_SUBTLE};font-style:italic;margin-bottom:2px;">{escape(procedural)}</div>'
        if procedural and procedural != subject_text
        else ""
    )
    return (
        f'<div style="{_S_CARD}">'
        f'<div style="{_S_SUBTLE}">{v.voted_at.strftime("%d/%m/%Y")}{expediente}</div>'
        f"{procedural_label}"
        f'<div style="font-weight:500;margin:4px 0;line-height:1.4;">{subject_html}</div>'
        f'<div style="font-size:13px;">'
        f'<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;{badge_style}">{badge_label}</span>'
        f"&nbsp;&nbsp;Sí: {v.ayes} · No: {v.noes} · Abst.: {v.abstentions}"
        f"</div>"
        f"</div>"
    )


def _html_initiative_row(i: DigestInitiativeEntry) -> str:
    submitted = i.submitted_at.strftime("%d/%m/%Y") if i.submitted_at else "—"
    return (
        f'<div style="{_S_CARD}">'
        f'<div style="{_S_SUBTLE}">{escape(i.official_id)} · presentada {submitted}</div>'
        f'<div style="font-size:14px;">{escape(i.title)}</div>'
        f"</div>"
    )


def _html_footer(*, unsubscribe_url: str | None) -> str:
    bits = [
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">',
        '<p style="font-size:12px;color:#6b7280;line-height:1.5;">',
        "Aquest correu només conté dades. Cap valoració editorial. ",
        "Codi sota EUPL-1.2, dades sota CC-BY 4.0.",
        "</p>",
    ]
    if unsubscribe_url:
        bits.append(
            f'<p style="font-size:12px;color:#6b7280;">'
            f'<a href="{escape(unsubscribe_url)}" style="color:#6b7280;">Cancel·la la subscripció</a>'
            f"</p>"
        )
    bits.append("</div></body></html>")
    return "".join(bits)


def _text_vote_line(v: DigestVoteEntry, site_url: str) -> str:
    expte = f" [expte. {v.expediente_raw}]" if v.expediente_raw else ""
    link = f"  {site_url.rstrip('/')}/votes/{v.vote_id}" if site_url else ""
    label = {"approved": "APROVADA", "rejected": "REBUTJADA", "tie": "EMPAT"}[_result_str(v.result)]
    return (
        f"  · [{v.voted_at.strftime('%d/%m')}] {v.title}{expte}\n"
        f"    {label}  Sí={v.ayes} No={v.noes} Abst={v.abstentions}{link}"
    )


def _result_str(result: object) -> str:
    """Coerce a VoteResult or its string form into the lowercase enum value.

    SQLAlchemy hands back the raw column string (``"approved"`` etc.), while
    code paths that build entries from parsed XML hold a real
    :class:`VoteResult`. Both reach the renderer; we tolerate both.
    """
    if hasattr(result, "value"):
        return str(result.value)
    return str(result)


def _text_initiative_line(i: DigestInitiativeEntry) -> str:
    submitted = i.submitted_at.strftime("%d/%m/%Y") if i.submitted_at else "—"
    return f"  · [{submitted}] {i.official_id} — {i.title}"


def _format_date_range(start: date, end: date) -> str:
    if start == end:
        return start.strftime("%d/%m/%Y")
    if start.year == end.year and start.month == end.month:
        return f"{start.strftime('%d')}–{end.strftime('%d/%m/%Y')}"
    return f"{start.strftime('%d/%m/%Y')} – {end.strftime('%d/%m/%Y')}"
