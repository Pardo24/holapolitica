import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { NavLink } from '@/components/NavLink';
import { locales } from '@/i18n';

export async function TopNav() {
  const t = await getTranslations('nav');
  const tSite = await getTranslations('site');
  const locale = await getLocale();

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
      <div className="lang" aria-label="Language">
        {locales.map((l, i) => (
          <span key={l}>
            {i > 0 && <span aria-hidden="true">·</span>}{' '}
            <span className={l === locale ? 'active' : ''}>
              {l.toUpperCase()}
            </span>{' '}
          </span>
        ))}
      </div>
    </nav>
  );
}
