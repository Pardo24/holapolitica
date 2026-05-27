import type { Metadata, Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { QuizCard } from '@/components/QuizCard';
import { api, type Vote } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';

/**
 * Civic quiz — gamified learning surface.
 *
 * Picks one recent vote that has a plain-language summary AND a
 * clear proposer (proposing_group_short or proposed_by_government).
 * Two question types alternate at random:
 *
 *   - proposer: 'Who tabled this law?' — 4 multiple-choice options
 *     (the real proposer plus 3 random distractor groups).
 *   - result: 'Was this approved?' — 3 options (approved / rejected /
 *     tie).
 *
 * After the reader picks, the card reveals the real answer with the
 * actual vote breakdown and a link to the full vote record. A 'New
 * question' button reloads the page with a fresh random vote.
 *
 * Neutrality (CLAUDE.md 'mirror not megaphone'): every vote in the
 * candidate pool is eligible; we don't curate by topic or by who
 * tabled it. Result-type questions are random across approved /
 * rejected / tie. Distractor groups are sampled uniformly from the
 * other live groups so no group gets editorial weight.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('quiz');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

const ELIGIBLE_PAGE_SIZE = 80;

type QuizQuestion =
  | {
      kind: 'proposer';
      vote: Vote;
      /** Display text for the law title — sanitized to remove proposer hints. */
      subject: string;
      summary: string;
      options: { id: string; label: string; color: string | null }[];
      correctId: string;
    }
  | {
      kind: 'result';
      vote: Vote;
      /** Display text for the law title — proposer kept (result quiz doesn't care). */
      subject: string;
      summary: string;
    };

function pickEligibleVote(items: Vote[], locale: string): Vote | null {
  // Filter: needs a plain summary (so the question has context),
  // and an unambiguous proposer (either a parliamentary group with
  // a non-empty name or proposed_by_government). 'Tie' results are
  // accepted as their own option in result-type questions.
  const eligible = items.filter((v) => {
    const hasSummary = !!pickPlainSummary(v, locale);
    const hasProposer = !!v.proposing_group_short || v.proposed_by_government;
    return hasSummary && hasProposer;
  });
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)] ?? null;
}

/**
 * Redact proposer mentions from a piece of vote-related text so the
 * quiz's "who tabled this?" question doesn't give the answer away in
 * the prompt. The Congreso's own vote descriptions are formatted as
 * "Proposición no de Ley del Grupo Parlamentario X, sobre Y" — and
 * sometimes the LLM-generated plain summary echoes the same phrase —
 * so a player who reads the subject can read the answer too. We:
 *
 *   - strip the "del Grupo Parlamentario <name>" boilerplate that
 *     follows an initiative type label;
 *   - strip "del Gobierno" / "del Govern" only when this vote is
 *     actually government-proposed (avoids over-redacting unrelated
 *     mentions in non-government summaries);
 *   - blank out any literal occurrence of the actual proposer's
 *     short name (case-insensitive, word-boundary) with an ellipsis.
 *
 * Only applied to proposer-type questions; result-type questions
 * happily keep the proposer name in view.
 */
const PROPOSER_REDACTION = /,?\s*del\s+grupo\s+parlamentario\s+[^,.;]+([,.;]|$)/gi;
const GOVERNMENT_PATTERNS: RegExp[] = [
  /,?\s*del\s+gobierno\b/gi,
  /,?\s*del\s+govern\b/gi,
  /,?\s*by\s+the\s+government\b/gi,
];

function sanitizeForProposerQuiz(text: string, vote: Vote): string {
  let s = text.replace(PROPOSER_REDACTION, '$1');
  if (vote.proposed_by_government) {
    for (const re of GOVERNMENT_PATTERNS) s = s.replace(re, '');
  }
  if (vote.proposing_group_short) {
    const esc = vote.proposing_group_short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '[…]');
  }
  // Collapse double spaces / orphan commas left behind by the regex
  // replacements so the prompt reads cleanly.
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim();
}

export default async function JocPage() {
  const t = await getTranslations('quiz');
  const locale = await getLocale();

  // Fetch a wide-enough page so the random pick has variety even
  // when many recent votes are procedural (no summary, no proposer).
  // Filtered down server-side; the client never sees the bigger pool.
  const page = await api.votes
    .list({ page: 1, page_size: ELIGIBLE_PAGE_SIZE })
    .catch(() => null);
  const items = page?.items ?? [];
  const vote = pickEligibleVote(items, locale);

  if (vote == null) {
    return (
      <article style={{ maxWidth: 680, paddingTop: 24, paddingBottom: 48 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {t('eyebrow')}
        </div>
        <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
          {t('h1')}
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('empty')}</p>
      </article>
    );
  }

  const rawSummary = pickPlainSummary(vote, locale)!;
  const rawSubject = vote.description?.trim() || vote.title;

  // Build the question. 50/50 between the two question kinds; when
  // the vote doesn't have a clear group-level proposer (only the
  // government flag), proposer questions are still meaningful — the
  // 'Govern' option becomes the correct answer.
  const kind: 'proposer' | 'result' = Math.random() < 0.5 ? 'proposer' : 'result';

  // For proposer questions we redact group references from BOTH the
  // headline (`subject`) and the LLM summary so the prompt doesn't
  // hand the player the answer. Result questions keep the raw text.
  const subject =
    kind === 'proposer' ? sanitizeForProposerQuiz(rawSubject, vote) : rawSubject;
  const summary =
    kind === 'proposer' ? sanitizeForProposerQuiz(rawSummary, vote) : rawSummary;

  let question: QuizQuestion;
  if (kind === 'proposer') {
    const govLabel = t('option_government');
    const correctLabel = vote.proposing_group_short ?? govLabel;
    const correctColor = vote.proposing_group_color ?? null;

    // Distractor pool — every OTHER group + Govern, sampled
    // uniformly. We pick from the candidate set itself so we don't
    // need a separate /groups fetch; this also keeps distractors
    // relevant (they're groups that have proposed recently).
    const others = new Map<string, { id: string; label: string; color: string | null }>();
    for (const v of items) {
      if (v.proposing_group_short && v.proposing_group_short !== correctLabel) {
        others.set(v.proposing_group_short, {
          id: v.proposing_group_short,
          label: v.proposing_group_short,
          color: v.proposing_group_color ?? null,
        });
      }
      if (v.proposed_by_government && correctLabel !== govLabel) {
        others.set(govLabel, {
          id: govLabel,
          label: govLabel,
          color: null,
        });
      }
    }
    const distractors = Array.from(others.values())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [
      { id: correctLabel, label: correctLabel, color: correctColor },
      ...distractors,
    ].sort(() => Math.random() - 0.5);

    question = {
      kind: 'proposer',
      vote,
      subject,
      summary,
      options,
      correctId: correctLabel,
    };
  } else {
    question = { kind: 'result', vote, subject, summary };
  }

  return (
    <article style={{ maxWidth: 680, paddingTop: 24, paddingBottom: 48 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {t('eyebrow')}
      </div>
      <h1
        className="h-headline"
        style={{ margin: '6px 0 8px', fontSize: 'clamp(24px, 3vw, 32px)' }}
      >
        {t('h1')}
      </h1>
      <p
        style={{
          margin: '0 0 22px',
          fontSize: 14,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
          maxWidth: 560,
        }}
      >
        {t('lede')}
      </p>

      <QuizCard
        question={question}
        labels={{
          question_proposer: t('question_proposer'),
          question_result: t('question_result'),
          result_approved: t('result_approved'),
          result_rejected: t('result_rejected'),
          result_tie: t('result_tie'),
          submit: t('submit'),
          correct: t('correct'),
          wrong: t('wrong'),
          actual_breakdown: t('actual_breakdown'),
          go_to_vote: t('go_to_vote'),
          new_question: t('new_question'),
          aye_label: t('aye_label'),
          no_label: t('no_label'),
          abst_label: t('abst_label'),
        }}
      />

      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
          maxWidth: 560,
        }}
      >
        {t.rich('about_quiz', {
          link: (chunks) => (
            <a
              href={'/avui' as Route}
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </article>
  );
}
