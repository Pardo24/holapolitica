'use client';

/**
 * Registers the device for native push when the site runs inside the
 * Capacitor app, and routes notification taps to their deep link.
 *
 * Mounted once from the root layout. In a plain browser every call here
 * is a no-op (``isNativeApp()`` is false), so this component changes
 * nothing on the web — it only lights up inside the iOS/Android shell.
 *
 * What it does inside the app:
 *   1. Requests notification permission and registers with APNs/FCM,
 *      caching the device token (see lib/native.ts).
 *   2. Posts the token to ``/push/devices`` so the backend can deliver
 *      native pushes to it. Interests start empty; the notifications
 *      page lets the user pick topics, which re-registers the same token
 *      with those interests (idempotent upsert).
 *   3. On a notification tap, navigates to the ``data.url`` the backend
 *      FCM sender attached — so tapping a vote push opens that vote.
 *
 * Renders nothing.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import { isNativeApp, nativePlatform, onPushTap, registerForPush } from '@/lib/native';

export function NativePushBridge(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;

    // Register the token so the device is reachable. Empty interests to
    // start: the row exists and taps route correctly; the notifications
    // page fills in which topics should actually fire a push.
    void (async () => {
      const token = await registerForPush();
      if (disposed || !token) return;
      try {
        await api.push.registerDevice({
          token,
          platform: nativePlatform(),
          topic_slugs: [],
          group_slugs: [],
        });
      } catch {
        // Registration is best-effort; the notifications page retries.
      }
    })();

    // Tap-to-navigate. The backend attaches an absolute URL; we route to
    // its path so navigation stays inside the app WebView.
    const off = onPushTap((url) => {
      try {
        const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
        router.push(path as Parameters<typeof router.push>[0]);
      } catch {
        /* malformed url — ignore */
      }
    });

    return () => {
      disposed = true;
      off();
    };
  }, [router]);

  return null;
}
