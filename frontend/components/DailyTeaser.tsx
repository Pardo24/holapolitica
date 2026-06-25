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
        marginTop: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 14,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 42,
          height: 42,
          flex: 'none',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--accent) 15%, var(--paper))',
          color: 'var(--accent)',
        }}
      >
        <CalendarDays size={22} strokeWidth={1.9} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'var(--accent)',
            marginBottom: 2,
          }}
        >
          {labels.eyebrow}
        </span>
        <span className="serif" style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25 }}>
          {answered ? labels.answered_today_short : labels.invite}
        </span>
      </span>
      {streak > 0 && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', flex: 'none' }}
        >
          <Flame size={15} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
          {labels.streak.replace('{n}', String(streak))}
        </span>
      )}
      <ArrowRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
      <style>{`.daily-teaser:hover, .daily-teaser:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </Link>
  );
}
