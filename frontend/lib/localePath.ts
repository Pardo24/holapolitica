/**
 * Language-prefixed URLs: ``/ca/votes/1`` is ``/votes/1`` in Catalan.
 *
 * The site's own links carry no prefix (the language lives in the
 * NEXT_LOCALE cookie). The prefixed addresses exist so that each language
 * has a URL of its own for search engines (hreflang, app/layout.tsx) and
 * for sharing; middleware.ts serves them by rewriting to the unprefixed
 * page in that language.
 */

export const LOCALE_PREFIX = /^\/(ca|es|en)(?=\/|$)/;

/** ``/ca/votes/1`` → ``/votes/1``; ``/ca`` → ``/``; others unchanged. */
export function stripLocale(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX, '') || '/';
}
