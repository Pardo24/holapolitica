'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import { api, type GameQuestion } from '@/lib/api';

/**
 * "Hola Política, el joc" — a Preguntados-style trivia round built from real
 * votes. One question at a time: pick an option, see the correct answer plus a
 * plain-language explanation of the law, then move on. Score at the end, play
 * again for a fresh round. Solo MVP (group / challenge come later).
 *
 * Neutral by construction: questions are factual recall served by the backend;
 * this component only renders + scores them.
 */
export interface TriviaLabels {
  progress: string; // "{n}/{total}"
  category_partits: string;
  category_lleis: string;
  category_temes: string;
  explore: string; // "Explora la votació real"
  next: string;
  finish: string;
  score_title: string;
  score_line: string; // "{score} de {total}"
  play_again: string;
  loading: string;
  unavailable: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  partits: 'var(--accent)',
  lleis: 'var(--aye)',
  temes: 'var(--abst)',
};

export function TriviaGame({
  initialQuestions,
  labels,
}: {
  initialQuestions: GameQuestion[];
  labels: TriviaLabels;
}) {
  const [questions, setQuestions] = useState<GameQuestion[]>(initialQuestions);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const total = questions.length;
  const q = questions[idx];

  const categoryLabel = (cat: string): string =>
    cat === 'partits'
      ? labels.category_partits
      : cat === 'temes'
        ? labels.category_temes
        : labels.category_lleis;

  function pick(i: number) {
    if (selected !== null || !q) return; // already answered
    setSelected(i);
    if (q.options[i]?.correct) setScore((s) => s + 1);
  }

  function next() {
    if (idx + 1 < total) {
      setIdx(idx + 1);
      setSelected(null);
    } else {
      setDone(true);
    }
  }

  async function playAgain() {
    setLoading(true);
    try {
      const fresh = await api.game.questions(total || 7);
      if (fresh.length > 0) setQuestions(fresh);
    } catch {
      // keep the current set on failure
    }
    setIdx(0);
    setSelected(null);
    setScore(0);
    setDone(false);
    setLoading(false);
  }

  if (total === 0) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{labels.unavailable}</p>;
  }

  if (done) {
    const pct = Math.round((score / total) * 100);
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div className="eyebrow" style={{ color: 'var(--ink-3)' }}>{labels.score_title}</div>
        <div
          className="serif tabular"
          style={{ fontSize: 56, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1, marginTop: 6 }}
        >
          {score}/{total}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>
          {labels.score_line.replace('{score}', String(score)).replace('{total}', String(total))}{' '}
          ({pct}%)
        </div>
        <button
          type="button"
          onClick={playAgain}
          disabled={loading}
          className="btn-ink"
          style={{ marginTop: 22 }}
        >
          {loading ? labels.loading : labels.play_again}
        </button>
      </div>
    );
  }

  if (!q) return null;
  const answered = selected !== null;

  return (
    <div>
      {/* Progress + category */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span
          className="eyebrow"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: CATEGORY_COLOR[q.category] ?? 'var(--ink-2)',
          }}
        >
          {categoryLabel(q.category)}
        </span>
        <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {labels.progress.replace('{n}', String(idx + 1)).replace('{total}', String(total))}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ width: `${(idx / total) * 100}%`, height: '100%', background: CATEGORY_COLOR[q.category] ?? 'var(--ink)' }} />
      </div>

      {/* The law explained in plain language — the lead. Shown in full so it
          never reads as cut off; this is what the player reasons from. */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          marginBottom: 16,
        }}
      >
        {q.topic && (
          <div className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}>
            {q.topic}
          </div>
        )}
        <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>
          {q.law_summary}
        </p>
      </div>

      {/* The question */}
      <h2 className="serif" style={{ fontSize: 19, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.3, color: 'var(--ink)' }}>
        {q.prompt}
      </h2>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {q.options.map((o, i) => {
          let border = 'var(--rule-strong)';
          let bg = 'var(--paper)';
          if (answered) {
            if (o.correct) {
              border = 'var(--aye)';
              bg = 'color-mix(in srgb, var(--aye) 12%, var(--paper))';
            } else if (i === selected) {
              border = 'var(--no)';
              bg = 'color-mix(in srgb, var(--no) 12%, var(--paper))';
            }
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              disabled={answered}
              style={{
                textAlign: 'left',
                padding: '13px 16px',
                borderRadius: 12,
                border: `1.5px solid ${border}`,
                background: bg,
                color: 'var(--ink)',
                fontSize: 15,
                fontWeight: 500,
                cursor: answered ? 'default' : 'pointer',
              }}
            >
              {o.text}
            </button>
          );
        })}
      </div>

      {/* Reveal (extra fact) + explore, after answering */}
      {answered && (
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
          }}
        >
          {q.reveal && (
            <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>
              {q.reveal}
            </p>
          )}
          <Link
            href={`/votes/${q.source_id}` as Route}
            style={{ display: 'inline-block', marginTop: q.reveal ? 8 : 0, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}
          >
            {labels.explore} →
          </Link>
        </div>
      )}

      {answered && (
        <button type="button" onClick={next} className="btn-ink" style={{ marginTop: 16, width: '100%' }}>
          {idx + 1 < total ? labels.next : labels.finish}
        </button>
      )}
    </div>
  );
}
