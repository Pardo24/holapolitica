'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  Clock,
  Crown,
  Flame,
  Globe,
  Scale,
  Scissors,
  SkipForward,
  Star,
  Sword,
  ToggleLeft,
  Users,
} from 'lucide-react';

import { groupAbbreviation } from '@/lib/groups';
import type { Cat, DuelQuestion } from '@/lib/triviaBank';
import { recordResult, type TriviaStats } from '@/lib/triviaStats';

/**
 * "Trivia" — an async 1v1 duel, Preguntados-style. On your turn you spin a
 * roulette for a category (Lleis / Partits / Veritat o Fals / Món) or the
 * golden Corona slot; answer a timed question, and a correct answer wins that
 * category's quesito. Three lives (a miss = wrong or time-out) end the turn,
 * or you win by collecting every quesito. Comodins (50/50, skip, +time) help.
 * A seeded share link drops a friend onto the same pools; their result rides in
 * the URL so the winner is shown.
 *
 * Neutral by construction: vote questions are factual recall of the public
 * record; the general-knowledge bank is curated verifiable civic facts.
 */
const CAT_COLOR: Record<Cat, string> = {
  lleis: '#1D9E75',
  partits: '#7F77DD',
  vf: '#378ADD',
  mon: '#EF9F27',
};
const CORONA_COLOR = '#E0B341';
const LIVES = 3;
const SECONDS = 20;
const ADD_TIME = 10;

type WheelSlot = Cat | 'corona';
type Phase = 'spin' | 'question' | 'feedback' | 'corona-claim' | 'over';

export interface TriviaLabels {
  category_partits: string;
  category_lleis: string;
  category_vf: string;
  category_mon: string;
  corona: string;
  explore: string;
  unavailable: string;
  challenge: string;
  challenge_copied: string;
  challenge_text: string; // {score} {total}
  play_again: string;
  spin_cta: string;
  continue: string;
  time_up: string;
  correct: string;
  wrong: string;
  quesitos_count: string; // {n} {total}
  turn_won_title: string;
  turn_over_title: string;
  corona_win: string; // shown when a corona answer is correct
  corona_pick: string; // "choose a quesito"
  fifty: string;
  skip: string;
  add_time: string;
  duel_intro: string; // {q}
  duel_you: string;
  duel_rival: string;
  duel_win: string;
  duel_lose: string;
  duel_tie: string;
  daily_badge: string;
  best_label: string; // {n}
  streak_label: string; // {n}
}

export interface RivalResult {
  quesitos: number;
  used: number;
}

const CAT_ICON: Record<WheelSlot, typeof Scale> = {
  lleis: Scale,
  partits: Users,
  vf: ToggleLeft,
  mon: Globe,
  corona: Crown,
};

const TRIVIA_CSS = `
.trivia-card { animation: trivia-in 320ms ease both; }
.trivia-opt { transition: border-color 180ms ease, background-color 180ms ease, transform 120ms ease, opacity 180ms ease; }
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
.trivia-comodin { transition: transform 120ms ease, opacity 150ms ease; }
.trivia-comodin:not(:disabled):active { transform: scale(.94); }
@keyframes trivia-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes trivia-up { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes trivia-pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes trivia-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
@keyframes trivia-wheel-in { from { opacity: 0; transform: scale(.78) rotate(-14deg); } to { opacity: 1; transform: none; } }
@keyframes trivia-score-pop { 0% { opacity: 0; transform: scale(.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .trivia-card, .trivia-opt--correct, .trivia-opt--wrong, .trivia-reveal, .trivia-next,
  .trivia-result, .trivia-score, .trivia-quesito-fill, .trivia-life-lost { animation: none !important; }
  .trivia-opt, .trivia-wheel-spin, .trivia-comodin { transition: none !important; }
}
`;

export function TriviaGame({
  pools,
  seed,
  rival,
  daily = false,
  labels,
}: {
  pools: Record<Cat, DuelQuestion[]>;
  seed: number;
  rival: RivalResult | null;
  daily?: boolean;
  labels: TriviaLabels;
}) {
  const allCats = useMemo(() => {
    const order: Cat[] = ['lleis', 'partits', 'vf', 'mon'];
    return order.filter((c) => (pools[c]?.length ?? 0) > 0);
  }, [pools]);
  const target = allCats.length;

  const [phase, setPhase] = useState<Phase>('spin');
  const [slot, setSlot] = useState<WheelSlot | null>(null);
  const [q, setQ] = useState<DuelQuestion | null>(null);
  const [collected, setCollected] = useState<Cat[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [used, setUsed] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lostLife, setLostLife] = useState(false);
  const [hidden, setHidden] = useState<number[]>([]);
  const [comodins, setComodins] = useState({ fifty: true, skip: true, addTime: true });
  const [stats, setStats] = useState<TriviaStats | null>(null);

  // Persist the turn locally once it ends (best score, and the daily streak).
  useEffect(() => {
    if (phase === 'over') setStats(recordResult(collected.length, daily));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cursors = useRef<Record<Cat, number>>({ lleis: 0, partits: 0, vf: 0, mon: 0 });
  const pendingSlot = useRef<WheelSlot | null>(null);

  const remaining = useMemo(() => allCats.filter((c) => !collected.includes(c)), [allCats, collected]);
  // Wheel: the still-missing categories plus the golden Corona while any remain.
  const wheelSlots = useMemo<WheelSlot[]>(
    () => (remaining.length > 0 ? [...remaining, 'corona'] : []),
    [remaining],
  );

  const catLabel = (c: WheelSlot): string =>
    c === 'corona'
      ? labels.corona
      : c === 'partits'
        ? labels.category_partits
        : c === 'vf'
          ? labels.category_vf
          : c === 'mon'
            ? labels.category_mon
            : labels.category_lleis;

  const slotColor = (s: WheelSlot): string => (s === 'corona' ? CORONA_COLOR : CAT_COLOR[s]);

  function nextQuestion(c: Cat): DuelQuestion | null {
    const list = pools[c];
    if (!list || list.length === 0) return null;
    const i = cursors.current[c];
    cursors.current[c] = i + 1;
    return list[i % list.length] ?? null;
  }

  function spin() {
    if (spinning || wheelSlots.length === 0) return;
    const j = Math.floor(Math.random() * wheelSlots.length);
    pendingSlot.current = wheelSlots[j]!;
    const sector = 360 / wheelSlots.length;
    const need = (360 - (j * sector + sector / 2) + 360) % 360;
    const current = ((wheelAngle % 360) + 360) % 360;
    const delta = (need - current + 360) % 360;
    setWheelAngle(wheelAngle + 360 * 4 + delta);
    setSpinning(true);
  }

  function onWheelStopped() {
    if (!spinning) return;
    setSpinning(false);
    const s = pendingSlot.current;
    if (!s) return;
    // Corona draws a general-knowledge question; winning lets you claim any
    // missing quesito. Otherwise the landed category serves its own question.
    const drawFrom: Cat = s === 'corona' ? (pools.mon.length > 0 ? 'mon' : remaining[0]!) : s;
    setSlot(s);
    setQ(nextQuestion(drawFrom));
    setSelected(null);
    setHidden([]);
    setTimeLeft(SECONDS);
    setPhase('question');
  }

  function answer(i: number) {
    if (phase !== 'question' || !q || !slot) return;
    const correct = i >= 0 && !!q.options[i]?.correct;
    setSelected(i);
    setUsed((u) => u + 1);
    if (correct) {
      if (slot === 'corona') {
        // Claim happens in the corona-claim step.
      } else {
        setCollected((prev) => (prev.includes(slot) ? prev : [...prev, slot]));
      }
    } else {
      setLives((l) => l - 1);
      setLostLife(true);
    }
    setPhase(correct && slot === 'corona' ? 'corona-claim' : 'feedback');
  }

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

  function claimCorona(c: Cat) {
    setCollected((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setPhase('feedback');
  }

  function proceed() {
    setLostLife(false);
    if (lives <= 0 || collected.length >= target) {
      setPhase('over');
    } else {
      setPhase('spin');
    }
  }

  function useFifty() {
    if (!comodins.fifty || phase !== 'question' || !q || q.options.length < 4) return;
    const wrong = q.options.map((o, i) => (!o.correct ? i : -1)).filter((i) => i >= 0);
    // Hide two wrong options.
    const toHide = wrong.slice(0, 2);
    setHidden(toHide);
    setComodins((c) => ({ ...c, fifty: false }));
  }
  function useSkip() {
    if (!comodins.skip || phase !== 'question') return;
    setComodins((c) => ({ ...c, skip: false }));
    setSelected(null);
    setHidden([]);
    setPhase('spin');
  }
  function useAddTime() {
    if (!comodins.addTime || phase !== 'question') return;
    setTimeLeft((t) => t + ADD_TIME);
    setComodins((c) => ({ ...c, addTime: false }));
  }

  function reset() {
    cursors.current = { lleis: 0, partits: 0, vf: 0, mon: 0 };
    setCollected([]);
    setLives(LIVES);
    setSelected(null);
    setUsed(0);
    setSlot(null);
    setQ(null);
    setCopied(false);
    setLostLife(false);
    setHidden([]);
    setComodins({ fifty: true, skip: true, addTime: true });
    setPhase('spin');
  }

  async function challenge() {
    const url = `${window.location.origin}/joc?repte=${seed}&rq=${collected.length}&ru=${used}`;
    const text = `${labels.challenge_text
      .replace('{score}', String(collected.length))
      .replace('{total}', String(target))} ${url}`;
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

  if (allCats.length < 2) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{labels.unavailable}</p>;
  }

  // ─── Result ────────────────────────────────────────────────────────────────
  if (phase === 'over') {
    const wonAll = collected.length >= target;
    let duel: 'win' | 'lose' | 'tie' | null = null;
    if (rival) {
      if (collected.length > rival.quesitos || (collected.length === rival.quesitos && used < rival.used))
        duel = 'win';
      else if (collected.length === rival.quesitos && used === rival.used) duel = 'tie';
      else duel = 'lose';
    }
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <style>{TRIVIA_CSS}</style>
        {daily && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
              padding: '4px 12px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--accent) 14%, var(--paper))',
              color: 'var(--ink)',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <Sword size={14} strokeWidth={2} aria-hidden="true" />
            {labels.daily_badge}
          </div>
        )}
        <div className="trivia-result" style={{ display: 'block' }}>
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

        {stats && (stats.best > 0 || stats.streak > 0) && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              marginTop: 8,
              fontSize: 13,
              color: 'var(--ink-3)',
            }}
          >
            {daily && stats.streak > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Flame size={14} strokeWidth={2} aria-hidden="true" style={{ color: '#EF9F27' }} />
                {labels.streak_label.replace('{n}', String(stats.streak))}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Star size={14} strokeWidth={2} aria-hidden="true" style={{ color: '#E0B341' }} />
              {labels.best_label.replace('{n}', String(stats.best))}
            </span>
          </div>
        )}

        {rival && duel && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center' }}>
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
            onClick={reset}
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

      {/* Status: quesitos + lives */}
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

      {phase === 'spin' && (
        <div className="trivia-card" style={{ textAlign: 'center', padding: '8px 0' }}>
          <Roulette slots={wheelSlots} angle={wheelAngle} slotColor={slotColor} onStopped={onWheelStopped} />
          <button type="button" onClick={spin} disabled={spinning} className="btn-ink" style={{ marginTop: 18, minWidth: 180 }}>
            {labels.spin_cta}
          </button>
        </div>
      )}

      {(phase === 'question' || phase === 'feedback' || phase === 'corona-claim') && q && slot && (
        <QuestionCard
          q={q}
          slot={slot}
          color={slotColor(slot)}
          chip={catLabel(slot)}
          Icon={CAT_ICON[slot]}
          phase={phase}
          selected={selected}
          hidden={hidden}
          timeLeft={timeLeft}
          comodins={comodins}
          labels={labels}
          missing={remaining}
          catLabel={catLabel}
          slotColor={slotColor}
          CatIcon={CAT_ICON}
          onPick={answer}
          onProceed={proceed}
          onFifty={useFifty}
          onSkip={useSkip}
          onAddTime={useAddTime}
          onClaim={claimCorona}
        />
      )}
    </div>
  );
}

function QuestionCard({
  q,
  slot,
  color,
  chip,
  Icon,
  phase,
  selected,
  hidden,
  timeLeft,
  comodins,
  labels,
  missing,
  catLabel,
  slotColor,
  CatIcon,
  onPick,
  onProceed,
  onFifty,
  onSkip,
  onAddTime,
  onClaim,
}: {
  q: DuelQuestion;
  slot: WheelSlot;
  color: string;
  chip: string;
  Icon: typeof Scale;
  phase: Phase;
  selected: number | null;
  hidden: number[];
  timeLeft: number;
  comodins: { fifty: boolean; skip: boolean; addTime: boolean };
  labels: TriviaLabels;
  missing: Cat[];
  catLabel: (s: WheelSlot) => string;
  slotColor: (s: WheelSlot) => string;
  CatIcon: Record<WheelSlot, typeof Scale>;
  onPick: (i: number) => void;
  onProceed: () => void;
  onFifty: () => void;
  onSkip: () => void;
  onAddTime: () => void;
  onClaim: (c: Cat) => void;
}) {
  const answered = phase === 'feedback' || phase === 'corona-claim';
  const timedOut = answered && selected === -1;
  const gotItRight = answered && selected !== null && selected >= 0 && !!q.options[selected]?.correct;
  const canFifty = comodins.fifty && q.options.length >= 4;

  return (
    <div className="trivia-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#fff',
            background: color,
            padding: '3px 10px',
            borderRadius: 999,
          }}
        >
          <Icon size={13} strokeWidth={2} aria-hidden="true" />
          {chip}
        </span>
        {phase === 'question' && (
          <span className="tabular" style={{ fontSize: 13, fontWeight: 700, color: timeLeft <= 5 ? 'var(--no)' : 'var(--ink-3)' }}>
            {timeLeft}s
          </span>
        )}
      </div>

      {phase === 'question' && (
        <div style={{ height: 4, borderRadius: 999, background: 'var(--paper-3)', overflow: 'hidden', marginBottom: 14 }}>
          <div
            style={{
              width: `${Math.min(100, (timeLeft / SECONDS) * 100)}%`,
              height: '100%',
              background: timeLeft <= 5 ? 'var(--no)' : color,
              transition: 'width 1s linear',
            }}
          />
        </div>
      )}

      {/* Law context — only for vote-based cards. */}
      {q.lawSummary && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderLeft: `4px solid ${color}`,
            marginBottom: 16,
          }}
        >
          {q.topic && (
            <div className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}>
              {q.topic}
            </div>
          )}
          <p style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, margin: 0 }}>{q.lawSummary}</p>
        </div>
      )}

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
        {q.partySlug && <PartyBadge slug={q.partySlug} color={q.partyColor ?? null} />}
        {q.prompt}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {q.options.map((o, i) => {
          const isHidden = hidden.includes(i);
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
              disabled={answered || isHidden}
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
                opacity: isHidden ? 0.35 : 1,
                visibility: isHidden ? 'hidden' : 'visible',
              }}
            >
              {o.partySlug && <PartyBadge slug={o.partySlug} color={o.partyColor ?? null} />}
              {o.text}
            </button>
          );
        })}
      </div>

      {/* Comodins — only while answering */}
      {phase === 'question' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
          <Comodin label={labels.fifty} icon={<Scissors size={15} aria-hidden="true" />} disabled={!canFifty} onClick={onFifty} />
          <Comodin label={labels.add_time} icon={<Clock size={15} aria-hidden="true" />} disabled={!comodins.addTime} onClick={onAddTime} />
          <Comodin label={labels.skip} icon={<SkipForward size={15} aria-hidden="true" />} disabled={!comodins.skip} onClick={onSkip} />
        </div>
      )}

      {/* Corona claim: pick which quesito to take */}
      {phase === 'corona-claim' && (
        <div className="trivia-reveal" style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px', color: CORONA_COLOR }}>{labels.corona_win}</p>
          <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 10px' }}>{labels.corona_pick}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {missing.map((c) => {
              const Ic = CatIcon[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onClaim(c)}
                  className="trivia-opt"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: `1.5px solid ${slotColor(c)}`,
                    background: `color-mix(in srgb, ${slotColor(c)} 12%, var(--paper))`,
                    color: 'var(--ink)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Ic size={15} aria-hidden="true" style={{ color: slotColor(c) }} />
                  {catLabel(c)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase === 'feedback' && (
        <div
          className="trivia-reveal"
          style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--paper-2)', border: '1px solid var(--rule)' }}
        >
          <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 4px', color: gotItRight ? 'var(--aye)' : 'var(--no)' }}>
            {timedOut ? labels.time_up : gotItRight ? labels.correct : labels.wrong}
          </p>
          {q.reveal && <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{q.reveal}</p>}
          {q.sourceId != null && (
            <Link
              href={`/votes/${q.sourceId}` as Route}
              style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}
            >
              {labels.explore} →
            </Link>
          )}
        </div>
      )}

      {phase === 'feedback' && (
        <button type="button" onClick={onProceed} className="btn-ink trivia-next" style={{ marginTop: 16, width: '100%' }}>
          {labels.continue}
        </button>
      )}
    </div>
  );
}

function Comodin({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="trivia-comodin"
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        borderRadius: 999,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        color: disabled ? 'var(--ink-3)' : 'var(--ink-2)',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Roulette({
  slots,
  angle,
  slotColor,
  onStopped,
}: {
  slots: WheelSlot[];
  angle: number;
  slotColor: (s: WheelSlot) => string;
  onStopped: () => void;
}) {
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const n = Math.max(slots.length, 1);
  const sector = 360 / n;
  const toXY = (deg: number, rr: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const wedge = (i: number): string => {
    const [x0, y0] = toXY(i * sector, r);
    const [x1, y1] = toXY((i + 1) * sector, r);
    const large = sector > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Ruleta de categories">
      <g className="trivia-wheel-spin" style={{ transform: `rotate(${angle}deg)` }} onTransitionEnd={onStopped}>
        {slots.map((s, i) => (
          <path key={`${s}-${i}`} d={wedge(i)} fill={slotColor(s)} fillOpacity={s === 'corona' ? 1 : 0.92} stroke="var(--paper)" strokeWidth="2" />
        ))}
        {slots.map((s, i) => {
          const mid = i * sector + sector / 2;
          const [ix, iy] = toXY(mid, r * 0.64);
          const Ic = CAT_ICON[s];
          return (
            <g key={`${s}-${i}-i`} transform={`rotate(${mid} ${ix} ${iy})`}>
              <g transform={`translate(${ix - 11} ${iy - 11})`}>
                <Ic width={22} height={22} color="#fff" strokeWidth={2} aria-hidden="true" />
              </g>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="15" fill="var(--paper)" stroke="var(--rule-strong)" strokeWidth="1.5" />
      </g>
      {/* Selector pointer — drawn AFTER the wheel so it's never covered by it.
          A bold marker at 12 o'clock with a paper outline so it reads against
          any sector colour, its tip biting into the rim to mark the pick. */}
      <polygon
        points={`${cx - 14},1 ${cx + 14},1 ${cx},30`}
        fill="var(--ink)"
        stroke="var(--paper)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
