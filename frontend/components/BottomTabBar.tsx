'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Building2, Home, Scale } from 'lucide-react';

/**
 * Persistent bottom tab bar — the spine of the mobile navigation.
 *
 * Before this, mobile had no persistent nav at all: the home page's tile
 * grid WAS the menu, and every other page collapsed to a back button, so
 * moving between two sections meant returning all the way to the home
 * page. This bar puts the four primary destinations one thumb-tap away
 * from every screen, the pattern every native app uses and the one a
 * store reviewer expects instead of a "website in a frame".
 *
 * Four tabs, matching the mission and the desktop top nav:
 *   Inici (the chamber today) · Lleis (the record) ·
 *   Partits (who + where) · Dades (the analysis).
 *
 * Games and tools are deliberately NOT here — they live in context, not
 * as peers of the parliamentary record.
 *
 * Mobile only (≤640px), which is the same breakpoint at which the top
 * nav hides and the mobile home takes over, so the two never coexist.
 * Honours ``env(safe-area-inset-bottom)`` so it clears the iOS home
 * indicator inside Capacitor's WebView.
 */

type TabKey = 'inici' | 'lleis' | 'partits' | 'dades';

interface Tab {
  key: TabKey;
  href: Route;
  labelKey: string;
  hue: string;
  Icon: typeof Home;
}

const TABS: Tab[] = [
  { key: 'inici', href: '/' as Route, labelKey: 'tab_inici', hue: 'var(--accent)', Icon: Home },
  { key: 'lleis', href: '/lleis' as Route, labelKey: 'tab_lleis', hue: 'var(--hue-lleis)', Icon: Scale },
  {
    key: 'partits',
    href: '/el-teu-diputat' as Route,
    labelKey: 'tab_partits',
    hue: 'var(--hue-partits)',
    Icon: Building2,
  },
  { key: 'dades', href: '/stats' as Route, labelKey: 'tab_dades', hue: 'var(--hue-dades)', Icon: BarChart3 },
];

/**
 * Which tab "owns" a path. A tab lights up across its whole territory,
 * not just its own URL: a party profile lights Partits, a single vote
 * lights Lleis, the plenary chronicle lights Inici. This is the "you are
 * here" a tab bar is supposed to give — matching only the exact href
 * would leave every drill-down page showing no active tab.
 */
function activeTab(pathname: string): TabKey | null {
  const p = pathname;
  const inSection = (base: string) => p === base || p.startsWith(`${base}/`);

  // Lleis — the laws/votes record and everything filed under it.
  if (
    inSection('/lleis') ||
    inSection('/votes') ||
    inSection('/initiatives') ||
    inSection('/topics')
  )
    return 'lleis';

  // Partits — parties, deputies, the chamber map.
  if (
    inSection('/el-teu-diputat') ||
    inSection('/groups') ||
    inSection('/persons') ||
    inSection('/mapa')
  )
    return 'partits';

  // Dades — aggregate analysis and cross-legislature comparison.
  if (inSection('/stats') || inSection('/legislatures')) return 'dades';

  // Inici — the home, the chamber's day, the daily question and games.
  // Everything not claimed above belongs to the "today / start" tab,
  // so the bar always shows exactly one active destination.
  return 'inici';
}

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');
  const active = activeTab(pathname);

  return (
    <nav className="bottom-tabs" aria-label={t('primary_aria')}>
      {TABS.map(({ key, href, labelKey, hue, Icon }) => {
        const on = key === active;
        return (
          <Link
            key={key}
            href={href}
            className={on ? 'bottom-tab bottom-tab--on' : 'bottom-tab'}
            aria-current={on ? 'page' : undefined}
            // The active tab paints in its section's hue; inactive tabs
            // stay quiet ink. One custom property drives both.
            style={{ ['--tab-hue' as string]: hue }}
          >
            <span className="bottom-tab__icon" aria-hidden="true">
              <Icon size={21} strokeWidth={on ? 2.1 : 1.8} />
            </span>
            <span className="bottom-tab__label">{t(labelKey)}</span>
          </Link>
        );
      })}
      <style>{`
        .bottom-tabs { display: none; }
        @media (max-width: 640px) {
          .bottom-tabs {
            display: flex;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 40;
            /* Frosted paper, so content scrolling underneath stays
               faintly visible and the bar reads as chrome, not a slab. */
            background: color-mix(in oklch, var(--paper) 88%, transparent);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
            backdrop-filter: saturate(180%) blur(12px);
            border-top: 1px solid var(--rule-strong);
            /* Clear the iOS home indicator inside the WebView. */
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
          .bottom-tab {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            /* Comfortably past the 44px touch floor. */
            min-height: 52px;
            padding: 7px 4px 6px;
            text-decoration: none;
            color: var(--ink-3);
            -webkit-tap-highlight-color: transparent;
          }
          .bottom-tab__icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            border-radius: 9px;
            transition: background-color .14s ease, color .14s ease;
          }
          .bottom-tab__label {
            font-size: 10.5px;
            font-weight: 600;
            letter-spacing: 0.01em;
            line-height: 1;
          }
          .bottom-tab--on {
            color: var(--tab-hue);
          }
          .bottom-tab--on .bottom-tab__icon {
            background: color-mix(in oklch, var(--tab-hue) 16%, var(--paper));
            color: var(--tab-hue);
          }
          .bottom-tab--on .bottom-tab__label { font-weight: 700; }
          .bottom-tab:active .bottom-tab__icon {
            background: color-mix(in oklch, var(--tab-hue) 22%, var(--paper));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bottom-tab__icon { transition: none; }
        }
      `}</style>
    </nav>
  );
}
