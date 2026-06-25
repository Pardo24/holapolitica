'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CalendarDays, ChevronRight, X } from 'lucide-react';

import { answeredDailyToday } from '@/lib/triviaStats';

/**
 * Mobile-only floating notification for "la pregunta del dia". It overlays the
 * page (position: fixed), so it never pushes the layout around, and slides in
 * shortly after load like an app notification. Tap it to go answer; dismiss it
 * with the ✕. Hidden once you've answered today or dismissed it today.
 */
export interface DailyNotificationLabels {
  eyebrow: string;
  invite: string;
  dismiss: string;
}

const DAILY_NOTIF_DISMISSED = 'hp_daily_notif_dismissed_v1';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DailyNotification({ labels }: { labels: DailyNotificationLabels }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const today = ymd(new Date());
    let dismissed: string | null = null;
    try {
      dismissed = window.localStorage.getItem(DAILY_NOTIF_DISMISSED);
    } catch {
      /* storage disabled */
    }
    if (answeredDailyToday() || dismissed === today) return;
    // Slide in a moment after load so it reads as a notification, not chrome.
    const t = setTimeout(() => setShow(true), 700);
    return () => clearTimeout(t);
  }, []);

  function dismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      window.localStorage.setItem(DAILY_NOTIF_DISMISSED, ymd(new Date()));
    } catch {
      /* storage disabled */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <Link
      href={'/pregunta-del-dia' as Route}
      className="daily-notif"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 12px 12px 14px',
        borderRadius: 14,
        background: 'var(--ink)',
        color: 'var(--paper)',
        textDecoration: 'none',
        boxShadow: '0 8px 28px -8px rgba(15, 23, 42, 0.45)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          flex: 'none',
          borderRadius: 10,
          background: 'color-mix(in oklch, var(--paper) 16%, var(--ink))',
          color: 'var(--paper)',
        }}
      >
        <CalendarDays size={20} strokeWidth={1.9} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'color-mix(in oklch, var(--paper) 72%, transparent)',
          }}
        >
          {labels.eyebrow}
        </span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.3, marginTop: 1 }}>
          {labels.invite}
        </span>
      </span>
      <ChevronRight size={18} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', opacity: 0.8 }} />
      <button
        type="button"
        onClick={dismiss}
        aria-label={labels.dismiss}
        className="no-touch-pad"
        style={{
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 999,
          border: 0,
          background: 'transparent',
          color: 'color-mix(in oklch, var(--paper) 70%, transparent)',
          cursor: 'pointer',
        }}
      >
        <X size={17} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <style>{`
        .daily-notif { animation: daily-notif-in 360ms cubic-bezier(.2,.8,.2,1) both; }
        @keyframes daily-notif-in { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .daily-notif { animation: none; } }
      `}</style>
    </Link>
  );
}
