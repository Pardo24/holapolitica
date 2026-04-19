import { getRequestConfig } from 'next-intl/server';

export const locales = ['ca', 'es', 'en'] as const;
export const defaultLocale = 'ca' as const;

export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  // Single-locale setup for the MVP. When we add locale-prefixed routing,
  // this function will read the locale from the URL or a cookie.
  const locale: Locale = defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
