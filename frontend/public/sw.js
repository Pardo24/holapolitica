/* Monitor Parlamentari — Web Push + offline-shell service worker.
 *
 * Responsibilities:
 *   1. Receive push events from the W3C Push API and render a system
 *      notification using the JSON payload sent by the backend.
 *   2. Handle clicks on a notification: focus an existing tab pointing at
 *      data.url, or open a new one.
 *   3. Cache the app shell (home + manifest + icon) so installed-PWA
 *      visitors see content within ~50ms on cold start instead of
 *      waiting for the network round-trip. Pages further than the
 *      home page stay network-first — we want the freshest vote data,
 *      not stale cached HTML — but a momentary offline drop returns
 *      the cached home so the app never shows a browser error page.
 *
 * Versioning: CACHE_VERSION is bumped whenever this file changes so the
 * browser activates the new worker. The activate handler clears any leftover
 * caches from previous versions.
 *
 * Neutrality: this worker NEVER injects editorial text. All visible strings
 * (title, body, url) come straight from the backend payload, which is
 * required by docs/neutrality-guidelines.md to be plain factual data.
 */

const CACHE_VERSION = 'mp-sw-v2';
// Files we explicitly want available offline. Kept minimal — the
// rest is fetched on demand. /icon.svg is the only static asset we
// reliably need for the install/notification UI. The home page is
// added at install time by issuing a real fetch.
const APP_SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Prime the cache with the app shell. Failures are non-fatal:
      // a partial precache still gives most of the benefit, and the
      // fetch handler tolerates cache misses.
      try {
        const cache = await caches.open(CACHE_VERSION);
        await Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch(() => {
              /* one bad URL doesn't tank the install */
            }),
          ),
        );
      } catch (_err) {
        /* cache API unavailable — proceed without precache */
      }
      // Activate the new worker immediately so subscribed users get
      // fixes fast.
      await self.skipWaiting();
    })(),
  );
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

self.addEventListener('fetch', (event) => {
  // Only handle GET navigations + same-origin static asset requests.
  // POST / API / cross-origin all pass straight through to the
  // network so we never accidentally cache user-mutation traffic.
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Document navigations (HTML pages) follow a network-first
  // strategy: always try the network so vote data is fresh, but
  // fall back to the cached home if offline so the app never shows
  // a browser error page on a flaky train Wi-Fi.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Best-effort update: keep the home page warm so the next
          // cold start hits the cache instead of the network.
          if (url.pathname === '/' && fresh && fresh.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put('/', fresh.clone()).catch(() => undefined);
          }
          return fresh;
        } catch (_netErr) {
          const cache = await caches.open(CACHE_VERSION);
          const cached = (await cache.match(req)) || (await cache.match('/'));
          if (cached) return cached;
          // Last-resort minimal offline response. Plain HTML so
          // there's no styling fight; the user sees a one-line
          // factual message rather than the browser's chrome error.
          return new Response(
            '<!doctype html><meta charset=utf-8><title>Hola Política</title><body style="font-family:system-ui;padding:24px"><h1>Sense connexió</h1><p>Estàs fora de línia. Torna a provar quan tornis a tenir xarxa.</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  // Static-asset cache-first: SVG icons and the manifest itself.
  // Anything else (CSS chunks, JS bundles, OG images) is left to
  // the browser HTTP cache — Next.js' fingerprinted filenames + the
  // long cache-control headers Vercel emits already give us the
  // right behaviour without a SW middle layer.
  if (
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          cache.put(req, fresh.clone()).catch(() => undefined);
        }
        return fresh;
      })(),
    );
  }
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
