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
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '20px 22px',
        borderRadius: 16,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 8,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--accent)',
        }}
      >
        <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
        {labels.eyebrow}
      </div>
      <span
        className="serif"
        style={{ fontSize: 'clamp(16px, 1.8vw, 19px)', fontWeight: 600, lineHeight: 1.3, color: 'var(--ink)' }}
      >
        {answered ? labels.answered_today_short : labels.invite}
      </span>
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        {streak > 0 ? (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}
          >
            <Flame size={14} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
            {labels.streak.replace('{n}', String(streak))}
          </span>
        ) : (
          <span />
        )}
        <ArrowRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-2)', flex: 'none' }} />
      </div>
      <style>{`.daily-teaser:hover, .daily-teaser:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </Link>
  );
}
