'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import type { AlignQuestion } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * "Com et representen?" — the citizen answers real past votes (Sí / No /
 * Abstenció), and we mirror back which groups voted the same way. All
 * computation is client-side and ephemeral: nothing is sent anywhere, no
 * account, no storage. The tool has no opinion — the criterion is the user's.
 *
 * Neutrality ("mirall, no megàfon"): the result lists EVERY group that had a
 * comparable stance, ranked, with an explicit caption that it's coincidence on
 * these specific votes, not a recommendation.
 */
type Stance = 'aye' | 'no' | 'abstention';
type Answer = Stance | 'skip';

export interface AlignQuizLabels {
  progress: string; // "Pregunta {n} de {total}"
  aye: string;
  no: string;
  abstention: string;
  skip: string;
  back: string;
  results_title: string;
  results_intro: string; // uses {answered}
  coincidence_unit: string; // "% coincidència"
  votes_compared: string; // "{n} votacions comparades"
  neutrality_note: string;
  restart: string;
  none_answered: string;
  view_vote: string;
}

interface GroupResult {
  slug: string;
  name: string;
  color: string | null;
  compared: number;
  agree: number;
  pct: number;
}

export function AlignQuiz({
  questions,
  labels,
  locale,
}: {
  questions: AlignQuestion[];
  labels: AlignQuizLabels;
  locale: string;
}) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [done, setDone] = useState(false);

  const total = questions.length;

  const results = useMemo<GroupResult[]>(() => {
    const agg = new Map<string, GroupResult>();
    for (const q of questions) {
      const ua = answers[q.vote_id];
      if (!ua || ua === 'skip') continue;
      for (const p of q.group_positions) {
        const e =
          agg.get(p.slug) ??
          { slug: p.slug, name: displayGroupShort(p.name_short), color: p.color_hex, compared: 0, agree: 0, pct: 0 };
        e.compared += 1;
        if (p.choice === ua) e.agree += 1;
        agg.set(p.slug, e);
      }
    }
    return [...agg.values()]
      .filter((r) => r.compared > 0)
      .map((r) => ({ ...r, pct: r.agree / r.compared }))
      .sort((a, b) => b.pct - a.pct || b.compared - a.compared);
  }, [answers, questions]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a !== 'skip').length,
    [answers],
  );

  function choose(a: Answer) {
    const q = questions[idx];
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.vote_id]: a }));
    if (idx + 1 < total) setIdx(idx + 1);
    else setDone(true);
  }

  function restart() {
    setAnswers({});
    setIdx(0);
    setDone(false);
  }

  if (total === 0) return null;

  // ─── Results ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div>
        <h2 className="serif" style={{ fontSize: 24, fontWeight: 600, margin: '0 0 6px' }}>
          {labels.results_title}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 18px', lineHeight: 1.5 }}>
          {labels.results_intro.replace('{answered}', String(answeredCount))}
        </p>

        {answeredCount === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{labels.none_answered}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((r) => {
              const pct = Math.round(r.pct * 100);
              return (
                <li key={r.slug}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{r.name}</span>
                    <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      {pct}% <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{labels.coincidence_unit}</span>
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: r.color ?? 'var(--ink-2)' }} />
                  </div>
                  <div className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                    {labels.votes_compared.replace('{n}', String(r.compared))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p
          style={{
            marginTop: 18,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {labels.neutrality_note}
        </p>

        <button type="button" onClick={restart} className="btn-ink btn-sm" style={{ marginTop: 16 }}>
          {labels.restart}
        </button>
      </div>
    );
  }

  // ─── Question card ──────────────────────────────────────────────────────────
  const q = questions[idx];
  if (!q) return null;
  const summary = (locale.startsWith('es') ? q.plain_summary_es : q.plain_summary_ca) || q.plain_summary_ca || q.plain_summary_es;
  const pct = Math.round(((idx) / total) * 100);

  return (
    <div>
      {/* Progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>
          <span>{labels.progress.replace('{n}', String(idx + 1)).replace('{total}', String(total))}</span>
        </div>
        <div style={{ height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s ease' }} />
        </div>
      </div>

      <div
        style={{
          padding: '20px 22px',
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
          borderRadius: 14,
        }}
      >
        {q.topics.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {q.topics.slice(0, 3).map((tp) => (
              <span
                key={tp.slug}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${tp.color_hex ?? 'var(--rule-strong)'}`,
                  color: 'var(--ink-2)',
                }}
              >
                {tp.name_ca}
              </span>
            ))}
          </div>
        )}
        <h2 className="serif" style={{ fontSize: 19, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.3, color: 'var(--ink)' }}>
          {q.title}
        </h2>
        {summary && (
          <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 4px' }}>{summary}</p>
        )}
      </div>

      {/* Stance buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        <StanceButton label={labels.aye} color="var(--aye)" onClick={() => choose('aye')} />
        <StanceButton label={labels.no} color="var(--no)" onClick={() => choose('no')} />
        <StanceButton label={labels.abstention} color="var(--abst)" onClick={() => choose('abstention')} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          style={{
            background: 'none',
            border: 'none',
            color: idx === 0 ? 'var(--ink-3)' : 'var(--ink-2)',
            fontSize: 13,
            cursor: idx === 0 ? 'default' : 'pointer',
            padding: '6px 4px',
          }}
        >
          ← {labels.back}
        </button>
        <button
          type="button"
          onClick={() => choose('skip')}
          style={{ background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 13, cursor: 'pointer', padding: '6px 4px' }}
        >
          {labels.skip} →
        </button>
      </div>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-3)' }}>
        <Link href={`/votes/${q.vote_id}` as Route} style={{ color: 'var(--ink-3)' }} target="_blank">
          {labels.view_vote}
        </Link>
      </p>
    </div>
  );
}

function StanceButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '14px 10px',
        borderRadius: 12,
        border: `1.5px solid ${color}`,
        background: 'var(--paper)',
        color: 'var(--ink)',
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
