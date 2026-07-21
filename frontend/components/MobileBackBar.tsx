'use client';

/**
 * Sticky back bar shown on mobile for every non-home route.
 *
 * The mobile home hides the top nav (the dashboard tiles ARE the
 * navigation). That leaves sub-pages without an obvious way back. We
 * also plan to wrap the site with Capacitor, where a native-feeling
 * back affordance becomes essential because there's no browser
 * chrome at all — the OS back button on Android is the only fallback
 * and iOS has none.
 *
 * Behaviour:
 *   - Hidden when the user is already on `/`.
 *   - Hidden above the mobile breakpoint (CSS).
 *   - Primary action: `router.back()` when `window.history.length`
 *     shows real history; otherwise navigates to `/` so users opening
 *     a deep link still land somewhere meaningful.
 *   - Honours `env(safe-area-inset-top)` so the bar clears the iOS
 *     notch / status bar inside Capacitor's WebView.
 *
 * Server side: this is a Client Component because it reads
 * `usePathname()` and the window history depth. The wrapper in
 * :file:`app/layout.tsx` mounts it unconditionally; the early return
 * on `/` keeps the home pristine.
 */

import { ChevronLeft, Home } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export function MobileBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('mobile_back');
  // We only know whether `router.back()` is a sensible action after
  // hydration — `window.history.length` is unknowable at SSR time. We
  // default to optimistic "history > 1" so the first paint shows a
  // back arrow that does the right thing for ~99% of real users, and
  // correct ourselves after mount for the deep-link edge case.
  const [hasHistory, setHasHistory] = useState(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasHistory(window.history.length > 1);
    }
  }, [pathname]);

  const onBack = useCallback(
    (e: React.MouseEvent) => {
      if (hasHistory) {
        e.preventDefault();
        router.back();
      }
      // If there's no history we fall through to the <Link> default,
      // which navigates to "/" — same target as the href below.
    },
    [hasHistory, router],
  );

  // The back bar is for DRILL-DOWNS only. The four primary destinations
  // — home, Lleis, Partits, Dades — are reachable from the bottom tab
  // bar on every screen, so a back affordance on them is noise (and
  // "back" after a tab tap would step to the previous tab, which reads
  // as broken). It shows on everything else: a vote, a party page, a
  // deputy, a topic — the sub-pages you genuinely drilled into.
  const PRIMARY_TABS = new Set(['/', '/lleis', '/el-teu-diputat', '/stats']);
  if (PRIMARY_TABS.has(pathname)) return null;

  return (
    <div className="mobile-back-bar" aria-label={t('aria_back')}>
      <Link
        href="/"
        prefetch={false}
        onClick={onBack}
        className="mobile-back-bar__btn"
        aria-label={t('aria_back')}
      >
        <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
        <span>{t('label')}</span>
      </Link>
      {/* Home shortcut on the right — the mobile top nav is hidden, so
          this is the one always-present way back to the start from any
          deep sub-page (vs. "back" which only steps one screen). */}
      <Link
        href="/"
        prefetch={false}
        className="mobile-back-bar__home"
        aria-label={t('aria_home')}
        title={t('aria_home')}
      >
        <Home size={20} strokeWidth={2} aria-hidden="true" />
      </Link>
      <style>{`
        .mobile-back-bar {
          display: none;
        }
        @media (max-width: 720px) {
          .mobile-back-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 30;
            padding-top: calc(env(safe-area-inset-top, 0px) + 6px);
            padding-bottom: 6px;
            padding-left: max(env(safe-area-inset-left, 0px), 8px);
            padding-right: max(env(safe-area-inset-right, 0px), 8px);
            background: color-mix(in oklch, var(--paper) 92%, transparent);
            backdrop-filter: saturate(180%) blur(8px);
            -webkit-backdrop-filter: saturate(180%) blur(8px);
            border-bottom: 1px solid var(--rule);
            margin: -16px -14px 12px;
          }
        }
        .mobile-back-bar__btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 8px 10px 8px 6px;
          min-height: 40px;
          border-radius: 8px;
          color: var(--ink-2);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: background-color .12s ease, color .12s ease;
        }
        .mobile-back-bar__btn:active {
          background: var(--paper-2);
          color: var(--ink);
        }
        .mobile-back-bar__home {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          min-height: 40px;
          border-radius: 8px;
          color: var(--ink-2);
          text-decoration: none;
          transition: background-color .12s ease, color .12s ease;
        }
        .mobile-back-bar__home:active {
          background: var(--paper-2);
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}
