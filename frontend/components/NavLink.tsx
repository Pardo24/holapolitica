'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

/**
 * Active-state nav link. Client component so `usePathname()` re-renders on
 * every client-side navigation — the root layout (which hosts TopNav) is
 * not re-fetched on soft navigations, so a server-side `headers()` read
 * would freeze on the first path. `usePathname()` is reactive in App
 * Router and works during SSR too (Next threads the URL through the
 * render context), so the underline is correct on first paint.
 */
export function NavLink({
  href,
  label,
}: {
  href: Route;
  label: string;
}) {
  const pathname = usePathname() ?? '';
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}
