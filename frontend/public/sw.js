/* Monitor Parlamentari — Web Push service worker.
 *
 * Responsibilities:
 *   1. Receive push events from the W3C Push API and render a system
 *      notification using the JSON payload sent by the backend.
 *   2. Handle clicks on a notification: focus an existing tab pointing at
 *      data.url, or open a new one.
 *
 * Versioning: CACHE_VERSION is bumped whenever this file changes so the
 * browser activates the new worker. The activate handler clears any leftover
 * caches from previous versions — we currently use no precache, but the
 * cleanup is cheap and forward-compatible.
 *
 * Neutrality: this worker NEVER injects editorial text. All visible strings
 * (title, body, url) come straight from the backend payload, which is
 * required by docs/neutrality-guidelines.md to be plain factual data.
 */

const CACHE_VERSION = 'mp-sw-v1';

self.addEventListener('install', (event) => {
  // Activate the new worker immediately so subscribed users get fixes fast.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('mp-sw-') && k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('push', (event) => {
  // Defensive: if the push arrives with no payload (some test tools do this),
  // bail silently rather than throwing — the spec discourages firing a
  // notification with no useful content because browsers may warn the user.
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (_err) {
    payload = null;
  }
  if (!payload || !payload.title) {
    return;
  }

  const title = String(payload.title);
  const options = {
    body: payload.body ? String(payload.body) : '',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/icon.svg',
    data: { url: payload.url || '/' },
    // tag groups notifications from the same topic so a stream of votes
    // doesn't pile up; renotify=true ensures the user is still alerted.
    tag: payload.tag || 'monitor-parlamentari',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus a tab already on the target URL, if any.
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          const target = new URL(targetUrl, self.location.origin);
          if (clientUrl.pathname === target.pathname && 'focus' in client) {
            return client.focus();
          }
        } catch (_err) {
          /* ignore malformed urls */
        }
      }
      // Otherwise, open a new window/tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    })(),
  );
});
