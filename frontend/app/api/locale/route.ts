import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { defaultLocale, locales, type Locale } from '@/i18n';

const COOKIE_NAME = 'NEXT_LOCALE';
// One year — long enough that the choice persists across sessions but
// expires eventually so a user clearing site data doesn't keep a stale
// preference indefinitely.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isKnownLocale(value: string | null | undefined): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Set the active locale cookie, then redirect back to the referrer (or `/`
 * if there is none). Driven by the language switcher in :file:`TopNav`,
 * which renders a `<form method="POST" action="/api/locale">` with a
 * hidden ``locale`` field — that means the switcher works without any
 * client-side JavaScript and survives the SSR cache.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const raw = form.get('locale');
  const locale: Locale = isKnownLocale(typeof raw === 'string' ? raw : null)
    ? (raw as Locale)
    : defaultLocale;

  // Prefer the form-supplied `redirect` field (lets the switcher round-trip
  // back to the exact path the user was on), then fall back to the
  // Referer header, then to root.
  const redirectField = form.get('redirect');
  const referer = request.headers.get('referer');
  let target = '/';
  if (typeof redirectField === 'string' && redirectField.startsWith('/')) {
    target = redirectField;
  } else if (referer) {
    try {
      const url = new URL(referer);
      target = `${url.pathname}${url.search}` || '/';
    } catch {
      target = '/';
    }
  }

  const response = NextResponse.redirect(new URL(target, request.url), {
    // 303 forces a GET on the redirect target — correct for the
    // POST/Redirect/GET idiom and prevents browsers from re-submitting
    // the form if the user navigates back.
    status: 303,
  });
  response.cookies.set(COOKIE_NAME, locale, {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  });
  return response;
}
