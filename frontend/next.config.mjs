import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Defensive HTTP headers applied at the Vercel edge. We pin every
// header that doesn't conflict with the iframable nature of the
// /embed/* widgets. The wholesale X-Frame-Options DENY would block
// our own embed surface, so we set it (and frame-ancestors) only on
// the canonical pages — /embed/* explicitly allows framing.
const COMMON_SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(), camera=(), microphone=(), browsing-topics=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    return [
      // Embed widgets: iframable from anywhere, no framing block.
      // The /embed/* routes set their own ``noindex`` meta and never
      // touch cookies; the threat surface is the host they're framed
      // from, not us.
      {
        source: '/embed/:path*',
        headers: COMMON_SECURITY_HEADERS,
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
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
