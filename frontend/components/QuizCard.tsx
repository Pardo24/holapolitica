'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';

import { ResultPill } from '@/components/ResultPill';
import type { Vote } from '@/lib/api';

/**
 * Quiz interaction shell — the Server Component on /joc builds the
 * question + options, this client component owns the
 * "pick → submit → reveal → next" state machine. Kept small so the
 * generation logic (random picks, distractors) stays server-side
 * where the data lives.
 *
 * Two render branches by ``question.kind`` ('proposer' vs 'result')
 * share the same shell — the summary card, the options grid, the
 * reveal panel with the actual vote breakdown and the 'New
 * question' refresh button. Reveal uses the actual counts (not a
 * percent) so the reader sees the literal record, in line with
 * Hola Política's no-aggregate-without-counts posture.
 */

export type QuizQuestion =
  | {
      kind: 'proposer';
      vote: Vote;
      /** Display text for the law title — already sanitized by the server. */
      subject: string;
      summary: string;
      options: { id: string; label: string; color: string | null }[];
      correctId: string;
    }
  | {
      kind: 'result';
      vote: Vote;
      /** Display text for the law title — raw, no redaction needed here. */
      subject: string;
      summary: string;
    };

interface Labels {
  question_proposer: string;
  question_result: string;
  result_approved: string;
  result_rejected: string;
  result_tie: string;
  submit: string;
  correct: string;
  wrong: string;
  actual_breakdown: string;
  go_to_vote: string;
  new_question: string;
  aye_label: string;
  no_label: string;
  abst_label: string;
}

export function QuizCard({
  question,
  labels,
}: {
  question: QuizQuestion;
  labels: Labels;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Result branch: options are always {approved, rejected, tie}. We
  // build them client-side using the labels passed in by the
  // Server Component so the i18n stays consistent.
  const resultOptions: { id: 'approved' | 'rejected' | 'tie'; label: string }[] =
    question.kind === 'result'
      ? [
          { id: 'approved', label: labels.result_approved },
          { id: 'rejected', label: labels.result_rejected },
          { id: 'tie', label: labels.result_tie },
        ]
      : [];

  const correctId =
    question.kind === 'proposer'
      ? question.correctId
      : question.vote.result;
  const wasCorrect = picked === correctId;

  // Server has already sanitized the subject for proposer-kind
  // questions (stripped "del Grupo Parlamentario X" patterns) so the
  // headline can't leak the answer. We trust that string verbatim.
  const subject = question.subject;

  return (
    <section
      style={{
        border: '1px solid var(--ink)',
        background: 'var(--paper)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Question prompt */}
      <div>
        <div
          className="eyebrow"
          style={{ fontSize: 10, marginBottom: 6, color: 'var(--ink-3)' }}
        >
          {question.kind === 'proposer'
            ? labels.question_proposer
            : labels.question_result}
        </div>
        <h2
          className="serif"
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.4,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
          }}
        >
          {subject}
        </h2>
      </div>

      {/* Plain-language summary card — the context the reader needs
          before picking. Kept compact; the full vote page has more. */}
      <p
        className="serif"
        style={{
          margin: 0,
          padding: '12px 14px',
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--ink-2)',
          whiteSpace: 'pre-line',
        }}
      >
        {question.summary}
      </p>

      {/* Options. Disabled after submit; the picked one gets
          highlighted in green/red after reveal so the reader sees
          their own answer too. */}
      <ul
        className={question.kind === 'proposer' ? 'quiz-options quiz-options--grid' : 'quiz-options'}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: 8,
        }}
      >
        {question.kind === 'proposer'
          ? question.options.map((opt) => (
              <OptionButton
                key={opt.id}
                id={opt.id}
                label={opt.label}
                color={opt.color}
                picked={picked === opt.id}
                isCorrect={opt.id === correctId}
                revealed={revealed}
                disabled={revealed}
                onPick={setPicked}
              />
            ))
          : resultOptions.map((opt) => (
              <OptionButton
                key={opt.id}
                id={opt.id}
                label={opt.label}
                color={
                  opt.id === 'approved'
                    ? 'var(--aye)'
                    : opt.id === 'rejected'
                      ? 'var(--no)'
                      : 'var(--abst)'
                }
                picked={picked === opt.id}
                isCorrect={opt.id === correctId}
                revealed={revealed}
                disabled={revealed}
                onPick={setPicked}
              />
            ))}
      </ul>

      {/* Action row — submit before reveal, then split into the
          verdict + breakdown + next-question affordances. */}
      {!revealed ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={picked == null}
            onClick={() => setRevealed(true)}
            style={{
              padding: '10px 16px',
              background: picked == null ? 'var(--paper-2)' : 'var(--ink)',
              color: picked == null ? 'var(--ink-3)' : 'var(--paper)',
              border: `1px solid ${picked == null ? 'var(--rule)' : 'var(--ink)'}`,
              fontSize: 13,
              fontWeight: 600,
              cursor: picked == null ? 'not-allowed' : 'pointer',
            }}
          >
            {labels.submit}
          </button>
        </div>
      ) : (
        <RevealPanel
          wasCorrect={wasCorrect}
          vote={question.vote}
          labels={labels}
        />
      )}
    </section>
  );
}

function OptionButton({
  id,
  label,
  color,
  picked,
  isCorrect,
  revealed,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  color: string | null;
  picked: boolean;
  isCorrect: boolean;
  revealed: boolean;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  // After reveal: every option gets coloured. The picked option goes
  // green (correct) or red (wrong); the actual correct one ALSO
  // goes green even if the reader didn't pick it (so they learn).
  const revealState = revealed
    ? isCorrect
      ? 'correct'
      : picked
        ? 'wrong'
        : 'dimmed'
    : picked
      ? 'picked'
      : 'idle';
  const bg =
    revealState === 'correct'
      ? 'color-mix(in oklch, var(--aye) 14%, var(--paper))'
      : revealState === 'wrong'
        ? 'color-mix(in oklch, var(--no) 14%, var(--paper))'
        : revealState === 'picked'
          ? 'var(--paper-2)'
          : 'var(--paper)';
  const borderColor =
    revealState === 'correct'
      ? 'var(--aye)'
      : revealState === 'wrong'
        ? 'var(--no)'
        : revealState === 'picked'
          ? 'var(--ink)'
          : 'var(--rule)';

  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(id)}
        aria-pressed={picked}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '11px 14px',
          background: bg,
          border: `1px solid ${borderColor}`,
          color: 'var(--ink)',
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          opacity: revealState === 'dimmed' ? 0.55 : 1,
        }}
      >
        {color && (
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: color,
              flex: 'none',
            }}
          />
        )}
        <span style={{ flex: 1 }}>{label}</span>
        {revealState === 'correct' && (
          <Check size={16} aria-hidden="true" color="var(--aye)" />
        )}
        {revealState === 'wrong' && (
          <X size={16} aria-hidden="true" color="var(--no)" />
        )}
      </button>
    </li>
  );
}

function RevealPanel({
  wasCorrect,
  vote,
  labels,
}: {
  wasCorrect: boolean;
  vote: Vote;
  labels: Labels;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '14px 16px',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
          fontWeight: 700,
          color: wasCorrect ? 'var(--aye)' : 'var(--no)',
        }}
      >
        {wasCorrect ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <X size={18} aria-hidden="true" />
        )}
        {wasCorrect ? labels.correct : labels.wrong}
      </div>

      <div>
        <div
          className="eyebrow"
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            marginBottom: 6,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          {labels.actual_breakdown}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <ResultPill
            result={vote.result}
            label={
              vote.result === 'approved'
                ? labels.result_approved
                : vote.result === 'rejected'
                  ? labels.result_rejected
                  : labels.result_tie
            }
          />
          <span>
            <strong
              className="tabular"
              style={{ color: 'var(--aye)', fontWeight: 700 }}
            >
              {vote.ayes}
            </strong>{' '}
            <span style={{ color: 'var(--ink-3)' }}>{labels.aye_label}</span>
          </span>
          <span>
            <strong
              className="tabular"
              style={{ color: 'var(--no)', fontWeight: 700 }}
            >
              {vote.noes}
            </strong>{' '}
            <span style={{ color: 'var(--ink-3)' }}>{labels.no_label}</span>
          </span>
          {vote.abstentions > 0 && (
            <span>
              <strong
                className="tabular"
                style={{ color: 'var(--abst)', fontWeight: 700 }}
              >
                {vote.abstentions}
              </strong>{' '}
              <span style={{ color: 'var(--ink-3)' }}>{labels.abst_label}</span>
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href={`/votes/${vote.id}` as Route}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            border: '1px solid var(--ink)',
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {labels.go_to_vote}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: '1px solid var(--ink)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {labels.new_question}
        </button>
      </div>
    </div>
  );
}
