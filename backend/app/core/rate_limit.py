"""Shared :class:`slowapi.Limiter` instance.

Routers and the ASGI middleware in :mod:`app.main` must reference the
SAME limiter instance — slowapi tracks request counters per instance,
so two different `Limiter()` objects each apply their own bucket and
the decorators end up effectively unlimited. This module exists so
both sides import the same object.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

# Default-empty global limits — we opt in per-endpoint via decorators
# in routers.py. The key function uses the client's IP, which behind
# the production Caddy reverse proxy is the X-Forwarded-For tail.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
