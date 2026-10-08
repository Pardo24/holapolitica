'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Flame, Play, Trophy, Users } from 'lucide-react';

import { readStats } from '@/lib/triviaStats';

/**
 * The games hub: a place to come back to, not a list of links.
 *
 * A coloured header with the player's own record (streak, best Trivia,
 * whether today's question is done), then one big card per game, each with
 * its hook, what a round is like, and a button to start. The daily
 * question leads: it is the reason to open the app every day.
 *
 * Everything personal comes from this device's storage (no account): the
 * header renders a neutral state first and fills in after mount.
 */

/** The Trivia wheel's categories, in their game colours (TriviaGame). */
const WHEEL = ['#1D9E75', '#7F77DD', '#378ADD', '#EF9F27', '#E0B341'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function GamesHub() {
  const t = useTranslations('jocs');
  const [stats, setStats] = useState<{ streak: number; best: number; doneToday: boolean } | null>(null);

  useEffect(() => {
    const s = readStats();
    const now = new Date();
    const today = ymd(now);
    const yesterday = ymd(new Date(now.getTime() - 86_400_000));
    // A streak whose last day is older than yesterday is already broken.
    const alive = s.lastDaily === today || s.lastDaily === yesterday;
    setStats({ streak: alive ? s.streak : 0, best: s.best, doneToday: s.lastDaily === today });
  }, []);

  return (
    <div className="games">
      <header className="games-hero">
        <p className="games-hero__kicker">{t('title')}</p>
        <h1 className="games-hero__title">{t('hero_title')}</h1>
        <div className="games-hero__stats" aria-live="polite">
          <span className="games-stat">
            <Flame size={16} strokeWidth={2.2} aria-hidden="true" />
            {stats && stats.streak > 0 ? t('stat_streak', { n: stats.streak }) : t('stat_streak_none')}
          </span>
          <span className="games-stat">
            <Trophy size={16} strokeWidth={2.2} aria-hidden="true" />
            {stats && stats.best > 0 ? t('stat_best', { n: stats.best }) : t('stat_best_none')}
          </span>
        </div>
      </header>

      {/* The daily question leads: one a day, the same for everyone. */}
      <section className={`games-card games-card--daily${stats?.doneToday ? ' is-done' : ''}`}>
        <div className="games-card__top">
          <span className="games-card__icon" aria-hidden="true">
            <CalendarDays size={22} strokeWidth={2} />
          </span>
          <span className="games-card__badge">{t('daily_badge')}</span>
        </div>
        <h2 className="games-card__title">{t('daily_title')}</h2>
        <p className="games-card__hook">{t('daily_hook')}</p>
        {stats?.doneToday ? (
          <div className="games-card__done">
            <CheckCircle2 size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>{t('daily_done')}</span>
            <Link href={'/pregunta-del-dia' as Route}>
              {t('daily_see')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <Link href={'/pregunta-del-dia' as Route} className="games-play">
            <Play size={18} strokeWidth={2.4} aria-hidden="true" fill="currentColor" />
            {t('daily_cta')}
          </Link>
        )}
      </section>

      {/* Trivia: the wheel, the four wedges, three lives. */}
      <section className="games-card games-card--trivia">
        <svg className="games-wheel" viewBox="-50 -50 100 100" aria-hidden="true">
          {WHEEL.map((color, i) => {
            const a0 = (i / WHEEL.length) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / WHEEL.length) * Math.PI * 2 - Math.PI / 2;
            const p = (a: number) => `${(Math.cos(a) * 46).toFixed(2)} ${(Math.sin(a) * 46).toFixed(2)}`;
            return <path key={color} d={`M0 0 L${p(a0)} A46 46 0 0 1 ${p(a1)} Z`} fill={color} stroke="#fff" strokeWidth="2" />;
          })}
          <circle r="11" fill="#fff" />
          <circle r="6" fill="var(--ink)" />
        </svg>
        <div className="games-card__top">
          <span className="games-card__icon" aria-hidden="true">
            <Trophy size={22} strokeWidth={2} />
          </span>
        </div>
        <h2 className="games-card__title">{t('trivia_title')}</h2>
        <p className="games-card__hook">{t('trivia_hook')}</p>
        <ul className="games-meta">
          <li>{t('trivia_meta_wedges')}</li>
          <li>{t('trivia_meta_lives')}</li>
          <li>{t('trivia_meta_time')}</li>
        </ul>
        <div className="games-actions">
          <Link href={'/joc' as Route} className="games-play">
            <Play size={18} strokeWidth={2.4} aria-hidden="true" fill="currentColor" />
            {t('trivia_play')}
          </Link>
          <Link href={'/joc' as Route} className="games-play games-play--ghost">
            <Users size={18} strokeWidth={2.2} aria-hidden="true" />
            {t('trivia_challenge')}
          </Link>
        </div>
      </section>

      {/* How would you vote: real votes, then who you agree with. */}
      <section className="games-card games-card--align">
        <div className="games-bars" aria-hidden="true">
          {[82, 64, 47, 30].map((w, i) => (
            <span key={w} style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <div className="games-card__top">
          <span className="games-card__icon" aria-hidden="true">
            <CheckCircle2 size={22} strokeWidth={2} />
          </span>
        </div>
        <h2 className="games-card__title">{t('align_title')}</h2>
        <p className="games-card__hook">{t('align_hook')}</p>
        <ul className="games-meta">
          <li>{t('align_meta_votes')}</li>
          <li>{t('align_meta_time')}</li>
        </ul>
        <div className="games-actions">
          <Link href={'/com-et-representen' as Route} className="games-play">
            <Play size={18} strokeWidth={2.4} aria-hidden="true" fill="currentColor" />
            {t('align_cta')}
          </Link>
        </div>
      </section>

      <p className="games-note">{t('privacy_note')}</p>
    </div>
  );
}
