import Link from 'next/link';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { SummaryHover } from '@/components/SummaryHover';
import { VoteBreakdown } from '@/components/VoteBreakdown';
import type { Vote, VoteResult } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';

/**
 * One row in a flat list of votes — the canonical "law list" row.
 *
 * This shape is shared between the home page (recent votes) and the
 * /votes list (all votes with filters). Keeping a single component
 * means both surfaces have the same visual rhythm: 4-column grid
 * (date · title + meta · stacked bar · result pill on desktop) and a
 * vertically-stacked compact form on mobile.
 *
 * No editorial framing — only factual labels (proposer, result,
 * counts). See ``docs/neutrality-guidelines.md``.
 */

export interface CompactVoteRowLabels {
  ayes: string;
  noes: string;
  abstentions: string;
  proposed_by: string;
  proposed_by_government: string;
  result: string;
}

function resultColor(result: VoteResult): string {
  switch (result) {
    case 'approved':
      return 'var(--aye)';
    case 'rejected':
      return 'var(--no)';
    case 'tie':
      return 'var(--abst)';
  }
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
  const total = v.ayes + v.noes + v.abstentions;
  const voteDate = new Date(v.voted_at);
  const isCurrentYear = voteDate.getFullYear() === new Date().getFullYear();
  // Short form for mobile (e.g. "19 nov"), long form for desktop.
  const shortDate = voteDate
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  const longDate = voteDate.toLocaleDateString(locale, { dateStyle: 'long' });
  const plainSummary = pickPlainSummary(v, locale);

  return (
    <li style={{ position: 'relative', borderTop: '1px solid var(--rule)' }}>
      <Link
        href={`/votes/${v.id}`}
        aria-label={subject}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          textDecoration: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          {subject}
        </span>
      </Link>
      <div
        className="vote-row-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '90px minmax(0, 1fr) 220px 120px',
          gap: 24,
          padding: '26px 0',
          alignItems: 'start',
          position: 'relative',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <div
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 0,
          }}
        >
          {/* Mobile compresses the date cell into a single inline string:
              "XV · 19 nov". Desktop keeps the longer date + expediente
              two-liner. */}
          <span className="sm:hidden whitespace-nowrap">XV · {shortDate}</span>
          <span className="hidden sm:inline">{longDate}</span>
          {v.expediente_raw && (
            <>
              <br />
              <span
                className="mono hidden sm:inline"
                style={{ fontSize: 11, wordBreak: 'break-all' }}
              >
                {v.expediente_raw}
              </span>
            </>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Type label above the title — desktop only. */}
          <div
            className="hidden sm:flex"
            style={{ gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{v.title}</span>
          </div>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            <SummaryHover
              summary={plainSummary}
              fallback={v.description ?? undefined}
              provider={v.plain_summary_provider}
              visibleText={subject}
            >
              <AnnotatedText text={subject} />
            </SummaryHover>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              alignItems: 'center',
              fontSize: 12,
              color: 'var(--ink-3)',
              flexWrap: 'wrap',
            }}
          >
            <span className="hidden sm:inline">{labels.proposed_by}</span>
            {v.proposed_by_government && !v.proposing_group_short ? (
              <span className="badge" style={{ fontWeight: 600 }}>
                <span className="gdot" style={{ background: 'var(--ink)' }} />
                {labels.proposed_by_government}
              </span>
            ) : v.proposing_group_short ? (
              <span style={{ pointerEvents: 'auto' }}>
                <GroupChip
                  slug={v.proposing_group_slug ?? undefined}
                  short={displayGroupShort(v.proposing_group_short)}
                  color={v.proposing_group_color}
                  size="xs"
                />
              </span>
            ) : null}
            {/* Mobile-only: colored result disc on the same baseline as
                the proposer chip. Desktop keeps the dedicated result
                cell on the right. */}
            <span className="sm:hidden inline-flex items-center gap-2">
              <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
                ·
              </span>
              <span
                role="img"
                aria-label={labels.result}
                title={labels.result}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  display: 'inline-block',
                  background:
                    v.result === 'tie' ? 'transparent' : resultColor(v.result),
                  border:
                    v.result === 'tie'
                      ? `2px solid ${resultColor(v.result)}`
                      : '0',
                  boxSizing: 'border-box',
                }}
              />
            </span>
          </div>
        </div>
        <div>
          <StackedBar
            d={{ aye: v.ayes, no: v.noes, abst: v.abstentions, nv: v.absent }}
          />
          <VoteBreakdown
            ayes={v.ayes}
            noes={v.noes}
            abstentions={v.abstentions}
            size="sm"
            labels={{
              ayes: labels.ayes,
              noes: labels.noes,
              abstentions: labels.abstentions,
            }}
          />
        </div>
        {/* Desktop-only column — on mobile the result lives inline with
            the proposer chip above. */}
        <div className="hidden sm:block" style={{ textAlign: 'right' }}>
          <ResultPill result={v.result} label={labels.result} />
          {total > 0 && (
            <div
              className="tabular"
              style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}
            >
              {total}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
