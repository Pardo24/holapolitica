import Link from 'next/link';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { BarChart3, Bell, CheckSquare, Layers, Newspaper, Users } from 'lucide-react';

import { NavLink } from '@/components/NavLink';
import { locales } from '@/i18n';

export async function TopNav() {
  const t = await getTranslations('nav');
  const tSite = await getTranslations('site');
  const locale = await getLocale();

  // Capture the current path AND the current query string so the
  // locale switcher round-trips back to the page the user was on with
  // every filter intact. Both headers are injected by middleware.ts;
  // fall back to "/" for the very first request before they land.
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const search = hdrs.get('x-search') ?? '';
  const fullPath = `${pathname}${search}`;
  // On the home page the mobile dashboard IS the navigation — every
  // primary surface is one tap away — so the top nav adds clutter
  // without adding affordances. We tag the wrapper so the CSS rule
  // below can hide it under the mobile breakpoint without affecting
  // any other route.
  const isHome = pathname === '/' || pathname.startsWith('/?');

  // Slim primary nav: the two lookup surfaces (Votes, Persons) get
  // the prime nav slots. /avui (Crònica del ple) and /joc moved to
  // dedicated home-page CTAs — they are entry-point experiences, not
  // recurring lookups, so the top nav doesn't need to carry them.
  // Topics and Groups remain reachable via tabs inside /votes and
  // /persons.
  // Every entry carries a small Lucide icon — they're sober, geometric
  // and scannable, so the strip reads at a glance without losing the
  // serif/grayscale aesthetic. Stroke 1.8 + size 14 keeps them lighter
  // than the wordmark so the label still leads.
  const primary: { href: Route; label: string; icon: React.ReactNode }[] = [
    {
      href: '/votes',
      label: t('votes'),
      icon: <CheckSquare size={14} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/persons',
      label: t('persons'),
      icon: <Users size={14} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/topics',
      label: t('topics'),
      icon: <Layers size={14} aria-hidden="true" strokeWidth={1.8} />,
    },
  ];
  const secondary: { href: Route; label: string; icon: React.ReactNode }[] = [
    {
      href: '/stats',
      label: t('stats'),
      icon: <BarChart3 size={14} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/journalists' as Route,
      label: t('journalists'),
      icon: <Newspaper size={14} aria-hidden="true" strokeWidth={1.8} />,
    },
  ];

  return (
    <nav
      className={isHome ? 'topnav topnav--home' : 'topnav'}
      aria-label="Primary"
    >
      <Link href="/" className="brand no-underline" style={{ color: 'inherit' }}>
        <span className="brand-mark" aria-hidden="true" />
        <span>
          <span className="brand-name">{tSite('name')}</span>
          <span className="brand-sub" style={{ display: 'block' }}>
            {tSite('motto')}
          </span>
        </span>
      </Link>
      <ul className="nav-links" role="list">
        {primary.map((it) => (
          <li key={it.href}>
            <NavLink href={it.href} label={it.label} icon={it.icon} />
          </li>
        ))}
        <li className="nav-divider" aria-hidden="true" />
        {secondary.map((it) => (
          <li key={it.href}>
            <NavLink href={it.href} label={it.label} icon={it.icon} />
          </li>
        ))}
      </ul>
      {/* Language switcher.
          Each option is a real `<button type="submit">` inside a tiny
          form that POSTs to `/api/locale`. The handler sets the
          `NEXT_LOCALE` cookie and 303-redirects back to ``redirect`` so
          the user lands on the same page in the chosen language. This
          keeps the switcher working without any client JS — Server
          Components re-render and `getLocale()` reads the new cookie. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Notifications bell — icon only, pushed to the far right next
            to the language switcher. */}
        <NavLink
          href="/notifications"
          label={t('notifications')}
          icon={<Bell size={17} aria-hidden="true" strokeWidth={1.8} />}
          iconOnly
        />
        <div className="lang" aria-label="Language">
        {locales.map((l, i) => {
          const isActive = l === locale;
          return (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && (
                <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
                  ·
                </span>
              )}
              <form
                action="/api/locale"
                method="POST"
                style={{ display: 'inline' }}
              >
                <input type="hidden" name="locale" value={l} />
                <input type="hidden" name="redirect" value={fullPath} />
                <button
                  type="submit"
                  className={isActive ? 'lang-btn active' : 'lang-btn'}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Switch language to ${l.toUpperCase()}`}
                  // The clickable target stays exactly the same shape as
                  // the previous `<span>` so the visual rhythm doesn't
                  // shift — bare text, no chrome until hover.
                  style={{
                    background: 'transparent',
                    border: 0,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    font: 'inherit',
                    color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                    fontWeight: isActive ? 700 : 400,
                    textTransform: 'uppercase',
                    letterSpacing: 0,
                    borderRadius: 4,
                  }}
                >
                  {l.toUpperCase()}
                </button>
              </form>
            </span>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
