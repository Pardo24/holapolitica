import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Defensive HTTP headers, set by Next on every response. We pin every
// header that doesn't conflict with the iframable nature of the
// /embed/* widgets. The wholesale X-Frame-Options DENY would block
// our own embed surface, so we set it (and frame-ancestors) only on
// the canonical pages — /embed/* explicitly allows framing.
const COMMON_SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // geolocation=(self): the "El teu diputat" province picker offers a
    // "use my location" button that maps GPS → province ENTIRELY on the
    // device. The previous geolocation=() disabled the Web Geolocation API
    // outright, so that button silently failed in browsers (it only worked
    // in the native mobile wrapper, which bypasses this policy). (self)
    // re-enables it for our own origin only. Camera/microphone stay off.
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), browsing-topics=()',
  },
];

// Content-Security-Policy: what a page may load and where it may send
// data. Scripts only from this origin; 'unsafe-inline' because Next ships
// its page data as inline scripts and the page cache in front
// (server/launch.mjs) serves one copy to everyone, so per-request nonces
// are not an option. It still shuts out scripts, frames and objects from
// anywhere else, and forms and connections to anywhere but us. Images: the
// deputies' photos come from the Congress. Frames: our own only, which
// /journalists uses to preview the embeds. Dev needs eval for fast refresh.
// Embeds may be framed by anyone; every other page by no one.
function contentSecurityPolicy({ embed }) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://www.congreso.es'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://api.holapolitica.org'],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': embed ? ['*'] : ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => [k, ...v].join(' '))
    .join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted builds (Dockerfile.prod) ship the minimal standalone server;
  // Vercel builds leave it unset and package the app their own way.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  // Title, description and share image always go in <head>. Next 15 streams
  // them into the body for anything it doesn't list as a bot, which link
  // previews and Lighthouse then miss ("no meta description"). The page
  // cache in front (server/launch.mjs) sends whole pages anyway, so
  // streaming them bought nothing.
  htmlLimitedBots: /.*/,
  // Middleware sees the worker's real address in request.url. Normalised,
  // 127.0.0.1 becomes "localhost", which no longer matches the address
  // Next serves itself on, so the /ca/… → /… rewrite (middleware.ts) went
  // out as a proxy to "another site" and lost its language. The other
  // thing it normalises, /_next/data URLs, is Pages Router only.
  skipMiddlewareUrlNormalize: true,
  typedRoutes: true,
  experimental: {
    // Keep pages already visited in the client router cache for a while.
    // Every page here is dynamic (the locale comes from a header), and the
    // default for dynamic pages is 0 s: going back to a tab rendered it on
    // the server again every time. With this, switching between the bottom
    // tabs is instant after the first visit; the data underneath only
    // changes every few hours anyway.
    staleTimes: { dynamic: 60, static: 300 },
  },
  async redirects() {
    return [
      // The deputies directory moved into /el-teu-diputat as a tab. Declared
      // here rather than with permanentRedirect() in the page: a page-level
      // redirect answers the document request with 200 and the target's
      // HTML, so search engines keep both URLs as separate pages. This
      // emits a real 308. The tab is carried across; the specific rule has
      // to come first, since the first match wins.
      {
        source: '/persons',
        has: [{ type: 'query', key: 'tab', value: 'grups' }],
        destination: '/el-teu-diputat?tab=grups',
        permanent: true,
      },
      { source: '/persons', destination: '/el-teu-diputat?tab=tots', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Browsers and crawlers ask for /favicon.ico whatever the page links;
      // it was a 404. The generated favicon (app/icon.tsx) answers.
      { source: '/favicon.ico', destination: '/icon' },
      // Android App Links verification file. Served from a route handler
      // (app/api/assetlinks) so its content is driven by the
      // ANDROID_CERT_SHA256 env var — the signing SHA-256 is only known
      // after the app is created in Play Console, and this way filling it
      // in is an env change, not a code change. The canonical path
      // Android fetches is /.well-known/assetlinks.json.
      { source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' },
      // Apple Universal Links, same pattern: the iOS entitlements claim
      // applinks:holapolitica.org, and iOS only honours that claim if this
      // path answers. Content is driven by APPLE_TEAM_ID. Note Apple fetches
      // the path WITHOUT a .json extension.
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/apple-app-site-association',
      },
    ];
  },
  async headers() {
    return [
      // Embed widgets: iframable from anywhere, no framing block.
      // The /embed/* routes set their own ``noindex`` meta and never
      // touch cookies; the threat surface is the host they're framed
      // from, not us.
      {
        source: '/embed/:path*',
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: contentSecurityPolicy({ embed: true }) },
        ],
      },
      // Everything else: deny framing. Crucially, the catch-all must
      // NOT also match /embed/* — Next.js applies every matching
      // rule in order and the later one wins for same-key headers,
      // so a naive ``/:path*`` source ends up setting
      // X-Frame-Options: DENY on the very embed routes that need to
      // be iframable. The negative lookahead excludes ``/embed/``
      // from the catch-all entirely.
      {
        source: '/((?!embed/).*)',
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy({ embed: false }) },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
