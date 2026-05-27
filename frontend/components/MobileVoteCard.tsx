import Link from 'next/link';
import type { Route } from 'next';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import { SummaryHover } from '@/components/SummaryHover';
import type { Vote } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * Mobile-only one-row-per-vote entry for the /votes list.
 *
 * The previous version of this card had its own border + corner
 * radius — visually a "card" — which set it apart from the flat
 * row style used on /topics/[slug] (InitiativeRow). Daniel asked
 * for visual coherence across every law-list surface, so this
 * component now renders as a flat row with a hairline divider, two
 * columns (compact date · title + meta strip) and a meta line that
 * dot-separates proposer chip · topic chips · expediente in mono.
 * Same layout vocabulary as the desktop /votes list — only the
 * column widths and font sizes adapt to mobile.
 */

interface Labels {
  proposed_by_government: string;
  result: string;
  ayes: string;
  noes: string;
  abstentions: string;
}

export function MobileVoteCard({
  vote,
  locale,
  plainSummary,
  labels,
}: {
  vote: Vote;
  locale: string;
  plainSummary: string | null;
  labels: Labels;
}) {
  const subject = vote.description?.trim() || vote.title;
  const date = new Date(vote.voted_at);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  const shortDate = date
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  return (
    <li>
      <Link
        href={`/votes/${vote.id}` as Route}
        className="initiative-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          borderBottom: '1px solid var(--rule)',
          padding: '14px 0',
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'minmax(56px, max-content) minmax(0, 1fr) auto',
          alignItems: 'baseline',
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          XV · {shortDate}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="line-clamp-2"
            style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            <SummaryHover
              summary={plainSummary}
              fallback={vote.description ?? undefined}
              provider={vote.plain_summary_provider}
              visibleText={subject}
            >
              <AnnotatedText text={subject} />
            </SummaryHover>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {(vote.proposed_by_government && !vote.proposing_group_short) ||
            vote.proposing_group_short ? (
              <span style={{ pointerEvents: 'auto' }}>
                {vote.proposed_by_government && !vote.proposing_group_short ? (
                  <span className="badge" style={{ fontWeight: 600, fontSize: 11 }}>
                    <span className="gdot" style={{ background: 'var(--ink)' }} />
                    {labels.proposed_by_government}
                  </span>
                ) : vote.proposing_group_short ? (
                  <GroupChip
                    slug={vote.proposing_group_slug ?? undefined}
                    short={displayGroupShort(vote.proposing_group_short)}
                    color={vote.proposing_group_color}
                    size="xs"
                  />
                ) : null}
              </span>
            ) : null}
            {vote.topics && vote.topics.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                {vote.topics.slice(0, 2).map((topic) => (
                  <span
                    key={topic.slug}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '1px 7px 2px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: 'var(--ink-2)',
                      background: topic.color_hex
                        ? `color-mix(in oklch, ${topic.color_hex} 14%, var(--paper))`
                        : 'var(--paper-2)',
                      border: `1px solid ${
                        topic.color_hex
                          ? `color-mix(in oklch, ${topic.color_hex} 32%, var(--paper))`
                          : 'var(--rule)'
                      }`,
                      letterSpacing: '0.01em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: topic.color_hex ?? 'var(--ink-3)',
                        flex: 'none',
                      }}
                    />
                    {pickTopicName(topic, locale)}
                  </span>
                ))}
              </>
            )}
            {vote.expediente_raw && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="mono"
                  style={{ fontSize: 10, color: 'var(--ink-3)', wordBreak: 'break-all' }}
                >
                  {vote.expediente_raw}
                </span>
              </>
            )}
          </div>
        </div>
        <span
          aria-label={labels.result}
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <ResultPill
            result={vote.result}
            label={labels.result}
            responsive
            mobileVariant="disc"
          />
        </span>
      </Link>
    </li>
  );
}
