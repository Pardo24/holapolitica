import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { defaultLocale, locales } from './i18n';

/**
 * Per-request injection of three signals:
 *
 *   - ``x-pathname`` + ``x-search`` so server components can read the
 *     current URL synchronously via ``headers()`` (TopNav's active state,
 *     the language switcher's full-path round-trip).
 *   - ``x-locale`` carrying the negotiated locale for THIS render. The
 *     ``NEXT_LOCALE`` cookie wins when present (the language switcher
 *     sets it explicitly); first-time visitors fall back to parsing the
 *     ``Accept-Language`` request header against our supported locales.
 *     We also persist the resolved value as a cookie so the next visit
 *     skips negotiation and ISR caches are keyed by an explicit cookie.
 */

const COOKIE_NAME = 'NEXT_LOCALE';

function isKnown(value: string | undefined | null): value is string {
  return (
    typeof value === 'string' &&
    (locales as readonly string[]).includes(value)
  );
}

/** Parse Accept-Language and return the best matching supported locale. */
function negotiate(
  acceptLanguage: string | null,
  supported: readonly string[],
): string {
  if (!acceptLanguage) return defaultLocale;
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
    if (supported.includes(tag)) return tag;
    const base = tag.split('-')[0];
    if (base && supported.includes(base)) return base;
  }
  return defaultLocale;
}

/** ``/es``, ``/ca/votes/1``… — a locale-prefixed URL. */
const LOCALE_PREFIX = /^\/(ca|es|en)(\/.*)?$/;

export function middleware(request: NextRequest) {
  // ``/ca/votes/1`` is ``/votes/1`` in Catalan, at an address of its own:
  // search engines index each language through these (hreflang links in
  // app/layout.tsx), and a shared link keeps its language. The page is
  // rendered from the unprefixed route; the prefix also becomes the
  // reader's language choice, so the site's own (unprefixed) links stay in
  // it. These used to redirect to the unprefixed path, which left every
  // language but the negotiated one without a URL.
  const prefixed = LOCALE_PREFIX.exec(request.nextUrl.pathname);
  if (prefixed) {
    const locale = prefixed[1]!;
    const path = prefixed[2] || '/';
    // ``request.url``, not ``nextUrl``: Next proxies a rewrite whose origin
    // differs from its own as if it were another site (the page then renders
    // without these headers, in the negotiated language), and nextUrl turns
    // the worker's 127.0.0.1 into "localhost". request.url keeps it with
    // skipMiddlewareUrlNormalize (next.config.mjs).
    const url = new URL(path + request.nextUrl.search, request.url);
    const headers = new Headers(request.headers);
    headers.set('x-pathname', path);
    headers.set('x-search', request.nextUrl.search);
    headers.set('x-locale', locale);
    headers.set('x-locale-prefix', locale);
    const response = NextResponse.rewrite(url, { request: { headers } });
    if (request.cookies.get(COOKIE_NAME)?.value !== locale) {
      response.cookies.set({
        name: COOKIE_NAME,
        value: locale,
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  }

  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  headers.set('x-search', request.nextUrl.search);

  const cookieLocale = request.cookies.get(COOKIE_NAME)?.value;
  const effective = isKnown(cookieLocale)
    ? cookieLocale
    : negotiate(request.headers.get('accept-language'), locales);
  headers.set('x-locale', effective);

  const response = NextResponse.next({ request: { headers } });

  // Persist the negotiated value so future requests skip detection and
  // cache keys stay consistent. We only set on miss / change to avoid
  // touching the cookie on every page load.
  if (effective !== cookieLocale) {
    response.cookies.set({
      name: COOKIE_NAME,
      value: effective,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
