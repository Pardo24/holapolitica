'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Flame, Gamepad2, Star, Sword } from 'lucide-react';

import { readStats } from '@/lib/triviaStats';

/**
 * The homepage's flagship banner for Trivia — the star of the site. Leads with
 * the daily challenge (same round for everyone, comparable scores) and a free
 * play option, and surfaces the player's local streak and best score so it
 * reads as a place to come back to. Stats are read on the client only.
 */
export interface TriviaHeroLabels {
  eyebrow: string;
  title: string;
  sub: string;
  daily_cta: string;
  play_cta: string;
  streak: string; // {n}
  best: string; // {n}
}

export function TriviaHero({ labels }: { labels: TriviaHeroLabels }) {
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    const s = readStats();
    setStreak(s.streak);
    setBest(s.best);
  }, []);

  const hasStats = streak > 0 || best > 0;

  return (
    <section
      style={{
        marginTop: 16,
        borderRadius: 18,
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '22px 22px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative quesito-wheel glow, top-right */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: '50%',
          background:
            'conic-gradient(#1D9E75 0deg 90deg, #7F77DD 90deg 180deg, #378ADD 180deg 270deg, #EF9F27 270deg 360deg)',
          opacity: 0.18,
        }}
      />
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: 'color-mix(in oklch, var(--paper) 72%, transparent)',
            marginBottom: 10,
          }}
        >
          <Gamepad2 size={15} strokeWidth={2} aria-hidden="true" />
          {labels.eyebrow}
        </div>
        <h2
          className="serif"
          style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05 }}
        >
          {labels.title}
        </h2>
        <p
          style={{
            margin: '8px 0 16px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'color-mix(in oklch, var(--paper) 82%, transparent)',
            maxWidth: 460,
          }}
        >
          {labels.sub}
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href={'/joc?dia=1' as Route}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 18px',
              borderRadius: 999,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <Sword size={16} strokeWidth={2} aria-hidden="true" />
            {labels.daily_cta}
          </Link>
          <Link
            href={'/joc' as Route}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 18px',
              borderRadius: 999,
              border: '1px solid color-mix(in oklch, var(--paper) 40%, transparent)',
              color: 'var(--paper)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {labels.play_cta}
          </Link>
        </div>

        {hasStats && (
          <div
            style={{
              display: 'flex',
              gap: 18,
              marginTop: 16,
              fontSize: 13,
              color: 'color-mix(in oklch, var(--paper) 85%, transparent)',
            }}
          >
            {streak > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Flame size={15} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
                {labels.streak.replace('{n}', String(streak))}
              </span>
            )}
            {best > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Star size={15} strokeWidth={2} aria-hidden="true" style={{ color: '#E0B341' }} />
                {labels.best.replace('{n}', String(best))}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
