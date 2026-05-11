"""Tests for the double-opt-in confirmation email rendering.

The plain-text and HTML renderers must produce a confirmation message
that any mail client can act on:

* The HTML version embeds the token-bearing URL inside at least one
  ``href`` attribute and inside the visible CTA anchor.
* The plain-text fallback still surfaces the URL verbatim so non-HTML
  clients (and accessibility tooling) can use it.

We import the private renderers directly because they are the unit
under test; ``_send_confirmation`` itself is exercised end-to-end in the
subscription API tests.
"""

from __future__ import annotations

from app.alerts.service import _render_confirmation_html, _render_confirmation_text

_CONFIRM_URL = "https://www.holapolitica.org/confirm/newsletter/abc123-token"


def test_html_confirmation_contains_token_url_in_href() -> None:
    html = _render_confirmation_html(_CONFIRM_URL, kind="newsletter")
    # Token is reachable via at least one anchor href, escaped or not.
    assert f'href="{_CONFIRM_URL}"' in html
    # The visible CTA anchor exists with the confirm text.
    assert "Confirmar subscripció" in html


def test_html_confirmation_renders_full_document() -> None:
    html = _render_confirmation_html(_CONFIRM_URL, kind="newsletter")
    # Doctype + the brand wordmark + table-based layout are present.
    assert html.lstrip().startswith("<!doctype html>")
    assert "Hola Política" in html
    assert "<table" in html


def test_html_confirmation_distinguishes_kind() -> None:
    newsletter_html = _render_confirmation_html(_CONFIRM_URL, kind="newsletter")
    alert_html = _render_confirmation_html(_CONFIRM_URL, kind="alert")
    # Eyebrow label differentiates the two flows.
    assert "Newsletter setmanal" in newsletter_html
    assert "Alertes" in alert_html


def test_text_confirmation_contains_token_url() -> None:
    text = _render_confirmation_text(_CONFIRM_URL, kind="newsletter")
    # Plain-text fallback for non-HTML clients keeps the URL verbatim.
    assert _CONFIRM_URL in text
    # Brand sign-off is present so the message looks intentional.
    assert "Hola Política" in text
