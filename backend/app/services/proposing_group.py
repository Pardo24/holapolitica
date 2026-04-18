"""Resolve which parliamentary group proposed a vote.

The Congreso vote XML's ``<TextoExpediente>`` field consistently embeds the
proposing group as a literal substring of the group's official long name,
e.g.::

    "Proposición no de Ley del Grupo Parlamentario VOX, relativa al…"
    "Moción consecuencia de interpelación urgente del Grupo Parlamentario
     Plurinacional SUMAR, sobre…"

We resolve the proposer by trying each group's full ``name_long`` as a
substring of the description and picking the longest match (most specific).
This avoids the brittleness of regex parsing of free-text Spanish and
correctly disambiguates groups whose short names overlap (e.g. "Vasco"
collides with "Vasco (EAJ-PNV)" — the longer name wins).

When the description doesn't match any group (e.g. government bills, where
the proposer is the cabinet, or multi-group co-signed initiatives), the
function returns ``None``. Callers must NOT invent a proposer.
"""

from __future__ import annotations

from app.models import ParliamentaryGroup


def resolve_proposing_group(
    description: str | None, groups: list[ParliamentaryGroup]
) -> ParliamentaryGroup | None:
    """Return the most specific group whose ``name_long`` appears in ``description``.

    Matching is case-sensitive — the portal renders group names with
    consistent casing in both the description and our seeded ``name_long``.
    Returns ``None`` if no group's name appears.
    """
    if not description:
        return None
    candidates = [g for g in groups if g.name_long and g.name_long in description]
    if not candidates:
        return None
    return max(candidates, key=lambda g: len(g.name_long))
