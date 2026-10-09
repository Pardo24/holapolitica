'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { Route } from 'next';
import { CalendarDays, Check, Clock, Flame, Gamepad2, Share2, X } from 'lucide-react';

import { api, type DailyAnswer, type DailyQuestion as DQ } from '@/lib/api';
import { answeredDailyToday, readStats, recordDailyAnswered } from '@/lib/triviaStats';
import { openShareSheet } from '@/lib/native';

/**
 * "La pregunta del dia" — the site's flagship daily ritual, answerable right on
 * the homepage. One shared question for everyone; after you answer you see the
 * correct option, what share of people got it right, and a detailed explanation.
 * One answer per day per device (localStorage), so revisiting shows your result
 * without re-counting. Works on every breakpoint.
 */
export interface DailyQuestionLabels {
  eyebrow: string;
  correct: string;
  wrong: string;
  pct_correct: string; // {pct}
  answered_today: string;
  explore: string;
  play_cta: string;
  share: string;
  share_copied: string;
  share_text: string;
  streak: string; // {n}
  loading: string;
  unavailable: string;
}

const DAILY_RESULT_STORE = 'hp_daily_result_v1';

interface StoredResult {
  key: string;
  chosen: number;
  result: DailyAnswer;
}

function readStored(): StoredResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DAILY_RESULT_STORE);
    return raw ? (JSON.parse(raw) as StoredResult) : null;
  } catch {
    return null;
  }
}

/** Minutes until the next question. The server picks it by the UTC day
 *  (api/daily_question.py), so it changes at midnight UTC. */
function minutesToNextQuestion(): number {
  const now = Date.now();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.round((next.getTime() - now) / 60000));
}

export function DailyQuestion({ locale, labels }: { locale: string; labels: DailyQuestionLabels }) {
  const [q, setQ] = useState<DQ | null | undefined>(undefined);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<DailyAnswer | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const tx = useTranslations('daily');

  // The countdown to tomorrow's question, once today's is answered.
  useEffect(() => {
    if (!result) return;
    setMinutesLeft(minutesToNextQuestion());
    const id = setInterval(() => setMinutesLeft(minutesToNextQuestion()), 30_000);
    return () => clearInterval(id);
  }, [result]);

  useEffect(() => {
    let alive = true;
    api.dailyQuestion
      .get(locale)
      .then((data) => {
        if (!alive) return;
        setQ(data);
        // If today's question was already answered on this device, restore the
        // result from storage instead of letting the user answer again.
        const stored = readStored();
        if (data && stored && stored.key === data.key && answeredDailyToday()) {
          setChosen(stored.chosen);
          setResult(stored.result);
        }
        setStreak(readStats().streak);
      })
      .catch(() => {
        if (alive) setQ(null);
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  async function pick(i: number) {
    if (!q || result || busy) return;
    setBusy(true);
    try {
      const res = await api.dailyQuestion.answer(q.key, i, locale);
      setChosen(i);
      setResult(res);
      const next = recordDailyAnswered();
      setStreak(next.streak);
      try {
        const stored: StoredResult = { key: q.key, chosen: i, result: res };
        window.localStorage.setItem(DAILY_RESULT_STORE, JSON.stringify(stored));
      } catch {
        /* storage disabled */
      }
    } catch {
      /* leave unanswered so the user can retry */
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `${labels.share_text} ${window.location.origin}`;
    try {
      if (!(await openShareSheet({ text }))) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* dismissed */
    }
  }

  const todayRaw = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  // Only the first letter up ("Dijous, 8 d'octubre"): a CSS capitalize
  // also raised the d' of "d'octubre".
  const today = todayRaw.charAt(0).toLocaleUpperCase(locale) + todayRaw.slice(1);
  const hero = (
    <header className="dq-hero">
      <span className="dq-hero__date">
        <CalendarDays size={15} strokeWidth={2.2} aria-hidden="true" />
        {today}
      </span>
      <h1 className="dq-hero__title">{labels.eyebrow}</h1>
      <span className="dq-hero__streak">
        <Flame size={16} strokeWidth={2.2} aria-hidden="true" />
        {streak > 0 ? tx('streak_days', { n: streak }) : tx('streak_start')}
      </span>
    </header>
  );

  // Loading / unavailable states keep the card from flashing empty.
  if (q === undefined || q === null) {
    return (
      <div className="dq">
        {hero}
        <section className="dq-card">
          <p className="dq-muted">{q === undefined ? labels.loading : labels.unavailable}</p>
        </section>
      </div>
    );
  }

  const answered = result !== null;
  const total = result?.total ?? 0;
  const pctCorrect =
    result && total > 0 ? Math.round(((result.counts[result.correct_index] ?? 0) / total) * 100) : 0;
  const gotIt = answered && chosen === result?.correct_index;
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const hours = minutesLeft != null ? Math.floor(minutesLeft / 60) : 0;
  const mins = minutesLeft != null ? minutesLeft % 60 : 0;

  return (
    <div className="dq">
      {hero}

      <section className="dq-card">
        {(q.context_title || q.context) && (
          <div className="dq-context">
            {q.context_title && <p className="dq-context__title">{q.context_title}</p>}
            {q.context && <p className="dq-context__text">{q.context}</p>}
          </div>
        )}
        <h2 className="serif dq-prompt">{q.prompt}</h2>

        <div className="dq-opts">
          {q.options.map((o, i) => {
            const isCorrect = answered && i === result?.correct_index;
            const isChosenWrong = answered && i === chosen && i !== result?.correct_index;
            const pct = answered && total > 0 ? Math.round(((result?.counts[i] ?? 0) / total) * 100) : 0;
            const cls = [
              'dq-opt',
              isCorrect ? 'dq-opt--correct' : '',
              isChosenWrong ? 'dq-opt--wrong' : '',
              answered && !isCorrect && !isChosenWrong ? 'dq-opt--dim' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button key={i} type="button" onClick={() => pick(i)} disabled={answered || busy} className={cls}>
                {/* How everyone answered, once you have. */}
                {answered && <span className="dq-opt__bar" aria-hidden="true" style={{ width: `${pct}%` }} />}
                <span className="dq-opt__key" aria-hidden="true">
                  {isCorrect ? <Check size={15} strokeWidth={3} /> : isChosenWrong ? <X size={15} strokeWidth={3} /> : LETTERS[i]}
                </span>
                <span className="dq-opt__text">{o.text}</span>
                {answered && <span className="dq-opt__pct tabular">{pct}%</span>}
              </button>
            );
          })}
        </div>

        {answered && result && (
          <div className={`dq-verdict ${gotIt ? 'dq-verdict--ok' : 'dq-verdict--ko'}`}>
            <p className="dq-verdict__title">
              <span className="dq-verdict__icon" aria-hidden="true">
                {gotIt ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
              </span>
              {gotIt ? labels.correct : labels.wrong}
            </p>
            {total > 0 && <p className="dq-verdict__pct">{labels.pct_correct.replace('{pct}', String(pctCorrect))}</p>}
            <p className="dq-verdict__exp">{result.explanation}</p>
            {result.source_id != null && (
              <Link href={`/votes/${result.source_id}` as Route} className="dq-verdict__link">
                {labels.explore} →
              </Link>
            )}
          </div>
        )}
      </section>

      {answered && (
        <>
          <div className="dq-actions">
            <button type="button" onClick={share} className="dq-btn">
              <Share2 size={17} strokeWidth={2.2} aria-hidden="true" />
              {copied ? labels.share_copied : labels.share}
            </button>
            <Link href={'/joc' as Route} className="dq-btn dq-btn--ghost">
              <Gamepad2 size={17} strokeWidth={2.2} aria-hidden="true" />
              {labels.play_cta}
            </Link>
          </div>
          {minutesLeft != null && (
            <p className="dq-next">
              <Clock size={15} strokeWidth={2.2} aria-hidden="true" />
              {tx('next_in', { h: hours, m: mins })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
