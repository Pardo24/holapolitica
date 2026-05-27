import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Inject the request pathname AND the query string as headers so server
 * components can read both synchronously via `headers()`. Used by
 * TopNav to render an SSR-correct active link state AND to round-trip
 * the full URL through the language switcher (`<form action="/api/locale">`)
 * so changing language preserves the current `?topic_slug=…` filter
 * instead of dropping the query.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  headers.set('x-search', request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
