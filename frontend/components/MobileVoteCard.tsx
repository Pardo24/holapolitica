import Link from 'next/link';
import type { Route } from 'next';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { SummaryHover } from '@/components/SummaryHover';
import type { Vote } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * Mobile-only one-card-per-vote row for the /votes list.
 *
 * Replaces the horizontal-scrolling <table> on small viewports.
 * Layout (top to bottom inside the card):
 *
 *   - meta row: date · expediente code · result pill (right)
 *   - title (2-line clamp), wrapped in SummaryHover so the AI summary
 *     surfaces on tap
 *   - proposer row: GroupChip or "Govern" badge
 *   - stacked bar with ayes / noes / abstentions / no-vote
 *
 * Every cell is a Link to /votes/<id>; the SummaryHover affordance
 * stays the same as the desktop table.
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
  const dateLabel = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <li>
      <Link
        href={`/votes/${vote.id}` as Route}
        className="mobile-vote-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 14px',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--ink-3)',
            minWidth: 0,
          }}
        >
          <span className="tabular" style={{ flex: 'none' }}>
            {dateLabel}
          </span>
          {vote.expediente_raw && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="mono"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {vote.expediente_raw}
              </span>
            </>
          )}
          <span style={{ marginLeft: 'auto', flex: 'none' }}>
            <ResultPill
              result={vote.result}
              label={labels.result}
              responsive
              mobileVariant="disc"
            />
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.35,
            color: 'var(--ink)',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
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
        {vote.topics && vote.topics.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 2,
            }}
          >
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
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
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
          <span
            className="tabular"
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginLeft: 'auto',
            }}
          >
            <span style={{ color: 'var(--aye)', fontWeight: 600 }}>{vote.ayes}</span>
            {' · '}
            <span style={{ color: 'var(--no)', fontWeight: 600 }}>{vote.noes}</span>
            {vote.abstentions > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--abst)', fontWeight: 600 }}>{vote.abstentions}</span>
              </>
            )}
          </span>
        </div>
        <StackedBar
          d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
          height={6}
        />
      </Link>
      <style>{`
        .mobile-vote-card:active {
          background: var(--paper-2);
        }
      `}</style>
    </li>
  );
}
