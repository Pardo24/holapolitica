import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Inject the request pathname as a header so server components can read it
 * synchronously via `headers()`. Used by TopNav to render an SSR-correct
 * active link state without `usePathname` (which is null during SSR for
 * components rendered above the route segment).
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
