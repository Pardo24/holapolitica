import Link from 'next/link';
import type { Route } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { BarChart3, Bell, CalendarDays, Gamepad2, Users, Scale } from 'lucide-react';

import { LangSwitch } from '@/components/LangSwitch';
import { NavLink } from '@/components/NavLink';
import { locales } from '@/i18n';

export async function TopNav() {
  const t = await getTranslations('nav');
  const tSite = await getTranslations('site');
  const locale = await getLocale();

  // The path of the request that rendered this nav (injected by
  // middleware.ts). Only good for the first page of a visit: the nav is
  // not re-rendered on client navigations, which is why the language
  // switcher reads the live location itself (LangSwitch).
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
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
  // A deliberately small, visual nav — the four things we want people to do.
  // Everything else (Temes, Legislatures, Premsa, Persones, "Com et
  // representen?") stays reachable from within the pages and the footer, off
  // the top bar.
  // Order mirrors the mission — this is a current-affairs record, so the
  // nav is the four things a citizen comes here to check: what was voted
  // (Lleis), what happened in the chamber this week (Plens), who the
  // parties are and how they behave (Partits), who represents you
  // (Diputats), and the aggregate picture (Dades).
  //
  // The game used to hold a labelled primary slot, which put a quiz at
  // the same weight as the parliamentary record — the wrong signal for a
  // site that wants to be cited. It is now an icon-only entry beside the
  // bell: still one click away, no longer a headline destination.
  //
  // Parties and deputies are ONE entry, not two. They answer the same
  // question ("who is in the chamber and what do they stand for"), and on
  // a phone — where most of our traffic is — two adjacent nav items that
  // lead to halves of one answer just cost a tap and some confusion. The
  // party cards now live inside the deputies hub next to the chamber map.
  const primary: { href: Route; label: string; icon: React.ReactNode }[] = [
    {
      href: '/lleis' as Route,
      label: t('lleis'),
      icon: <Scale size={17} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/avui' as Route,
      label: t('plens'),
      icon: <CalendarDays size={17} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/el-teu-diputat' as Route,
      label: t('deputy'),
      icon: <Users size={17} aria-hidden="true" strokeWidth={1.8} />,
    },
    {
      href: '/stats',
      label: t('stats'),
      icon: <BarChart3 size={17} aria-hidden="true" strokeWidth={1.8} />,
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
      </ul>
      {/* Language switcher.
          Each option is a real `<button type="submit">` inside a tiny
          form that POSTs to `/api/locale`. The handler sets the
          `NEXT_LOCALE` cookie and 303-redirects back to ``redirect`` so
          the user lands on the same page in the chosen language. This
          keeps the switcher working without any client JS — Server
          Components re-render and `getLocale()` reads the new cookie. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Games — demoted from a labelled primary slot to an icon here.
            Keeps the quiz and the alignment test reachable without
            billing them as one of the site's main surfaces. */}
        <NavLink
          href={'/jocs' as Route}
          label={t('jocs')}
          icon={<Gamepad2 size={17} aria-hidden="true" strokeWidth={1.8} />}
          iconOnly
        />
        {/* Notifications bell — icon only, pushed to the far right next
            to the language switcher. */}
        <NavLink
          href="/notifications"
          label={t('notifications')}
          icon={<Bell size={17} aria-hidden="true" strokeWidth={1.8} />}
          iconOnly
          className="nav-bell"
        />
        <LangSwitch locales={locales} current={locale} />
      </div>
    </nav>
  );
}
