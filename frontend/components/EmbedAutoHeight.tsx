'use client';

import { useEffect } from 'react';

/**
 * Posts the embed document's pixel height to the parent window so an
 * embedding page can size its iframe to the content — no scrollbar, no
 * trailing whitespace.
 *
 * Rendered once per embed route (via app/embed/layout.tsx). Sends a
 * `holapolitica:embed-height` message on mount, on load, and whenever
 * the document box resizes (ResizeObserver). The payload is a single
 * integer — no personal data — so the wildcard target origin is safe;
 * the listener side verifies the message came from its own iframe.
 *
 * Newsrooms embedding a raw <iframe> without a listener simply keep the
 * fixed height from the snippet; this is purely additive.
 */
export function EmbedAutoHeight() {
  useEffect(() => {
    if (window.parent === window) return; // not framed — nothing to do

    const post = () => {
      const height = Math.ceil(
        document.documentElement.getBoundingClientRect().height,
      );
      window.parent.postMessage(
        { type: 'holapolitica:embed-height', height },
        '*',
      );
    };

    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    window.addEventListener('load', post);
    return () => {
      ro.disconnect();
      window.removeEventListener('load', post);
    };
  }, []);

  return null;
}
