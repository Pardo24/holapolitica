import Link from 'next/link';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';

import { NavLink } from '@/components/NavLink';
import { locales } from '@/i18n';

export async function TopNav() {
  const t = await getTranslations('nav');
  const tSite = await getTranslations('site');
  const locale = await getLocale();

  // Capture the current path (including search) so the locale switcher
  // round-trips back to the page the user was on. Set by middleware.ts;
  // falls back to "/" for the very first request before the header lands.
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';

  // Two-spine nav by design: Votes and Persons are the lookup surfaces;
  // Topics and Groups have been folded inside as tabs (cf. /votes "Per tema"
  // and /persons "Grups polítics"). The standalone /topics and /groups
  // routes remain accessible by direct link / SEO, but they no longer
  // crowd the primary navigation — a mobile-first cognitive-load fix.
  // Stats + Notifications are exploration surfaces, kept secondary.
  const primary: { href: Route; label: string }[] = [
    { href: '/votes', label: t('votes') },
    { href: '/persons', label: t('persons') },
  ];
  const secondary: { href: Route; label: string }[] = [
    { href: '/stats', label: t('stats') },
    { href: '/notifications', label: t('notifications') },
  ];

  return (
    <nav className="topnav" aria-label="Primary">
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
            <NavLink href={it.href} label={it.label} />
          </li>
        ))}
        <li className="nav-divider" aria-hidden="true" />
        {secondary.map((it) => (
          <li key={it.href}>
            <NavLink href={it.href} label={it.label} />
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
                <input type="hidden" name="redirect" value={pathname} />
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
    </nav>
  );
}
