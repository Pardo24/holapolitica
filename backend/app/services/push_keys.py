"""One-shot CLI helper: generate a VAPID keypair.

Web Push (RFC 8292) requires a permanent ECDSA P-256 keypair used as the
application server's identity to the push services. Both halves are
base64url-encoded; the public key is also embedded in the browser
subscription request via ``applicationServerKey``.

Usage::

    docker compose exec backend python -m app.services.push_keys

Write the printed values into your ``.env`` (or your secrets manager) as
``VAPID_PUBLIC_KEY`` and ``VAPID_PRIVATE_KEY``. The keypair is meant to
be permanent — rotating it invalidates every existing subscription.
"""

from __future__ import annotations

import base64

from py_vapid import Vapid


def generate() -> tuple[str, str]:
    """Generate a fresh VAPID keypair as a ``(public, private)`` tuple.

    Both values are base64url without padding, in the format expected by
    ``pywebpush`` and the browser's ``applicationServerKey``.
    """
    v = Vapid()
    v.generate_keys()
    pub_numbers = v.public_key.public_numbers()
    pub_raw = b"\x04" + pub_numbers.x.to_bytes(32, "big") + pub_numbers.y.to_bytes(32, "big")
    priv_raw = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode("ascii")
    priv_b64 = base64.urlsafe_b64encode(priv_raw).rstrip(b"=").decode("ascii")
    return pub_b64, priv_b64


def main() -> None:
    pub, priv = generate()
    print(f"VAPID_PUBLIC_KEY={pub}")
    print(f"VAPID_PRIVATE_KEY={priv}")


if __name__ == "__main__":
    main()
