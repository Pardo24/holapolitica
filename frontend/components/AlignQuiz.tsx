'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import type { AlignQuestion } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { SummaryBody } from '@/components/SummaryBody';
import { summaryHeadline } from '@/lib/plainSummary';
import { ProfileEffectsClient, effectsItems } from '@/components/ProfileEffectsClient';
import { pickTopicName } from '@/lib/topics';
import { openShareSheet } from '@/lib/native';

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
  results_topics: string;
  share: string;
  share_copied: string;
  share_text: string; // uses {name}, {pct}, {compared}
  /** Both plural forms as plain strings: a server component cannot hand a
   *  function to a client component, and React throws when it tries. */
  see_results: { one: string; other: string };
  more_questions: string;
  results_votes: string; // uses {name}
  read_more: string;
  read_less: string;
  results_same: string;
  results_diff: string;
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
  const [copied, setCopied] = useState(false);

  // The summary on the question card is clamped, because the long ones put
  // the answer buttons below the fold on a phone (measured at 375x812: six
  // of ten questions ran past it, and the bottom tab bar takes 58px more).
  // Five lines keeps every question answerable without scrolling. Whoever
  // wants the rest opens it in place; nothing is hidden without a way in.
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const total = questions.length;
  const currentVoteId = questions[idx]?.vote_id;

  useEffect(() => {
    setExpanded(false);
  }, [currentVoteId]);

  useEffect(() => {
    // Only measure while clamped: expanded, the element no longer overflows
    // and the toggle would vanish under the reader's finger.
    if (expanded) return;
    const el = summaryRef.current;
    setClipped(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [currentVoteId, expanded, done]);

  // Answers survive a reload. Keyed by the first vote of the set, so a
  // different set of questions never inherits answers from another one.
  // Storage can be unavailable (private windows, blocked cookies): every
  // access is guarded and the quiz works the same without it.
  const storageKey = `align:answers:${questions[0]?.vote_id ?? 'none'}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { answers?: Record<number, Answer>; idx?: number };
      if (saved.answers && typeof saved.answers === 'object') setAnswers(saved.answers);
      if (typeof saved.idx === 'number') setIdx(Math.min(Math.max(0, saved.idx), total - 1));
    } catch {
      /* no storage, or corrupt value: start clean */
    }
  }, [storageKey, total]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ answers, idx }));
    } catch {
      /* storage full or blocked */
    }
  }, [answers, idx, storageKey]);

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

  // The same coincidence, bucketed by the topics each answered vote carries.
  // One global percentage hides the interesting part: people rarely agree
  // with the same group on housing and on defence. Ties are shown in full
  // rather than broken arbitrarily, so the tool never invents a winner.
  const byTopic = useMemo(() => {
    interface Tally {
      name: string;
      agree: number;
      compared: number;
    }
    const agg = new Map<string, { topic: string; groups: Map<string, Tally> }>();
    for (const q of questions) {
      const ua = answers[q.vote_id];
      if (!ua || ua === 'skip') continue;
      for (const tp of q.topics) {
        const bucket = agg.get(tp.slug) ?? { topic: pickTopicName(tp, locale), groups: new Map() };
        for (const p of q.group_positions) {
          const g = bucket.groups.get(p.slug) ?? {
            name: displayGroupShort(p.name_short),
            agree: 0,
            compared: 0,
          };
          g.compared += 1;
          if (p.choice === ua) g.agree += 1;
          bucket.groups.set(p.slug, g);
        }
        agg.set(tp.slug, bucket);
      }
    }
    return [...agg.entries()]
      .map(([slug, b]) => {
        const tallies = [...b.groups.values()].filter((g) => g.compared > 0);
        if (tallies.length === 0) return null;
        const best = Math.max(...tallies.map((g) => g.agree / g.compared));
        const winners = tallies.filter((g) => g.agree / g.compared === best);
        const first = winners[0];
        if (!first) return null;
        return {
          slug,
          topic: b.topic,
          names: winners
            .slice(0, 3)
            .map((g) => g.name)
            .join(' · '),
          agree: first.agree,
          compared: first.compared,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.compared >= 2)
      .sort((a, b) => b.compared - a.compared)
      .slice(0, 6);
  }, [answers, questions, locale]);

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
    setCopied(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* nothing to clear */
    }
  }

  /** A different, reproducible set of votes from the same pool. */
  function moreQuestions() {
    const seed = Math.floor(Math.random() * 999_999) + 1;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* nothing to clear */
    }
    window.location.search = `?seed=${seed}`;
  }

  async function share() {
    const top = results[0];
    if (!top) return;
    const text = `${labels.share_text
      .replace('{name}', top.name)
      .replace('{pct}', String(Math.round(top.pct * 100)))
      .replace('{compared}', String(top.compared))} ${window.location.origin}/com-et-representen`;
    try {
      if (!(await openShareSheet({ text }))) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* dismissed or clipboard blocked */
    }
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

        {/* Vote by vote against the group you coincided with most. A single
            percentage is a dead end: this says which votes it came from and
            links each one, so a reader can check the claim. */}
        {answeredCount > 0 && results[0] && (
          <>
            <p style={{ ...EYEBROW, marginTop: 22 }}>
              {labels.results_votes.replace('{name}', results[0].name)}
            </p>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {questions
                .filter((q) => {
                  const a = answers[q.vote_id];
                  return a != null && a !== 'skip';
                })
                .map((q) => {
                  const mine = answers[q.vote_id];
                  const theirs = q.group_positions.find(
                    (p) => p.slug === results[0]!.slug,
                  )?.choice;
                  const same = theirs != null && theirs === mine;
                  // Two clamped lines per row: the lead reads as a title,
                  // where "… que: 1. Obligui… 2. Simplifiqui…" did not.
                  const text = summaryHeadline(
                    (locale.startsWith('es') ? q.plain_summary_es : q.plain_summary_ca) ||
                      q.plain_summary_es ||
                      q.title,
                  );
                  return (
                    <li key={q.vote_id}>
                      <Link
                        href={`/votes/${q.vote_id}` as Route}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--rule)',
                          background: 'var(--paper-2)',
                          textDecoration: 'none',
                          color: 'var(--ink-2)',
                          fontSize: 13,
                          lineHeight: 1.45,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            flex: 'none',
                            marginTop: 2,
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: same ? 'var(--aye)' : 'var(--no)',
                          }}
                        />
                        <span style={{ minWidth: 0, display: 'block' }}>
                          {/* The verdict on its own line: run inline, it was
                              swallowed by summaries that are a paragraph
                              long, which is exactly what the reader is
                              scanning for. */}
                          <span
                            style={{
                              display: 'block',
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: '0.07em',
                              textTransform: 'uppercase',
                              color: same ? 'var(--aye)' : 'var(--no)',
                              marginBottom: 3,
                            }}
                          >
                            {same ? labels.results_same : labels.results_diff}
                          </span>
                          {/* Two lines each: ten full summaries turned the
                              results into a wall of text on a phone. The row
                              links to the vote, where the whole thing is. */}
                          <span
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {text}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </>
        )}

        {byTopic.length > 0 && (
          <>
            <p style={{ ...EYEBROW, marginTop: 22 }}>{labels.results_topics}</p>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {byTopic.map((t) => (
                <li
                  key={t.slug}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '9px 11px',
                    borderRadius: 10,
                    border: '1px solid var(--rule)',
                    background: 'var(--paper-2)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', minWidth: 0 }}>{t.topic}</span>
                  <span style={{ fontSize: 13, textAlign: 'right', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                      {t.names}
                    </span>
                    <span
                      className="tabular"
                      style={{ color: 'var(--ink-3)', marginLeft: 6, whiteSpace: 'nowrap' }}
                    >
                      {labels.results_of_votes
                        .replace('{agree}', String(t.agree))
                        .replace('{compared}', String(t.compared))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" onClick={restart} className="btn-ink btn-sm">
            {labels.restart}
          </button>
          <button
            type="button"
            onClick={moreQuestions}
            className="btn-sm"
            style={{
              border: '1px solid var(--rule-strong)',
              borderRadius: 8,
              background: 'var(--paper)',
              color: 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {labels.more_questions}
          </button>
          {results.length > 0 && (
            <button
              type="button"
              onClick={share}
              className="btn-sm"
              style={{
                border: '1px solid var(--rule-strong)',
                borderRadius: 8,
                background: 'var(--paper)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {copied ? labels.share_copied : labels.share}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Question card ──────────────────────────────────────────────────────────
  const q = questions[idx];
  if (!q) return null;
  const summary = (locale.startsWith('es') ? q.plain_summary_es : q.plain_summary_ca) || q.plain_summary_ca || q.plain_summary_es;
  // The law's short plain title leads; the summary explains it underneath.
  const plainTitle =
    (locale.startsWith('es') ? q.plain_title_es : q.plain_title_ca) || q.plain_title_ca || q.plain_title_es;
  const pct = Math.round(((idx) / total) * 100);
  // "Com t'afecta" explains the law best; the summary stands in without it.
  const effects = plainTitle ? effectsItems(q.profile_effects, locale) : [];

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

      <div className="align-card">
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
            {plainTitle && <h2 className="serif align-card__title">{plainTitle}</h2>}
            {effects.length > 0 ? (
              <div style={{ margin: '0 0 12px' }}>
                <ProfileEffectsClient items={effects} max={3} />
              </div>
            ) : (
            <div
              ref={summaryRef}
              className={plainTitle ? 'align-card__summary' : 'serif'}
              style={{
                // Summaries run from 20 to 80 words. At a fixed 19px the long
                // ones pushed the answer buttons a full screen below the fold
                // on a phone, which is most of the traffic.
                ...(plainTitle
                  ? null
                  : {
                      fontSize: 'clamp(16px, 4vw, 19px)',
                      fontWeight: 600,
                      lineHeight: 1.4,
                      color: 'var(--ink)',
                    }),
                margin: '0 0 12px',
                // Height, not -webkit-line-clamp: the summary can be a
                // paragraph OR a lead plus a list, and line-clamp stops
                // clamping once the box has block children. Five lines at
                // the card's own line-height.
                ...(expanded
                  ? null
                  : { maxHeight: plainTitle ? 'calc(1.5em * 4)' : 'calc(1.4em * 5)', overflow: 'hidden' }),
              }}
            >
              {/* A motion asks several things, and the question card is
                  where the reader decides: the asks read as a list, not as
                  a paragraph with "1." and "2." buried inside it. The clamp
                  wraps both so the answer buttons stay on screen. */}
              <SummaryBody text={summary} listStyle={{ fontWeight: 500, gap: 4 }} />
            </div>
            )}
            {effects.length === 0 && clipped && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                style={{
                  display: 'inline-block',
                  margin: '-6px 0 12px',
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {expanded ? labels.read_less : labels.read_more}
              </button>
            )}
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
        <StanceButton
          label={labels.aye}
          color="var(--aye)"
          selected={answers[q.vote_id] === 'aye'}
          onClick={() => choose('aye')}
        />
        <StanceButton
          label={labels.no}
          color="var(--no)"
          selected={answers[q.vote_id] === 'no'}
          onClick={() => choose('no')}
        />
        <StanceButton
          label={labels.abstention}
          color="var(--abst)"
          selected={answers[q.vote_id] === 'abstention'}
          onClick={() => choose('abstention')}
        />
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
      {/* People answer three or four and want to know already. Waiting for
          all ten before showing anything is why they close the tab. */}
      {answeredCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setDone(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 4px',
              fontFamily: 'inherit',
            }}
          >
            {(answeredCount === 1 ? labels.see_results.one : labels.see_results.other).replace(
              '{n}',
              String(answeredCount),
            )}
          </button>
        </div>
      )}
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

function StanceButton({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string;
  /** The stance already chosen for this vote: going back must show it. */
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        padding: '14px 10px',
        borderRadius: 12,
        border: `1.5px solid ${color}`,
        background: selected ? `color-mix(in oklch, ${color} 16%, var(--paper))` : 'var(--paper)',
        boxShadow: selected ? `inset 0 0 0 2px ${color}` : 'none',
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
