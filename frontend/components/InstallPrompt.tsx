'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, X } from 'lucide-react';

/**
 * Install-to-home-screen banner.
 *
 * Two activation paths:
 *
 * 1. Chrome / Edge / Brave on Android (+ desktop Chrome) fire the
 *    standard ``beforeinstallprompt`` event when the PWA criteria
 *    are met. We capture it, suppress the browser's native bar,
 *    and render our own button — clicking it calls ``prompt()`` on
 *    the captured event so the system dialogue appears in line
 *    with our visual language instead of the browser's chrome.
 *
 * 2. Safari (iOS) does NOT fire ``beforeinstallprompt`` and never
 *    will. The only path to a home-screen icon on iOS is the
 *    Share sheet → "Afegir a la pantalla d'inici". We detect iOS
 *    Safari heuristically and show an instructional banner
 *    pointing at the Share button instead of a programmatic prompt.
 *
 * Persistence: a dismiss (X) or a successful install writes a
 * versioned localStorage flag so the banner never reappears for
 * that device. Bump ``DISMISS_KEY`` to force the banner back
 * (e.g. after a major UX change worth re-announcing).
 *
 * Visibility rules:
 * - Hidden when running already INSIDE a PWA (display-mode standalone).
 * - Hidden when the dismiss flag is set.
 * - Hidden on the very first visit (we want the onboarding modal
 *   to take that slot — banner appears on the second visit onward).
 */

const DISMISS_KEY = 'holapolitica.install.dismissed.v1';
const SECOND_VISIT_KEY = 'holapolitica.visited.v1';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isInStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // Chrome / Android — official PWA media query.
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari — exposes a navigator.standalone boolean on the home-
  // screen launched instance only. Cast carefully; the property
  // isn't in the standard Navigator type.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  // iPhone / iPad / iPod. iPadOS reports 'Macintosh' in newer
  // versions but adds 'maxTouchPoints' > 0, so we check both.
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  if (!isIos) return false;
  // Make sure it's Safari — not Chrome-on-iOS (CriOS) which is
  // still WebKit but exposes a different UA. The instruction we
  // show only applies to native Safari's Share button.
  return !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPrompt() {
  const t = useTranslations('install_prompt');
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Hide for users who already installed.
    if (isInStandalone()) {
      setDismissed(true);
      return;
    }
    // Hide if user already dismissed once.
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) {
        setDismissed(true);
        return;
      }
    } catch {
      /* private mode — proceed without persistence */
    }
    // Hide on the very first visit so the onboarding modal owns
    // the first impression. Mark this visit so the SECOND one
    // surfaces the banner.
    try {
      const seenBefore = window.localStorage.getItem(SECOND_VISIT_KEY);
      if (!seenBefore) {
        window.localStorage.setItem(SECOND_VISIT_KEY, '1');
        setDismissed(true);
        return;
      }
    } catch {
      /* ignore */
    }

    // iOS path — there's no programmatic prompt, just show the
    // instructional banner.
    if (isIosSafari()) {
      setShowIosBanner(true);
      return;
    }

    // Chrome / Android path — capture the event and unlock the
    // programmatic install button. Some browsers fire this before
    // the listener attaches; that's fine — the next page nav will
    // give us another chance.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    // If the install completes through any path (programmatic or
    // OS-driven), hide the banner permanently.
    const onInstalled = () => {
      try {
        window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      setDismissed(true);
      setInstallEvent(null);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setInstallEvent(null);
    setShowIosBanner(false);
  }

  async function handleInstall() {
    if (!installEvent) return;
    setBusy(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        // The 'appinstalled' listener will handle persistence.
        return;
      }
      // User dismissed the system dialog — don't pester them again.
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  if (dismissed) return null;
  if (!installEvent && !showIosBanner) return null;

  return (
    <div
      role="region"
      aria-label={t('region_aria')}
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 900,
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '12px 14px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        // Keep the banner narrow on tablets / desktops; on phones it
        // already touches both edges thanks to the 12px insets.
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--paper)',
          color: 'var(--ink)',
          flex: 'none',
        }}
      >
        <Download size={18} aria-hidden="true" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
          {t('title')}
        </div>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 12,
            color: 'color-mix(in oklch, var(--paper) 80%, var(--ink))',
            lineHeight: 1.45,
          }}
        >
          {showIosBanner ? t('ios_body') : t('body')}
        </p>
      </div>
      {installEvent && (
        <button
          type="button"
          onClick={handleInstall}
          disabled={busy}
          style={{
            padding: '8px 12px',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: 0,
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
            flex: 'none',
          }}
        >
          {t('install_cta')}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss_aria')}
        style={{
          background: 'transparent',
          border: 0,
          color: 'color-mix(in oklch, var(--paper) 70%, var(--ink))',
          cursor: 'pointer',
          padding: 4,
          flex: 'none',
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
