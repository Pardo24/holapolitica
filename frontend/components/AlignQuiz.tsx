'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import type { AlignQuestion } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

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
  question_label: string; // "Què es votava"
  official_title: string; // "Títol oficial" (the bureaucratic one, folded away)
  results_podium: string;
  results_rest: string;
  results_of_votes: string; // "{agree} de {compared} votacions"
  results_top_caption: string; // uses {name}, {agree}, {compared}
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
          <>
            {/* Podium first — the three groups you voted like most often.
                Every remaining group still follows below, ranked: the
                mirror shows the whole chamber, not a partisan subset. */}
            <p style={EYEBROW}>{labels.results_podium}</p>
            <PodiumTop r={results[0]!} labels={labels} />
            {results.length > 1 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: results.length > 2 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                  gap: 10,
                  marginTop: 10,
                }}
              >
                {results.slice(1, 3).map((r, i) => (
                  <PodiumSecond key={r.slug} r={r} rank={i + 2} labels={labels} />
                ))}
              </div>
            )}
            {results.length > 3 && (
              <>
                <p style={{ ...EYEBROW, marginTop: 22 }}>{labels.results_rest}</p>
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {results.slice(3).map((r, i) => (
                    <GroupRow key={r.slug} r={r} rank={i + 4} labels={labels} />
                  ))}
                </ul>
              </>
            )}
          </>
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
                {pickTopicName(tp, locale)}
              </span>
            ))}
          </div>
        )}
        {/* The plain summary IS the question. The official title ("Proyecto
            de Ley por la que se modifican el Texto Refundido…", 70 words of
            legalese) used to lead the card and buried it; it now folds away
            for whoever wants to check the exact wording. */}
        {summary ? (
          <>
            <p style={{ ...EYEBROW, marginBottom: 8 }}>{labels.question_label}</p>
            <h2
              className="serif"
              style={{
                // Summaries run from 20 to 80 words. At a fixed 19px the long
                // ones pushed the answer buttons a full screen below the fold
                // on a phone, which is most of the traffic.
                fontSize: 'clamp(16px, 4vw, 19px)',
                fontWeight: 600,
                margin: '0 0 12px',
                lineHeight: 1.4,
                color: 'var(--ink)',
              }}
            >
              {summary}
            </h2>
            <details style={{ marginTop: 2 }}>
              <summary
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  cursor: 'pointer',
                  listStyle: 'revert',
                }}
              >
                {labels.official_title}
              </summary>
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, margin: '8px 0 0' }}>
                {q.title}
              </p>
            </details>
          </>
        ) : (
          <h2
            className="serif"
            style={{ fontSize: 19, fontWeight: 600, margin: 0, lineHeight: 1.35, color: 'var(--ink)' }}
          >
            {q.title}
          </h2>
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

// ─── Results pieces ─────────────────────────────────────────────────────────

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
  margin: '0 0 10px',
};

function ofVotes(labels: AlignQuizLabels, r: GroupResult): string {
  return labels.results_of_votes
    .replace('{agree}', String(r.agree))
    .replace('{compared}', String(r.compared));
}

function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 999,
        background: 'var(--paper-3)',
        overflow: 'hidden',
        marginTop: 10,
      }}
    >
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}

function Rank({ n, color, big = false }: { n: number; color: string; big?: boolean }) {
  const size = big ? 34 : 24;
  return (
    <span
      className="tabular"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 999,
        background: `color-mix(in oklch, ${color} 18%, var(--paper))`,
        color,
        fontSize: big ? 15 : 12,
        fontWeight: 700,
      }}
    >
      {n}
    </span>
  );
}

function PodiumTop({ r, labels }: { r: GroupResult; labels: AlignQuizLabels }) {
  const pct = Math.round(r.pct * 100);
  const color = r.color ?? 'var(--ink-2)';
  return (
    <div>
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          border: '1px solid var(--rule)',
          background: `color-mix(in oklch, ${color} 8%, var(--paper))`,
          padding: '18px 18px 16px',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <span
          aria-hidden="true"
          style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: color }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Rank n={1} color={color} big />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="serif"
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--ink)',
                lineHeight: 1.2,
                overflowWrap: 'anywhere',
              }}
            >
              {r.name}
            </div>
            <div className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>
              {ofVotes(labels, r)}
            </div>
          </div>
          <div
            className="tabular serif"
            style={{
              fontSize: 34,
              fontWeight: 600,
              color,
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {pct}%
          </div>
        </div>
        <Bar pct={pct} color={color} height={10} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '10px 2px 0' }}>
        {labels.results_top_caption
          .replace('{name}', r.name)
          .replace('{agree}', String(r.agree))
          .replace('{compared}', String(r.compared))}
      </p>
    </div>
  );
}

function PodiumSecond({
  r,
  rank,
  labels,
}: {
  r: GroupResult;
  rank: number;
  labels: AlignQuizLabels;
}) {
  const pct = Math.round(r.pct * 100);
  const color = r.color ?? 'var(--ink-2)';
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        padding: '14px 14px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Rank n={rank} color={color} />
        <span
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--ink)',
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {r.name}
        </span>
      </div>
      <div
        className="tabular serif"
        style={{ fontSize: 22, fontWeight: 600, color, marginTop: 8, lineHeight: 1 }}
      >
        {pct}%
      </div>
      <Bar pct={pct} color={color} />
      <div className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
        {ofVotes(labels, r)}
      </div>
    </div>
  );
}

function GroupRow({ r, rank, labels }: { r: GroupResult; rank: number; labels: AlignQuizLabels }) {
  const pct = Math.round(r.pct * 100);
  const color = r.color ?? 'var(--ink-2)';
  return (
    <li>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 4,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Rank n={rank} color={color} />
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
              minWidth: 0,
              overflowWrap: 'anywhere',
            }}
          >
            {r.name}
          </span>
        </span>
        <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-2)', flex: 'none' }}>
          {pct}% <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{labels.coincidence_unit}</span>
        </span>
      </div>
      <Bar pct={pct} color={color} />
      <div className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
        {labels.votes_compared.replace('{n}', String(r.compared))}
      </div>
    </li>
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
