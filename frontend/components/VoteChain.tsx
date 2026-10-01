import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultPill } from '@/components/ResultPill';
import type { InitiativeVoteSummary } from '@/lib/api';
import { pickPlainTitle } from '@/lib/glossary';

/**
 * Every vote a single law went through, in order.
 *
 * A law is not voted once. A bill is voted on its amendments, then on the
 * whole text, then again on whatever the Senate changed; a decree-law is
 * validated and then, separately, opened as a bill. Those votes were in the
 * data all along (each carries its initiative_id) and the pages showed them
 * as a collapsed list of dates, so the reader could see that there were four
 * votes and not what any of them decided or how they relate.
 *
 * Here they read as a chain: when, what was decided, how it ended. Shown on
 * the law's page, and on a vote's page with that vote marked, so you can
 * step backwards and forwards through the same law.
 */
export async function VoteChain({
  votes,
  locale,
  currentVoteId = null,
}: {
  votes: InitiativeVoteSummary[];
  locale: string;
  /** Marks the vote you are already reading, and stops it linking to itself. */
  currentVoteId?: number | null;
}) {
  const t = await getTranslations('initiative_detail');
  const tVotes = await getTranslations('votes');
  if (votes.length === 0) return null;

  // Same day, several votes: the id breaks the tie, which is the order the
  // session took them in.
  const ordered = [...votes].sort(
    (a, b) => a.voted_at.localeCompare(b.voted_at) || a.id - b.id,
  );

  return (
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {ordered.map((v, i) => {
        const isCurrent = v.id === currentVoteId;
        // No text at all? Then the date and the outcome are the row; a
        // bare "#16660" says nothing a reader can use.
        const headline =
          pickPlainTitle(v, locale) ?? v.description?.trim() ?? v.title?.trim() ?? '';
        const date = new Date(v.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' });
        const body = (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 2,
              }}
            >
              <span className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {date}
              </span>
              <ResultPill
                result={v.result}
                label={tVotes(`result.${v.result}` as 'result.approved')}
              />
              {isCurrent && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-2)',
                    background: 'var(--paper-3)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 999,
                    padding: '1px 7px',
                  }}
                >
                  {t('chain_you_are_here')}
                </span>
              )}
            </div>
            {headline && (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.4,
                color: isCurrent ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: isCurrent ? 600 : 400,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {headline}
            </div>
            )}
          </>
        );

        return (
          <li
            key={v.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '22px minmax(0, 1fr)',
              columnGap: 12,
              paddingBottom: i === ordered.length - 1 ? 0 : 14,
            }}
          >
            {/* The rail: a dot per vote, filled for the one you are on. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 999,
                  marginTop: 4,
                  flex: 'none',
                  background: isCurrent ? 'var(--ink)' : 'var(--paper)',
                  border: `2px solid ${isCurrent ? 'var(--ink)' : 'var(--rule-strong)'}`,
                }}
              />
              {i < ordered.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{ flex: 1, width: 2, background: 'var(--rule)', marginTop: 3 }}
                />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              {isCurrent ? (
                body
              ) : (
                <Link
                  href={`/votes/${v.id}` as Route}
                  style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                >
                  {body}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
