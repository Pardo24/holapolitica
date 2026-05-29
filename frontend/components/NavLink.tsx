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
 *
 * Optional ``icon`` renders inline before the label — used by the
 * /notifications entry to carry a Lucide Bell so the bell affordance
 * is visible without any text-label dependency. Other entries stay
 * text-only by passing no icon.
 */
export function NavLink({
  href,
  label,
  icon,
  iconOnly = false,
}: {
  href: Route;
  label: string;
  icon?: React.ReactNode;
  /** Render the icon alone (no text). Label is kept as aria-label/title
   *  for accessibility + hover. Used for the notifications bell. */
  iconOnly?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={active ? 'active' : ''}
      aria-current={active ? 'page' : undefined}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      style={
        icon
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: iconOnly ? 0 : 6,
            }
          : undefined
      }
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </Link>
  );
}
