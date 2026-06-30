'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, CalendarDays, Flame } from 'lucide-react';

import { answeredDailyToday, readStats } from '@/lib/triviaStats';

/**
 * Homepage entry point for "la pregunta del dia": a compact, clickable card that
 * leads to the question's own page. It deliberately does NOT show the question
 * itself — the homepage stays clean and the question opens only when you choose
 * to play it. Shows your streak and whether you've already answered today.
 */
export interface DailyTeaserLabels {
  eyebrow: string;
  invite: string;
  answered_today_short: string;
  streak: string; // {n}
}

export function DailyTeaser({ labels }: { labels: DailyTeaserLabels }) {
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    setStreak(readStats().streak);
    setAnswered(answeredDailyToday());
  }, []);

  return (
    <Link
      href={'/pregunta-del-dia' as Route}
      className="daily-teaser"
      style={{
        marginTop: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        padding: '6px 12px',
        borderRadius: 999,
        border: '1px solid var(--rule)',
        background: 'transparent',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <CalendarDays
        size={15}
        strokeWidth={1.9}
        aria-hidden="true"
        style={{ color: 'var(--accent)', flex: 'none' }}
      />
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--accent)',
        }}
      >
        {labels.eyebrow}
      </span>
      <span style={{ fontSize: 13, color: 'var(--ink-2)', minWidth: 0 }}>
        {answered ? labels.answered_today_short : labels.invite}
      </span>
      {streak > 0 && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', flex: 'none' }}
        >
          <Flame size={13} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
          {labels.streak.replace('{n}', String(streak))}
        </span>
      )}
      <ArrowRight size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
      <style>{`.daily-teaser:hover, .daily-teaser:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </Link>
  );
}
