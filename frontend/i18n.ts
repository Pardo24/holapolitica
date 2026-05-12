import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['ca', 'es', 'en'] as const;
export const defaultLocale = 'ca' as const;

export type Locale = (typeof locales)[number];

const COOKIE_NAME = 'NEXT_LOCALE';

function isKnownLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  // Cookie-based locale negotiation. The /api/locale route handler sets
  // `NEXT_LOCALE` from the language switcher in the top nav; we read it
  // back here on every server render. Falls back to the default locale
  // (Catalan) when no cookie is present or the value is unknown — that
  // way bookmarks and crawlers see a stable default.
  const store = await cookies();
  const fromCookie = store.get(COOKIE_NAME)?.value;
  const locale: Locale = isKnownLocale(fromCookie) ? fromCookie : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
