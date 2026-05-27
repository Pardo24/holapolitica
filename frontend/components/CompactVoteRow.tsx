import Link from 'next/link';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { SummaryHover } from '@/components/SummaryHover';
import type { Vote, VoteResult } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One row in a flat "law list" — the canonical vote-row across the
 * site. Same component on home (latest votes), /votes (filtered
 * list), /topics/[slug] meta and any future surface that lists votes.
 *
 * Layout: a single ``.initiative-row`` grid (3 columns: date · title
 * + meta · result badge) at every viewport. Date compresses to
 * ``XV · 26 març`` on phones and expands to ``26 de març de 2026``
 * on desktop via the existing ``.sm:hidden`` / ``.hidden sm:inline``
 * helpers. No stacked bar / count column — the detail page is one
 * click away for that.
 *
 * Why a single row at all sizes: the previous design rendered TWO
 * <ul>'s (mobile MobileVoteCard + desktop CompactVoteRow) gated by
 * ``sm:hidden`` and ``hidden sm:block``. Both ended up in the HTML
 * source, which Daniel noticed as a "duplicate filtered list",
 * conceptually confusing. One component fixes both the duplication
 * and the visual mismatch.
 *
 * Neutrality: only factual labels (proposer, result, counts via the
 * detail page). No editorial framing.
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
  const voteDate = new Date(v.voted_at);
  const isCurrentYear = voteDate.getFullYear() === new Date().getFullYear();
  const shortDate = voteDate
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  const longDate = voteDate.toLocaleDateString(locale, { dateStyle: 'long' });
  const plainSummary = pickPlainSummary(v, locale);
  const topics = v.topics ?? [];
  return (
    <li>
      <Link
        href={`/votes/${v.id}`}
        // Mobile: 2-col grid (title | right-stack with date+result). The
        // desktop-only date column on the left is display:none on phones
        // — gives the title the full row width while keeping the date
        // visible top-right alongside the result indicator below it.
        // Desktop (sm:): switches to a 3-col grid via the
        // ``compact-vote-row`` rule in globals.css.
        className="compact-vote-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          borderBottom: '1px solid var(--rule)',
          padding: '14px 0',
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'baseline',
        }}
      >
        <span
          className="hidden sm:inline tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {longDate}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}
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
          </div>
        </div>
        <span
          aria-label={labels.result}
          style={{
            flex: 'none',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            gap: 6,
            textAlign: 'right',
          }}
        >
          {/* Mobile-only date (top of the right stack). Desktop's date
              lives in its own left column instead. */}
          <span
            className="sm:hidden tabular"
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            XV · {shortDate}
          </span>
          {/* Result indicator: small pill (mobile) → labelled pill (desktop).
              Same color semantics on both sizes; mobile shows the short
              result label so the user doesn't have to decode a dot. */}
          <span
            className={`badge badge-${v.result === 'approved' ? 'aye' : v.result === 'rejected' ? 'no' : 'tie'}`}
            style={{ fontWeight: 600, fontSize: 11 }}
          >
            {labels.result}
          </span>
        </span>
      </Link>
    </li>
  );
}
