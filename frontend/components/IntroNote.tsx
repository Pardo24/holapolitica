'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { ArrowRight, X } from 'lucide-react';

import { welcomeApplies } from '@/components/WelcomeWizard';

/**
 * First-visit explanation, as a strip inside the page.
 *
 * It replaces a three-slide modal that covered the whole screen on a
 * phone: the first thing a visitor met was a barrier, and the way out was
 * a small "skip" link. Now the page shows the chamber's actual votes and
 * this strip sits above them, saying what the site is in one sentence,
 * with the full explanation one click away.
 *
 * Wide screens only now: in the app and on a phone the first visit gets
 * the welcome wizard instead (WelcomeWizard), and this stays out of the
 * way.
 *
 * Same storage key as the old modal, so anyone who already dismissed that
 * never sees this. Storage can throw (private windows): if it does, the
 * strip simply doesn't render, exactly as the modal used to behave.
 */

const STORAGE_KEY = 'holapolitica.onboarded.v1';

export function IntroNote() {
  // Server renders nothing and the client decides after hydration: reading
  // localStorage during SSR isn't possible, and rendering optimistically
  // would flash the strip at readers who dismissed it long ago.
  const [visible, setVisible] = useState(false);
  const t = useTranslations('onboarding');

  useEffect(() => {
    // In the app and on a phone the welcome wizard does this job.
    if (welcomeApplies()) return;
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* no storage: stay hidden */
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* nothing to remember it with */
    }
  }

  if (!visible) return null;

  return (
    <aside
      aria-label={t('slide1_eyebrow')}
      className="intro-note"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 44px 14px 16px',
        marginBottom: 18,
        borderRadius: 12,
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
      }}
    >
      <span className="eyebrow">{t('slide1_eyebrow')}</span>
      <p
        className="serif"
        style={{
          margin: 0,
          fontSize: 'clamp(15px, 1.8vw, 17px)',
          fontWeight: 600,
          lineHeight: 1.35,
          color: 'var(--ink)',
        }}
      >
        {t('slide1_title')}
      </p>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        {t('slide1_body')}
      </p>
      <Link
        href={'/about#que-es' as Route}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink-2)',
          textDecoration: 'none',
          marginTop: 2,
        }}
      >
        {t('more')}
        <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
      </Link>
      {/* Phone only: a clear way to say "got it", beside the X. */}
      <button type="button" onClick={dismiss} className="intro-note__ok no-touch-pad">
        {t('done')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('close_aria')}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 999,
          border: 'none',
          background: 'transparent',
          color: 'var(--ink-3)',
          cursor: 'pointer',
        }}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </aside>
  );
}
