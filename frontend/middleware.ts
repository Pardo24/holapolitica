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

export function middleware(request: NextRequest) {
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
