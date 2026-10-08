'use client';

/**
 * The phone's top bar: always there, stuck to the top, on every page.
 *
 * Its job is split cleanly with the bottom tab bar, so nothing is offered
 * twice. The bottom bar carries the four primary sections (Inici, Lleis,
 * Diputats, Dades); this bar carries only what the bottom bar does not:
 *
 *   left   the brand on a primary section, "back" on anything drilled into
 *   right  Plens, Jocs, Avisos, and "Més" (language, how it works, the
 *          reference pages that used to live in the web footer)
 *
 * It replaced MobileBackBar, which only appeared on drill-down pages and
 * carried a Home icon. Home lives in the bottom bar, where a thumb expects
 * it, so the icon went.
 *
 * Sticky, not fixed: it takes its own room in the flow, so no page has to
 * know how tall it is to avoid sliding under it. Honours the top safe-area
 * inset so it clears the notch / status bar inside Capacitor's WebView.
 *
 * Hidden above 640px, the breakpoint where the desktop TopNav takes over.
 */

import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  Gamepad2,
  Globe2,
  Bell,
  Map as MapIcon,
  Menu,
  Newspaper,
  Route as RouteIcon,
  Lock,
  ShieldCheck,
  Tags,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { BottomSheet } from '@/components/BottomSheet';

/** The bottom bar's own destinations: a "back" on these would step to the
 *  previous tab, which reads as broken. */
const PRIMARY = new Set(['/', '/lleis', '/el-teu-diputat', '/stats']);

const LOCALES = [
  { code: 'ca', name: 'Català' },
  { code: 'es', name: 'Castellano' },
  { code: 'en', name: 'English' },
] as const;

export function MobileAppBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('app_bar');
  const tNav = useTranslations('nav');
  const tBack = useTranslations('mobile_back');
  const tFooter = useTranslations('footer');
  const tSite = useTranslations('site');

  // Whether "back" has anywhere to go is only knowable after hydration.
  // Optimistic default: almost everyone arrives with history.
  const [hasHistory, setHasHistory] = useState(true);
  useEffect(() => {
    setHasHistory(window.history.length > 1);
  }, [pathname]);
  const onBack = useCallback(
    (e: React.MouseEvent) => {
      if (hasHistory) {
        e.preventDefault();
        router.back();
      }
      // No history (a deep link opened cold): the Link's own href, home.
    },
    [hasHistory, router],
  );

  const isPrimary = PRIMARY.has(pathname);
  const within = (...bases: string[]) =>
    bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));

  const actions = [
    { href: '/avui', label: tNav('plens'), Icon: CalendarDays, on: within('/avui') },
    {
      href: '/jocs',
      label: tNav('jocs'),
      Icon: Gamepad2,
      on: within('/jocs', '/joc', '/com-et-representen', '/pregunta-del-dia'),
    },
    { href: '/notifications', label: tNav('notifications'), Icon: Bell, on: within('/notifications') },
  ];

  const links = [
    { href: '/about', label: t('about'), Icon: BookOpen },
    { href: '/recorregut', label: tFooter('lifecycle_link'), Icon: RouteIcon },
    { href: '/topics', label: tNav('topics'), Icon: Tags },
    { href: '/agenda-2030', label: t('agenda'), Icon: Globe2 },
    { href: '/mapa', label: t('map'), Icon: MapIcon },
    { href: '/journalists', label: tFooter('journalists_link'), Icon: Newspaper },
    { href: '/apidocs', label: tFooter('apidocs_link'), Icon: Code2 },
    { href: '/about/data', label: tFooter('legal_link'), Icon: ShieldCheck },
    { href: '/about/privacy', label: tFooter('privacy_link'), Icon: Lock },
  ];

  return (
    <header className="appbar">
      {isPrimary ? (
        <Link href="/" className="appbar__brand" aria-label={t('home_aria')}>
          <span className="appbar__mark" aria-hidden="true" />
          {/* The motto under the name: it is the one line that says what
              this is, and it no longer takes a row of the home. */}
          <span className="appbar__brandtext">
            <span className="appbar__name">Hola Política</span>
            <span className="appbar__motto">{tSite('motto')}</span>
          </span>
        </Link>
      ) : (
        <Link
          href="/"
          prefetch={false}
          onClick={onBack}
          className="appbar__back"
          aria-label={tBack('aria_back')}
        >
          <ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" />
          <span>{tBack('label')}</span>
        </Link>
      )}

      <nav className="appbar__actions" aria-label={t('actions_aria')}>
        {actions.map(({ href, label, Icon, on }) => (
          <Link
            key={href}
            href={href as Route}
            className={on ? 'appbar__icon appbar__icon--on' : 'appbar__icon'}
            aria-label={label}
            title={label}
            aria-current={on ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
          </Link>
        ))}
        <BottomSheet
          trigger={<Menu size={22} strokeWidth={1.9} aria-hidden="true" />}
          triggerClassName="appbar__icon no-touch-pad"
          triggerLabel={t('more')}
          title={t('more')}
          closeLabel={t('close')}
        >
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t('language')}
          </div>
          <div className="appbar-lang" role="group" aria-label={t('language')}>
            {LOCALES.map(({ code, name }) => (
              <form
                key={code}
                action="/api/locale"
                method="POST"
                // The query string has to come back too (a filtered list
                // should stay filtered in the new language), and it is only
                // known in the browser at the moment of the tap.
                onSubmit={(e) => {
                  const input = e.currentTarget.elements.namedItem('redirect') as HTMLInputElement;
                  input.value = window.location.pathname + window.location.search;
                }}
              >
                <input type="hidden" name="locale" value={code} />
                <input type="hidden" name="redirect" value={pathname} />
                <button
                  type="submit"
                  className="no-touch-pad"
                  aria-pressed={code === locale}
                  lang={code}
                >
                  {name}
                </button>
              </form>
            ))}
          </div>

          <ul className="sheet-list" style={{ marginTop: 18 }}>
            {links.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link href={href as Route} aria-current={pathname === href ? 'page' : undefined}>
                  <span className="sheet-row__icon" aria-hidden="true">
                    <Icon size={17} strokeWidth={1.9} />
                  </span>
                  <span className="sheet-row__label">{label}</span>
                  <ChevronRight size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
                </Link>
              </li>
            ))}
          </ul>

          <p style={{ margin: '16px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--ink-3)' }}>
            {tFooter('principle')} {tFooter('license_code')} · {tFooter('license_data')} ·{' '}
            {tFooter('complementary')}
          </p>
        </BottomSheet>
      </nav>
    </header>
  );
}
