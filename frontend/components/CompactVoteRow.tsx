import type { Route } from 'next';

import { GroupChip } from '@/components/GroupChip';
import { LawRow } from '@/components/LawRow';
import { LawSummaryPanel } from '@/components/LawSummaryPanel';
import { LawTypeChip } from '@/components/LawTypeChip';
import { TopicChip } from '@/components/TopicChip';
import type { Vote } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One row in a flat "law list" for a VOTE — i.e. a moment of decision.
 * Used on home (latest votes), /votes (filtered list) and any other
 * surface listing votes.
 *
 * Thin adapter over {@link LawRow}: it formats the dates, assembles the
 * meta line (type chip → proposer → topics → expediente → summary) and
 * supplies the result pill as the outcome indicator. The shared shell
 * owns the grid + responsive layout so this row stays in lockstep with
 * the topic hub's initiative rows.
 *
 * Neutrality: only factual labels (proposer, result). No editorial framing.
 */

export interface CompactVoteRowLabels {
  ayes: string;
  noes: string;
  abstentions: string;
  proposed_by: string;
  proposed_by_government: string;
  result: string;
}

export function CompactVoteRow({
  v,
  labels,
  locale,
}: {
  v: Vote;
  labels: CompactVoteRowLabels;
  locale: string;
}) {
  const subject = v.description?.trim() || v.title;
  const voteDate = new Date(v.voted_at);
  const isCurrentYear = voteDate.getFullYear() === new Date().getFullYear();
  const shortDate = voteDate
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  // dateStyle 'medium' (e.g. "26 d'abr. 2026") matches the topic-hub
  // initiative rows so the date column is the same shape everywhere.
  const longDate = voteDate.toLocaleDateString(locale, { dateStyle: 'medium' });
  const plainSummary = pickPlainSummary(v, locale);
  const topics = v.topics ?? [];

  const meta = (
    <>
      {v.initiative_type && (
        <span style={{ pointerEvents: 'auto' }}>
          <LawTypeChip type={v.initiative_type} />
        </span>
      )}
      {(v.proposed_by_government && !v.proposing_group_short) ||
      v.proposing_group_short ? (
        <span style={{ pointerEvents: 'auto' }}>
          {v.proposed_by_government && !v.proposing_group_short ? (
            <span className="badge" style={{ fontWeight: 600, fontSize: 11 }}>
              <span className="gdot" style={{ background: 'var(--ink)' }} />
              {labels.proposed_by_government}
            </span>
          ) : v.proposing_group_short ? (
            <GroupChip
              slug={v.proposing_group_slug ?? undefined}
              short={displayGroupShort(v.proposing_group_short)}
              color={v.proposing_group_color}
              size="xs"
            />
          ) : null}
        </span>
      ) : null}
      {topics.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          {topics.slice(0, 2).map((topic) => (
            <TopicChip key={topic.slug} name={pickTopicName(topic, locale)} color={topic.color_hex} />
          ))}
        </>
      )}
      {v.expediente_raw && (
        <>
          <span aria-hidden="true">·</span>
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--ink-3)', wordBreak: 'break-all' }}
          >
            {v.expediente_raw}
          </span>
        </>
      )}
      {/* Inline "explain" icon at the end of the meta line; the panel drops
          full-width beneath (flex-basis:100%). */}
      {plainSummary && (
        <LawSummaryPanel summary={plainSummary} provider={v.plain_summary_provider} />
      )}
    </>
  );

  return (
    <LawRow
      href={`/votes/${v.id}` as Route}
      dateLong={longDate}
      dateShort={shortDate}
      title={subject}
      meta={meta}
      outcomeAriaLabel={labels.result}
      outcome={
        // Filled soft pill: a vote is a decision that already happened.
        <span
          className={`badge badge-${v.result === 'approved' ? 'aye' : v.result === 'rejected' ? 'no' : 'tie'}`}
          style={{ fontWeight: 600, fontSize: 11 }}
        >
          {labels.result}
        </span>
      }
    />
  );
}
