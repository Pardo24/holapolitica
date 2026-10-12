// Production entry point of the self-hosted site (Dockerfile.prod).
//
// One Node process renders one page at a time, so a single Next server
// tops out at one core (~12 pages/s on the VM, measured 2026-10-12). This
// starts two of them behind a small proxy with a short-lived page cache:
//
//  - Every page is rendered the same for everyone who shares its path, its
//    locale, the remembered province cookie (hp_prov) and the Next router
//    headers. Nothing else a reader sends changes the output (i18n.ts,
//    middleware.ts, app/page.tsx, app/el-teu-diputat/page.tsx), so a render
//    can serve every one of them for a while. Data changes every few hours;
//    a minute of staleness is invisible, and a viral spike on one law page
//    becomes one render a minute instead of thousands.
//  - Concurrent misses for the same page wait for one render instead of
//    starting their own (a spike arrives all at once).
//  - Past a minute, the stored page is still served while a fresh one is
//    rendered in the background, up to ten minutes.
//  - Pages are stored gzipped once, so Caddy does not compress them again
//    on every hit.
//
// No dependencies: node:http, node:zlib, node:crypto, node:child_process.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOSTNAME ?? '127.0.0.1';
const WORKERS = Number(process.env.NEXT_WORKERS ?? 2);
const FRESH_MS = Number(process.env.PAGE_CACHE_FRESH_S ?? 60) * 1000;
const STALE_MS = Number(process.env.PAGE_CACHE_STALE_S ?? 600) * 1000;
const MAX_BYTES = Number(process.env.PAGE_CACHE_MB ?? 160) * 1024 * 1024;
const MAX_ENTRY = 3 * 1024 * 1024;

// ---------------------------------------------------------------------------
// The Next servers
// ---------------------------------------------------------------------------

const upstreams = [];
for (let i = 0; i < WORKERS; i++) {
  const port = 3100 + i;
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: 'inherit',
  });
  // A worker that dies takes the container down with it, and Docker's
  // restart policy brings the whole thing back clean.
  child.on('exit', (code, signal) => {
    console.error(`next worker on ${port} exited (${code ?? signal}); stopping`);
    process.exit(1);
  });
  upstreams.push({ port, busy: 0 });
}
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => process.exit(0));
}

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

function pickUpstream() {
  return upstreams.reduce((a, b) => (b.busy < a.busy ? b : a));
}

// Headers that describe one hop, never forwarded or stored.
const HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'proxy-connection', 'content-length', 'content-encoding', 'date',
]);

/** Forward a request upstream; resolves with the raw response stream. */
function forward(method, url, headers, body) {
  const up = pickUpstream();
  up.busy++;
  // No compression from Next: either we gzip the stored copy once, or
  // Caddy compresses on the way out, on the other core.
  const h = { ...headers };
  delete h['accept-encoding'];
  delete h.connection;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: up.port, method, path: url, headers: h, agent, timeout: 30_000 },
      (res) => {
        res.on('close', () => up.busy--);
        resolve(res);
      },
    );
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', (e) => {
      up.busy--;
      reject(e);
    });
    if (body) body.pipe(req);
    else req.end();
  });
}

function copyHeaders(src) {
  const out = {};
  for (const [k, v] of Object.entries(src)) if (!HOP.has(k)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// What a render depends on
// ---------------------------------------------------------------------------

const LOCALES = ['ca', 'es', 'en'];
const DEFAULT_LOCALE = 'es';

function readCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

// Same negotiation as middleware.ts, so the key names the locale the page
// will actually be rendered in.
function negotiate(acceptLanguage) {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const entries = acceptLanguage
    .split(',')
    .map((s) => {
      const [tagPart, ...params] = s.trim().split(';');
      const tag = (tagPart ?? '').toLowerCase();
      const qPart = params.find((p) => p.trim().startsWith('q='));
      const q = qPart ? parseFloat(qPart.split('=')[1] ?? '1') : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter((e) => e.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of entries) {
    if (LOCALES.includes(tag)) return tag;
    const base = tag.split('-')[0];
    if (base && LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

const ROUTER_HEADERS = [
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'next-url',
];

function cacheKey(req) {
  const cookie = req.headers.cookie;
  const fromCookie = readCookie(cookie, 'NEXT_LOCALE');
  const locale = LOCALES.includes(fromCookie) ? fromCookie : negotiate(req.headers['accept-language']);
  const parts = [
    req.url,
    locale,
    // Whether the cookie is already set changes the response (middleware
    // adds a Set-Cookie when it is not), so it is part of the key.
    fromCookie ?? '-',
    readCookie(cookie, 'hp_prov') ?? '-',
    ...ROUTER_HEADERS.map((h) => req.headers[h] ?? ''),
  ];
  return createHash('sha1').update(parts.join('\n')).digest('base64url');
}

function isCacheableRequest(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = req.url.split('?')[0];
  // API routes answer per request; Next serves the hashed static files
  // cheaply on its own.
  if (path.startsWith('/api/') || path.startsWith('/_next/')) return false;
  if (req.headers['next-action']) return false;
  return true;
}

const CACHEABLE_TYPES = /^(text\/html|text\/x-component|image\/|application\/xml|text\/xml|application\/manifest\+json|application\/json)/;

function isCacheableResponse(res) {
  if (res.statusCode !== 200 && res.statusCode !== 404) return false;
  if (!CACHEABLE_TYPES.test(res.headers['content-type'] ?? '')) return false;
  // The only cookie a page may set is the negotiated locale, which the key
  // already pins down. Anything else would be someone's own state.
  const set = res.headers['set-cookie'] ?? [];
  return set.every((c) => c.startsWith('NEXT_LOCALE='));
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

/** key -> { status, headers, raw, gz, at, bytes, replay } in LRU order. */
const store = new Map();
let storeBytes = 0;
const inflight = new Map();
const stats = { hit: 0, stale: 0, miss: 0, pass: 0, coalesced: 0 };

function remember(key, entry) {
  const old = store.get(key);
  if (old) {
    storeBytes -= old.bytes;
    store.delete(key);
  }
  store.set(key, entry);
  storeBytes += entry.bytes;
  for (const [k, e] of store) {
    if (storeBytes <= MAX_BYTES) break;
    store.delete(k);
    storeBytes -= e.bytes;
  }
}

function readBody(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', (c) => {
      size += c.length;
      chunks.push(c);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks, size)));
    stream.on('error', reject);
  });
}

/**
 * Render a page upstream and store it. Resolves with the entry, or with
 * { passthrough } when the response must not be shared.
 */
async function render(key, req) {
  const replay = { ...req.headers };
  const res = await forward('GET', req.url, replay);
  const raw = await readBody(res);
  if (!isCacheableResponse(res) || raw.length > MAX_ENTRY) {
    return { passthrough: { status: res.statusCode, headers: copyHeaders(res.headers), raw } };
  }
  const gz = raw.length > 1024 ? await gzipAsync(raw, { level: 6 }) : null;
  const entry = {
    status: res.statusCode,
    headers: copyHeaders(res.headers),
    raw,
    gz,
    at: Date.now(),
    bytes: raw.length + (gz?.length ?? 0) + 512,
    replay,
  };
  remember(key, entry);
  return entry;
}

/** One render per key at a time; `first` says whether this caller started it. */
function renderOnce(key, req) {
  const running = inflight.get(key);
  if (running) {
    stats.coalesced++;
    return { promise: running, first: false };
  }
  const promise = render(key, req).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return { promise, first: true };
}

function send(req, res, entry, state) {
  const headers = { ...entry.headers, 'x-page-cache': state };
  const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  let body = entry.raw;
  if (entry.gz && wantsGzip) {
    body = entry.gz;
    headers['content-encoding'] = 'gzip';
    headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding';
  }
  headers['content-length'] = String(body.length);
  res.writeHead(entry.status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function passThrough(req, res) {
  stats.pass++;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const up = await forward(req.method, req.url, req.headers, hasBody ? req : null);
  res.writeHead(up.statusCode, copyHeaders(up.headers));
  up.pipe(res);
}

async function handle(req, res) {
  if (!isCacheableRequest(req)) return passThrough(req, res);

  const key = cacheKey(req);
  const entry = store.get(key);
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry && age < FRESH_MS) {
    stats.hit++;
    store.delete(key);
    store.set(key, entry); // most recently used
    return send(req, res, entry, 'HIT');
  }
  if (entry && age < STALE_MS) {
    stats.stale++;
    if (!inflight.has(key)) {
      renderOnce(key, { url: req.url, headers: entry.replay }).promise.catch((e) =>
        console.error('background render failed', req.url, e.message),
      );
    }
    return send(req, res, entry, 'STALE');
  }

  stats.miss++;
  const { promise, first } = renderOnce(key, req);
  const result = await promise;
  if (result.passthrough) {
    // Not shareable. The request that rendered it gets the answer meant for
    // it; anyone who waited alongside asks for their own.
    if (!first) return passThrough(req, res);
    const { status, headers, raw } = result.passthrough;
    headers['content-length'] = String(raw.length);
    headers['x-page-cache'] = 'PASS';
    res.writeHead(status, headers);
    return res.end(req.method === 'HEAD' ? undefined : raw);
  }
  return send(req, res, result, 'MISS');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('proxy error', req.method, req.url, e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad gateway');
  });
});
server.keepAliveTimeout = 65_000;
server.listen(PORT, HOST, () => console.log(`page cache on ${HOST}:${PORT} -> next x${WORKERS}`));

setInterval(() => {
  const total = stats.hit + stats.stale + stats.miss;
  if (!total && !stats.pass) return;
  console.log(
    `page cache: ${stats.hit} hit, ${stats.stale} stale, ${stats.miss} miss (${stats.coalesced} coalesced), ` +
      `${stats.pass} pass; ${store.size} pages, ${(storeBytes / 1048576).toFixed(1)} MB`,
  );
  for (const k of Object.keys(stats)) stats[k] = 0;
}, 300_000).unref();
