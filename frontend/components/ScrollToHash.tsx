'use client';

import { useEffect } from 'react';

/**
 * Brings a section into view when the URL names it (``/stats#bens``). The
 * router's own hash scroll runs before a slow server page has streamed in, so
 * a link from another page landed at the top.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [id]);
  return null;
}
