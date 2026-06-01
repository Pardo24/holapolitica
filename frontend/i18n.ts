import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['ca', 'es', 'en'] as const;
export const defaultLocale = 'ca' as const;

export type Locale = (typeof locales)[number];

const COOKIE_NAME = 'NEXT_LOCALE';

function isKnownLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  // Locale negotiation precedence:
  //   1. `x-locale` header set by middleware.ts — the canonical signal,
  //      already resolved from cookie or Accept-Language.
  //   2. `NEXT_LOCALE` cookie — fallback when this function runs outside
  //      a middleware-wrapped request (tests, scripts, edge cases).
  //   3. ``defaultLocale`` (Catalan) — last resort for bookmarks/crawlers.
  const h = await headers();
  const fromHeader = h.get('x-locale');
  const store = await cookies();
  const fromCookie = store.get(COOKIE_NAME)?.value;

  const locale: Locale = isKnownLocale(fromHeader)
    ? fromHeader
    : isKnownLocale(fromCookie)
      ? fromCookie
      : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
