'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { CalendarDays, Check, Flame, X } from 'lucide-react';

import { api, type DailyAnswer, type DailyQuestion as DQ } from '@/lib/api';
import { answeredDailyToday, readStats, recordDailyAnswered } from '@/lib/triviaStats';

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

export function DailyQuestion({ locale, labels }: { locale: string; labels: DailyQuestionLabels }) {
  const [q, setQ] = useState<DQ | null | undefined>(undefined);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<DailyAnswer | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* dismissed */
    }
  }

  // Loading / unavailable states keep the card from flashing empty.
  if (q === undefined) {
    return (
      <section style={cardStyle}>
        <Eyebrow label={labels.eyebrow} />
        <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: '10px 0 0' }}>{labels.loading}</p>
      </section>
    );
  }
  if (q === null) {
    return (
      <section style={cardStyle}>
        <Eyebrow label={labels.eyebrow} />
        <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: '10px 0 0' }}>{labels.unavailable}</p>
      </section>
    );
  }

  const answered = result !== null;
  const total = result?.total ?? 0;
  const pctCorrect =
    result && total > 0 ? Math.round(((result.counts[result.correct_index] ?? 0) / total) * 100) : 0;

  return (
    <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Eyebrow label={labels.eyebrow} />
        {streak > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-3)' }}>
            <Flame size={14} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
            {labels.streak.replace('{n}', String(streak))}
          </span>
        )}
      </div>

      {q.context && (
        <p
          style={{
            margin: '12px 0 0',
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            fontSize: 13.5,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}
        >
          {q.context}
        </p>
      )}

      <h2 className="serif" style={{ margin: '12px 0 14px', fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: 'var(--ink)' }}>
        {q.prompt}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((o, i) => {
          const isCorrect = answered && i === result?.correct_index;
          const isChosenWrong = answered && i === chosen && i !== result?.correct_index;
          const pct = answered && total > 0 ? Math.round(((result?.counts[i] ?? 0) / total) * 100) : 0;
          const border = isCorrect ? 'var(--aye)' : isChosenWrong ? 'var(--no)' : 'var(--rule-strong)';
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              disabled={answered || busy}
              style={{
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${border}`,
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontSize: 15,
                fontWeight: 500,
                cursor: answered ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {/* Community distribution bar, revealed after answering */}
              {answered && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pct}%`,
                    background: isCorrect
                      ? 'color-mix(in srgb, var(--aye) 16%, transparent)'
                      : 'color-mix(in srgb, var(--ink) 7%, transparent)',
                    transition: 'width 500ms ease',
                  }}
                />
              )}
              <span style={{ position: 'relative', flex: 1 }}>{o.text}</span>
              {answered && (
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {isCorrect && <Check size={16} strokeWidth={2.5} style={{ color: 'var(--aye)' }} aria-hidden="true" />}
                  {isChosenWrong && <X size={16} strokeWidth={2.5} style={{ color: 'var(--no)' }} aria-hidden="true" />}
                  <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)' }}>
                    {pct}%
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answered && result && (
        <div style={{ marginTop: 14 }}>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              margin: '0 0 6px',
              color: chosen === result.correct_index ? 'var(--aye)' : 'var(--no)',
            }}
          >
            {chosen === result.correct_index ? labels.correct : labels.wrong}
            {total > 0 && (
              <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>
                {' · '}
                {labels.pct_correct.replace('{pct}', String(pctCorrect))}
              </span>
            )}
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{result.explanation}</p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            {result.source_id != null && (
              <Link href={`/votes/${result.source_id}` as Route} style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>
                {labels.explore} →
              </Link>
            )}
            <button
              type="button"
              onClick={share}
              style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}
            >
              {copied ? labels.share_copied : labels.share}
            </button>
            <Link href={'/joc' as Route} style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, marginLeft: 'auto' }}>
              {labels.play_cta} →
            </Link>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>{labels.answered_today}</p>
        </div>
      )}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  borderRadius: 16,
  background: 'var(--paper-2)',
  border: '1px solid var(--rule-strong)',
  padding: '18px 18px 16px',
};

function Eyebrow({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 700,
        color: 'var(--accent)',
      }}
    >
      <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}
