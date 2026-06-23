'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import { api, type GameQuestion } from '@/lib/api';
import { groupAbbreviation } from '@/lib/groups';

/**
 * "Trivia" — an async 1v1 duel built from real votes. On your turn you spin a
 * roulette for a category (Lleis / Partits / Temes), answer a timed question,
 * and a correct answer wins that category's quesito. You have 3 lives: three
 * misses (wrong or time-out) end your turn. Collect all the quesitos or outscore
 * your rival. A seeded share link drops a friend onto the same pools so the duel
 * is fair; their result rides along in the URL so the winner is shown.
 *
 * Neutral by construction: questions are factual recall served by the backend.
 */
type Cat = 'lleis' | 'partits' | 'temes';
const CAT_ORDER: Cat[] = ['lleis', 'partits', 'temes'];
const CAT_COLOR: Record<Cat, string> = {
  lleis: '#1D9E75',
  partits: '#7F77DD',
  temes: '#EF9F27',
};
const LIVES = 3;
const SECONDS = 20;

type Phase = 'spin' | 'question' | 'feedback' | 'over';

export interface TriviaLabels {
  category_partits: string;
  category_lleis: string;
  category_temes: string;
  explore: string;
  loading: string;
  unavailable: string;
  challenge: string;
  challenge_copied: string;
  challenge_text: string; // uses {score} {total}
  play_again: string;
  // Duel chrome
  spin_cta: string;
  continue: string;
  time_up: string;
  correct: string;
  wrong: string;
  quesitos_count: string; // "{n}/{total}"
  turn_won_title: string;
  turn_over_title: string;
  duel_intro: string; // uses {q} — rival's quesitos
  duel_you: string;
  duel_rival: string;
  duel_win: string;
  duel_lose: string;
  duel_tie: string;
}

export interface RivalResult {
  quesitos: number;
  used: number;
}

const TRIVIA_CSS = `
.trivia-card { animation: trivia-in 320ms ease both; }
.trivia-opt { transition: border-color 180ms ease, background-color 180ms ease, transform 120ms ease; }
.trivia-opt:not(:disabled):hover { transform: translateY(-1px); }
.trivia-opt:not(:disabled):active { transform: translateY(0); }
.trivia-opt--correct { animation: trivia-pop 460ms ease; }
.trivia-opt--wrong { animation: trivia-shake 400ms ease; }
.trivia-reveal { animation: trivia-up 300ms ease both; }
.trivia-next { animation: trivia-up 300ms ease both; }
.trivia-wheel-spin { transition: transform 2200ms cubic-bezier(.15,.85,.2,1); transform-origin: 50% 50%; }
.trivia-result { animation: trivia-wheel-in 520ms cubic-bezier(.2,.8,.2,1) both; transform-origin: 50% 50%; }
.trivia-score { display: inline-block; animation: trivia-score-pop 520ms cubic-bezier(.2,.8,.2,1) both; }
.trivia-quesito-fill { animation: trivia-pop 520ms ease; }
.trivia-life-lost { animation: trivia-shake 420ms ease; }
@keyframes trivia-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes trivia-up { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes trivia-pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes trivia-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@keyframes trivia-wheel-in { from { opacity: 0; transform: scale(.78) rotate(-14deg); } to { opacity: 1; transform: none; } }
@keyframes trivia-score-pop { 0% { opacity: 0; transform: scale(.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .trivia-card, .trivia-opt--correct, .trivia-opt--wrong, .trivia-reveal, .trivia-next,
  .trivia-result, .trivia-score, .trivia-quesito-fill, .trivia-life-lost { animation: none !important; }
  .trivia-opt, .trivia-wheel-spin { transition: none !important; }
}
`;

export function TriviaGame({
  pools,
  seed,
  rival,
  labels,
}: {
  pools: Record<Cat, GameQuestion[]>;
  seed: number;
  rival: RivalResult | null;
  labels: TriviaLabels;
}) {
  // Categories that actually have questions this round (temes can be empty if
  // the legislature has too few classified topics) — the wheel is built from
  // these, so the quesito target is 2 or 3.
  const allCats = useMemo(() => CAT_ORDER.filter((c) => (pools[c]?.length ?? 0) > 0), [pools]);
  const target = allCats.length;

  const [phase, setPhase] = useState<Phase>('spin');
  const [cat, setCat] = useState<Cat | null>(null);
  const [q, setQ] = useState<GameQuestion | null>(null);
  const [collected, setCollected] = useState<Cat[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [used, setUsed] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lostLife, setLostLife] = useState(false);

  const cursors = useRef<Record<Cat, number>>({ lleis: 0, partits: 0, temes: 0 });
  const pendingCat = useRef<Cat | null>(null);

  const remaining = useMemo(
    () => allCats.filter((c) => !collected.includes(c)),
    [allCats, collected],
  );

  const catLabel = (c: Cat): string =>
    c === 'partits' ? labels.category_partits : c === 'temes' ? labels.category_temes : labels.category_lleis;

  function nextQuestion(c: Cat): GameQuestion | null {
    const list = pools[c];
    if (!list || list.length === 0) return null;
    const i = cursors.current[c];
    cursors.current[c] = i + 1;
    return list[i % list.length] ?? null;
  }

  function spin() {
    if (spinning) return;
    if (remaining.length === 0) {
      setPhase('over');
      return;
    }
    const j = Math.floor(Math.random() * remaining.length);
    const landed = remaining[j]!;
    pendingCat.current = landed;
    // Land the chosen sector under the top pointer, plus a few full turns.
    const sector = 360 / remaining.length;
    const need = (360 - (j * sector + sector / 2) + 360) % 360;
    const current = ((wheelAngle % 360) + 360) % 360;
    const delta = (need - current + 360) % 360;
    setWheelAngle(wheelAngle + 360 * 4 + delta);
    setSpinning(true);
  }

  function onWheelStopped() {
    if (!spinning) return;
    setSpinning(false);
    const c = pendingCat.current;
    if (!c) return;
    setCat(c);
    setQ(nextQuestion(c));
    setSelected(null);
    setTimeLeft(SECONDS);
    setPhase('question');
  }

  function answer(i: number) {
    if (phase !== 'question' || !q || !cat) return;
    const correct = i >= 0 && !!q.options[i]?.correct;
    setSelected(i);
    setUsed((u) => u + 1);
    if (correct) {
      setCollected((prev) => (prev.includes(cat) ? prev : [...prev, cat]));
    } else {
      setLives((l) => l - 1);
      setLostLife(true);
    }
    setPhase('feedback');
  }

  // Per-question countdown. A tick re-runs the effect; at zero we auto-answer
  // as a miss. answerRef avoids stale closures without churning deps.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    if (phase !== 'question') return;
    if (timeLeft <= 0) {
      answerRef.current(-1);
      return;
    }
    const id = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timeLeft]);

  function proceed() {
    setLostLife(false);
    if (lives <= 0) {
      setPhase('over');
    } else if (collected.length >= target) {
      setPhase('over');
    } else {
      setPhase('spin');
    }
  }

  function reset() {
    cursors.current = { lleis: 0, partits: 0, temes: 0 };
    setCollected([]);
    setLives(LIVES);
    setSelected(null);
    setUsed(0);
    setCat(null);
    setQ(null);
    setCopied(false);
    setLostLife(false);
    setPhase('spin');
  }

  async function playAgain() {
    reset();
    void seed; // a fresh round reuses the same fetched pools; reshuffle order
    cursors.current = { lleis: 0, partits: 0, temes: 0 };
  }

  async function challenge() {
    const url = `${window.location.origin}/joc?repte=${seed}&rq=${collected.length}&ru=${used}`;
    const text = `${labels.challenge_text
      .replace('{score}', String(collected.length))
      .replace('{total}', String(target))} ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* dismissed */
    }
  }

  if (allCats.length < 2) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{labels.unavailable}</p>;
  }

  // ─── Result / duel outcome ─────────────────────────────────────────────────
  if (phase === 'over') {
    const wonAll = collected.length >= target;
    let duel: 'win' | 'lose' | 'tie' | null = null;
    if (rival) {
      if (
        collected.length > rival.quesitos ||
        (collected.length === rival.quesitos && used < rival.used)
      ) {
        duel = 'win';
      } else if (collected.length === rival.quesitos && used === rival.used) {
        duel = 'tie';
      } else {
        duel = 'lose';
      }
    }
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <style>{TRIVIA_CSS}</style>
        <div className="trivia-result" style={{ display: 'inline-block' }}>
          <CategoryQuesito collected={collected} cats={allCats} size={150} />
        </div>
        <div className="eyebrow" style={{ color: 'var(--ink-3)', marginTop: 16 }}>
          {wonAll ? labels.turn_won_title : labels.turn_over_title}
        </div>
        <div
          className="serif tabular trivia-score"
          style={{ fontSize: 44, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}
        >
          {labels.quesitos_count.replace('{n}', String(collected.length)).replace('{total}', String(target))}
        </div>

        {rival && duel && (
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              alignItems: 'stretch',
            }}
          >
            <DuelSide label={labels.duel_you} q={collected.length} total={target} highlight={duel === 'win'} />
            <DuelSide label={labels.duel_rival} q={rival.quesitos} total={target} highlight={duel === 'lose'} />
          </div>
        )}
        {duel && (
          <div
            style={{
              marginTop: 12,
              fontSize: 16,
              fontWeight: 700,
              color: duel === 'win' ? 'var(--aye)' : duel === 'lose' ? 'var(--no)' : 'var(--ink-2)',
            }}
          >
            {duel === 'win' ? labels.duel_win : duel === 'lose' ? labels.duel_lose : labels.duel_tie}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <button type="button" onClick={challenge} className="btn-ink">
            {copied ? labels.challenge_copied : labels.challenge}
          </button>
          <button
            type="button"
            onClick={playAgain}
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              border: '1px solid var(--rule-strong)',
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {labels.play_again}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{TRIVIA_CSS}</style>

      {/* Status bar: collected quesitos + lives */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CategoryQuesito collected={collected} cats={allCats} size={40} />
          <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {labels.quesitos_count.replace('{n}', String(collected.length)).replace('{total}', String(target))}
          </span>
        </div>
        <div className={lostLife ? 'trivia-life-lost' : undefined} style={{ display: 'flex', gap: 5 }} aria-label={`${lives}/${LIVES}`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart key={i} filled={i < lives} />
          ))}
        </div>
      </div>

      {/* Rival challenge banner */}
      {rival && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            fontSize: 13,
            color: 'var(--ink-2)',
            textAlign: 'center',
          }}
        >
          {labels.duel_intro.replace('{q}', String(rival.quesitos))}
        </div>
      )}

      {/* Roulette */}
      {phase === 'spin' && (
        <div className="trivia-card" style={{ textAlign: 'center', padding: '8px 0' }}>
          <Roulette cats={remaining} angle={wheelAngle} catLabel={catLabel} onStopped={onWheelStopped} />
          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="btn-ink"
            style={{ marginTop: 18, minWidth: 180 }}
          >
            {labels.spin_cta}
          </button>
        </div>
      )}

      {/* Question + feedback */}
      {(phase === 'question' || phase === 'feedback') && q && cat && (
        <QuestionCard
          q={q}
          cat={cat}
          catColor={CAT_COLOR[cat]}
          catLabel={catLabel(cat)}
          phase={phase}
          selected={selected}
          timeLeft={timeLeft}
          labels={labels}
          onPick={answer}
          onProceed={proceed}
        />
      )}
    </div>
  );
}

function QuestionCard({
  q,
  cat,
  catColor,
  catLabel,
  phase,
  selected,
  timeLeft,
  labels,
  onPick,
  onProceed,
}: {
  q: GameQuestion;
  cat: Cat;
  catColor: string;
  catLabel: string;
  phase: Phase;
  selected: number | null;
  timeLeft: number;
  labels: TriviaLabels;
  onPick: (i: number) => void;
  onProceed: () => void;
}) {
  const answered = phase === 'feedback';
  const timedOut = answered && selected === -1;
  const gotItRight = answered && selected !== null && selected >= 0 && !!q.options[selected]?.correct;
  void cat;

  return (
    <div className="trivia-card">
      {/* Category chip + timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
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
          {catLabel}
        </span>
        {!answered && (
          <span
            className="tabular"
            style={{ fontSize: 13, fontWeight: 700, color: timeLeft <= 5 ? 'var(--no)' : 'var(--ink-3)' }}
          >
            {timeLeft}s
          </span>
        )}
      </div>
      {/* Timer bar */}
      {!answered && (
        <div style={{ height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden', marginBottom: 14 }}>
          <div
            style={{
              width: `${(timeLeft / SECONDS) * 100}%`,
              height: '100%',
              background: timeLeft <= 5 ? 'var(--no)' : catColor,
              transition: 'width 1s linear',
            }}
          />
        </div>
      )}

      {/* The law in plain language */}
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderLeft: `4px solid ${catColor}`,
          marginBottom: 16,
        }}
      >
        {q.topic && (
          <div className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}>
            {q.topic}
          </div>
        )}
        <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>{q.law_summary}</p>
      </div>

      {/* Question */}
      <h2
        className="serif"
        style={{
          fontSize: 19,
          fontWeight: 600,
          margin: '0 0 14px',
          lineHeight: 1.3,
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {q.party_slug && <PartyBadge slug={q.party_slug} color={q.party_color} />}
        {q.prompt}
      </h2>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {q.options.map((o, i) => {
          let border = 'var(--rule-strong)';
          let bg = 'var(--paper)';
          let cls = 'trivia-opt';
          if (answered) {
            if (o.correct) {
              border = 'var(--aye)';
              bg = 'color-mix(in srgb, var(--aye) 12%, var(--paper))';
              cls += ' trivia-opt--correct';
            } else if (i === selected) {
              border = 'var(--no)';
              bg = 'color-mix(in srgb, var(--no) 12%, var(--paper))';
              cls += ' trivia-opt--wrong';
            }
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              disabled={answered}
              className={cls}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
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
              {o.party_slug && <PartyBadge slug={o.party_slug} color={o.party_color} />}
              {o.text}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className="trivia-reveal"
          style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}
        >
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              margin: '0 0 4px',
              color: gotItRight ? 'var(--aye)' : 'var(--no)',
            }}
          >
            {timedOut ? labels.time_up : gotItRight ? labels.correct : labels.wrong}
          </p>
          {q.reveal && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{q.reveal}</p>}
          <Link
            href={`/votes/${q.source_id}` as Route}
            style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}
          >
            {labels.explore} →
          </Link>
        </div>
      )}

      {answered && (
        <button type="button" onClick={onProceed} className="btn-ink trivia-next" style={{ marginTop: 16, width: '100%' }}>
          {labels.continue}
        </button>
      )}
    </div>
  );
}

/** The spinning category wheel. Cosmetic spin (CSS rotate) that lands the chosen
 *  sector under the fixed top pointer; the parent decides the landed category. */
function Roulette({
  cats,
  angle,
  catLabel,
  onStopped,
}: {
  cats: Cat[];
  angle: number;
  catLabel: (c: Cat) => string;
  onStopped: () => void;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const n = Math.max(cats.length, 1);
  const sector = 360 / n;
  const toXY = (deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const wedge = (i: number): string => {
    const [x0, y0] = toXY(i * sector);
    const [x1, y1] = toXY((i + 1) * sector);
    const large = sector > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };
  const labelXY = (i: number): [number, number] => {
    const mid = i * sector + sector / 2;
    const a = ((mid - 90) * Math.PI) / 180;
    const rr = r * 0.62;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Ruleta de categories">
      {/* Fixed pointer at the top */}
      <polygon points={`${cx - 9},2 ${cx + 9},2 ${cx},18`} fill="var(--ink)" />
      <g
        className="trivia-wheel-spin"
        style={{ transform: `rotate(${angle}deg)` }}
        onTransitionEnd={onStopped}
      >
        {cats.map((c, i) => (
          <path key={c} d={wedge(i)} fill={CAT_COLOR[c]} fillOpacity={0.9} stroke="var(--paper)" strokeWidth="2" />
        ))}
        {cats.map((c, i) => {
          const [lx, ly] = labelXY(i);
          return (
            <text
              key={`${c}-l`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="11"
              fontWeight={700}
              fill="#fff"
              transform={`rotate(${i * sector + sector / 2} ${lx} ${ly})`}
            >
              {catLabel(c)}
            </text>
          );
        })}
        <circle cx={cx} cy={cy} r="14" fill="var(--paper)" stroke="var(--rule-strong)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** Neutral party mark — a coloured disc with the group's abbreviation. */
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

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <path
        d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.2 5c2 0 3.3 1.1 4.1 2.3l1.4 2 1.4-2C12.9 6.1 14.2 5 16.2 5 19.4 5 21 8.4 19.4 11.7 16.9 16.4 12 21 12 21z"
        fill={filled ? 'var(--no)' : 'transparent'}
        stroke={filled ? 'var(--no)' : 'var(--rule-strong)'}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** The quesito wheel for the FIXED set of categories: one wedge per category,
 *  filled in its colour once collected. */
function CategoryQuesito({ collected, cats, size }: { collected: Cat[]; cats: Cat[]; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const n = Math.max(cats.length, 1);
  const step = (2 * Math.PI) / n;
  const start = -Math.PI / 2;
  const arc = (a0: number, a1: number): string => {
    const p = (a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Quesitos" style={{ flex: 'none' }}>
      {cats.map((c, i) => {
        const has = collected.includes(c);
        return (
          <path
            key={c}
            d={arc(start + i * step, start + (i + 1) * step)}
            fill={has ? CAT_COLOR[c] : 'transparent'}
            stroke="var(--rule-strong)"
            strokeWidth="1"
            className={has ? 'trivia-quesito-fill' : undefined}
            style={{ transition: 'fill 400ms ease' }}
          />
        );
      })}
    </svg>
  );
}

function DuelSide({ label, q, total, highlight }: { label: string; q: number; total: number; highlight: boolean }) {
  return (
    <div
      style={{
        flex: '1 1 0',
        maxWidth: 130,
        padding: '10px 12px',
        borderRadius: 12,
        border: `1.5px solid ${highlight ? 'var(--ink)' : 'var(--rule)'}`,
        background: highlight ? 'var(--paper-2)' : 'var(--paper)',
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{label}</div>
      <div className="serif tabular" style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink)' }}>
        {q}/{total}
      </div>
    </div>
  );
}
