'use client';

/**
 * Idempotent service worker registration.
 *
 * Mounted once from the root layout. On first mount, registers `/sw.js`
 * at the root scope so it can intercept push events for the whole origin.
 * Re-registering the same script is a no-op for the browser — it returns
 * the existing registration. We swallow errors silently because:
 *   - Older browsers may not support service workers (out of scope).
 *   - The user may have disabled SW via developer tools (treat as decline).
 *
 * This component renders nothing; it exists purely for the side-effect.
 */

import { useEffect } from 'react';

export function PushBootstrap(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async (): Promise<void> => {
      try {
        // scope:'/' so the worker controls every page on the origin.
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (err) {
        // Use warn (not error) — a missing SW is degraded UX, not a bug.
        // eslint-disable-next-line no-console
        console.warn('[push] service worker registration failed', err);
      }
    };
    void register();
  }, []);

  return null;
}
