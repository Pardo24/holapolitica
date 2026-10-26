"""Seats of one constituency by the D'Hondt rule, as the electoral law sets it.

Ley Orgánica 5/1985 (LOREG), article 163:

- Lists below 3% of the constituency's valid votes (votes to lists plus
  blank votes) take no seat.
- The votes of each list are divided by 1, 2, 3... up to the number of
  seats; the seats go to the largest quotients.
- Two equal quotients: the seat goes to the list with more votes. Equal
  votes too: the law draws lots; here the lower list code wins, so the
  same count always gives the same chamber.

On election night the count is partial and the seats move with it; the
ministry reports them computed the same way.
"""

from __future__ import annotations

from collections.abc import Mapping
from fractions import Fraction

THRESHOLD = Fraction(3, 100)


def allocate(seats: int, votes: Mapping[str, int], blank: int) -> dict[str, int]:
    """``{list code: seats}`` for every list in ``votes`` (0 if none)."""
    out = dict.fromkeys(votes, 0)
    valid = sum(votes.values()) + blank
    if seats <= 0 or valid <= 0:
        return out
    floor = THRESHOLD * valid
    quotients = [
        (Fraction(v, d), v, code)
        for code, v in votes.items()
        if v > 0 and v >= floor
        for d in range(1, seats + 1)
    ]
    quotients.sort(key=lambda q: (-q[0], -q[1], q[2]))
    for _q, _v, code in quotients[:seats]:
        out[code] += 1
    return out
