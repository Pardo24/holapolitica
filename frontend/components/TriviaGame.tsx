'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import { api, type GameQuestion } from '@/lib/api';
import { groupAbbreviation } from '@/lib/groups';

/**
 * "Hola Política, el joc" — a Preguntados-style trivia round built from real
 * votes, with a Trivial-Pursuit "quesito" that fills a coloured wedge for each
 * correct answer. At the end you see your wheel and can challenge a friend on
 * the exact same round (a seeded share link).
 *
 * Neutral by construction: questions are factual recall served by the backend.
 */
type Outcome = { answered: boolean; correct: boolean; category: string };

export interface TriviaLabels {
  progress: string;
  category_partits: string;
  category_lleis: string;
  category_temes: string;
  explore: string;
  next: string;
  finish: string;
  score_title: string;
  score_line: string;
  play_again: string;
  loading: string;
  unavailable: string;
  challenge: string;
  challenge_copied: string;
  challenge_text: string; // uses {score} {total}
}

const CATEGORY_COLOR: Record<string, string> = {
  partits: 'var(--accent)',
  lleis: 'var(--aye)',
  temes: 'var(--abst)',
};

export function TriviaGame({
  initialQuestions,
  seed,
  labels,
}: {
  initialQuestions: GameQuestion[];
  seed: number;
  labels: TriviaLabels;
}) {
  const [questions, setQuestions] = useState<GameQuestion[]>(initialQuestions);
  const [roundSeed, setRoundSeed] = useState<number>(seed);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const total = questions.length;
  const q = questions[idx];
  const score = outcomes.filter((o) => o.correct).length;

  const categoryLabel = (cat: string): string =>
    cat === 'partits' ? labels.category_partits : cat === 'temes' ? labels.category_temes : labels.category_lleis;

  function pick(i: number) {
    if (selected !== null || !q) return;
    setSelected(i);
    const correct = !!q.options[i]?.correct;
    setOutcomes((prev) => [...prev, { answered: true, correct, category: q.category }]);
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
    const newSeed = Math.floor(Math.random() * 1_000_000_000);
    try {
      const fresh = await api.game.questions(total || 7, newSeed);
      if (fresh.length > 0) {
        setQuestions(fresh);
        setRoundSeed(newSeed);
      }
    } catch {
      /* keep current set */
    }
    setIdx(0);
    setSelected(null);
    setOutcomes([]);
    setDone(false);
    setCopied(false);
    setLoading(false);
  }

  async function challenge() {
    const url = `${window.location.origin}/joc?repte=${roundSeed}&n=${total}`;
    const text = `${labels.challenge_text
      .replace('{score}', String(score))
      .replace('{total}', String(total))} ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* user dismissed */
    }
  }

  if (total === 0) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{labels.unavailable}</p>;
  }

  // ─── Results ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <Quesito outcomes={outcomes} size={150} />
        <div className="eyebrow" style={{ color: 'var(--ink-3)', marginTop: 16 }}>{labels.score_title}</div>
        <div className="serif tabular" style={{ fontSize: 48, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>
          {score}/{total}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 2 }}>
          {labels.score_line.replace('{score}', String(score)).replace('{total}', String(total))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <button type="button" onClick={challenge} className="btn-ink">
            {copied ? labels.challenge_copied : labels.challenge}
          </button>
          <button
            type="button"
            onClick={playAgain}
            disabled={loading}
            style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--rule-strong)', background: 'var(--paper-2)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {loading ? labels.loading : labels.play_again}
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const answered = selected !== null;
  const catColor = CATEGORY_COLOR[q.category] ?? 'var(--ink)';

  return (
    <div>
      {/* Quesito + progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Quesito outcomes={outcomes} size={56} pending={total - outcomes.length} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--paper)',
                background: catColor,
                padding: '2px 9px',
                borderRadius: 999,
              }}
            >
              {categoryLabel(q.category)}
            </span>
            <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {labels.progress.replace('{n}', String(idx + 1)).replace('{total}', String(total))}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden' }}>
            <div style={{ width: `${(idx / total) * 100}%`, height: '100%', background: catColor }} />
          </div>
        </div>
      </div>

      {/* The law in plain language */}
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--paper-2)', border: `1px solid var(--rule)`, borderLeft: `4px solid ${catColor}`, marginBottom: 16 }}>
        {q.topic && <div className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}>{q.topic}</div>}
        <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>{q.law_summary}</p>
      </div>

      {/* Question (with party badge for party_tf) */}
      <h2 className="serif" style={{ fontSize: 19, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.3, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {q.party_slug && <PartyBadge slug={q.party_slug} color={q.party_color} />}
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
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${border}`, background: bg, color: 'var(--ink)', fontSize: 15, fontWeight: 500, cursor: answered ? 'default' : 'pointer' }}
            >
              {o.party_slug && <PartyBadge slug={o.party_slug} color={o.party_color} />}
              {o.text}
            </button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
          {q.reveal && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{q.reveal}</p>}
          <Link href={`/votes/${q.source_id}` as Route} style={{ display: 'inline-block', marginTop: q.reveal ? 8 : 0, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>
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

/** Neutral party mark — a coloured disc with the group's abbreviation. We don't
 *  ship official party logos (licensing + neutrality); this is the stand-in. */
function PartyBadge({ slug, color }: { slug: string; color: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
        minWidth: 26,
        height: 20,
        padding: '0 6px',
        borderRadius: 6,
        background: color ?? 'var(--ink-3)',
        color: '#fff',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      {groupAbbreviation(slug)}
    </span>
  );
}

/** Trivial-Pursuit "quesito" — N wedges, one filled (in its question's category
 *  colour) per correct answer; wrong answers leave a hollow wedge. */
function Quesito({ outcomes, size, pending = 0 }: { outcomes: Outcome[]; size: number; pending?: number }) {
  const total = outcomes.length + pending;
  const colorOf = (cat: string): string =>
    cat === 'partits' ? '#7F77DD' : cat === 'temes' ? '#EF9F27' : '#1D9E75';
  const wedges = useMemo(() => {
    const n = Math.max(total, 1);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 1;
    const arc = (a0: number, a1: number) => {
      const p = (a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x0, y0] = p(a0);
      const [x1, y1] = p(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    };
    const step = (2 * Math.PI) / n;
    const start = -Math.PI / 2;
    return Array.from({ length: n }, (_, i) => {
      const o = outcomes[i];
      const fill = o ? (o.correct ? colorOf(o.category) : 'transparent') : 'transparent';
      return { d: arc(start + i * step, start + (i + 1) * step), fill };
    });
  }, [outcomes, total, size]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Quesito de progrés" style={{ flex: 'none' }}>
      {wedges.map((w, i) => (
        <path key={i} d={w.d} fill={w.fill} stroke="var(--rule-strong)" strokeWidth="1" />
      ))}
    </svg>
  );
}
