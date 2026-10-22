"""Which outgoing deputy, if any, a name on an official list is.

The BOE prints a candidate's full civil name; the Congress records the name
they go by. The same person can be "María Carmen Navarro Lacoba" on a list
and "Carmen Navarro Lacoba" as a deputy, "Gabriel Rufián i Romero" and
"Gabriel Rufián Romero", "Ignacio (Nacho) Martín Blanco" and "Nacho Martín
Blanco". A wrong link would put a stranger on someone's page, so a name only
matches when it is unambiguous:

1. the same full name, anywhere; or
2. in the same constituency, every family name and at least one given name
   of exactly one deputy.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Joining words that come and go between the two family names, or in them.
_JOINERS = frozenset({"i", "y", "de", "del", "la", "las", "los", "el"})


def fold(name: str) -> str:
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", name.lower())).strip()


def _tokens(name: str) -> list[str]:
    return [t for t in fold(name).split() if t not in _JOINERS]


@dataclass(frozen=True, slots=True)
class Deputy:
    person_id: int
    full_name: str
    family_names: str | None
    given_names: str | None
    constituency: str | None


class DeputyIndex:
    def __init__(self, deputies: list[Deputy]) -> None:
        self._by_full: dict[str, int | None] = {}
        for d in deputies:
            key = fold(d.full_name)
            # Two people with one name: no link by name alone.
            self._by_full[key] = None if key in self._by_full else d.person_id
        self._by_constituency: dict[str, list[tuple[int, list[str], set[str]]]] = {}
        for d in deputies:
            if not d.constituency:
                continue
            tokens = _tokens(d.full_name)
            family = _tokens(d.family_names) if d.family_names else tokens[-2:]
            given = set(_tokens(d.given_names)) if d.given_names else set(tokens[: -len(family)])
            self._by_constituency.setdefault(d.constituency, []).append(
                (d.person_id, family, given)
            )

    def match(self, name: str, constituency: str) -> int | None:
        exact = self._by_full.get(fold(name))
        if exact is not None:
            return exact
        tokens = _tokens(name)
        if not tokens:
            return None
        hits = {
            pid
            for pid, family, given in self._by_constituency.get(constituency, [])
            if family
            and _in_order(family, tokens)
            and given & set(tokens[: len(tokens) - len(family)] or tokens)
        }
        return hits.pop() if len(hits) == 1 else None


def _in_order(needle: list[str], hay: list[str]) -> bool:
    """``needle`` appears in ``hay`` as a contiguous run (the family names)."""
    n = len(needle)
    return any(hay[i : i + n] == needle for i in range(len(hay) - n + 1))
