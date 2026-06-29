import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawRow } from '@/components/LawRow';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ProposerEllipsis } from '@/components/ProposerEllipsis';
import { ResultPill } from '@/components/ResultPill';
import { TopicChip } from '@/components/TopicChip';
import type { Initiative, VoteResult } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort, type ParsedProposer } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One row for an INITIATIVE in a list (topic hub, the /lleis laws view).
 * Thin adapter over the shared {@link LawRow} shell so an initiative reads
 * the same wherever it appears, in lockstep with the vote rows.
 *
 * Meta line: ``type · proposer · official_id`` (type first, so the
 * binding "creates law" signal leads). The right-column outcome shows the
 * lifecycle ``status`` by default, but when the status is non-terminal
 * (submitted / in_debate) and a ``latestVoteResult`` is supplied, it shows
 * that vote result instead — this is what makes Reial Decret Llei rows (whose
 * imported status is always "submitted") show their real convalidation
 * outcome. Self-resolves its translations so callers pass only data.
 *
 * Neutrality: factual only (type, proposer, outcome). No editorial framing.
 */

const STATUS_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

// Lifecycle states that are a real verdict — for these the initiative
// status IS the outcome. Non-terminal ones (submitted / in_debate) defer
// to a linked vote result when one is available.
const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'withdrawn', 'expired']);

const MAX_BADGES = 3;

export async function InitiativeRow({
  initiative,
  parsed,
  locale,
  latestVoteResult = null,
}: {
  initiative: Initiative;
  parsed: ParsedProposer;
  locale: string;
  /** Result of the initiative's most recent linked vote, when known. */
  latestVoteResult?: VoteResult | null;
}) {
  const tStats = await getTranslations('stats');
  const tTopic = await getTranslations('topic');
  const tVotes = await getTranslations('votes');

  const submittedDate = initiative.submitted_at ? new Date(initiative.submitted_at) : null;
  const isCurrentYear = submittedDate
    ? submittedDate.getFullYear() === new Date().getFullYear()
    : false;
  const shortDate = submittedDate
    ? submittedDate
        .toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          ...(isCurrentYear ? {} : { year: '2-digit' }),
        })
        .replace(/\.$/, '')
    : '—';
  const longDate = submittedDate
    ? submittedDate.toLocaleDateString(locale, { dateStyle: 'medium' })
    : '—';
  const plainSummary = pickPlainSummary(initiative, locale);
  // AI plain-language summary leads as the row headline; the raw official
  // title (dense, procedural) moves behind an inline toggle in the meta
  // line. When no summary exists yet we fall back to the original title so
  // the row is never blank.
  const headline = plainSummary ?? initiative.title_original;

  const statusKey = STATUS_KEY[initiative.status];
  const statusLabel = statusKey ? tStats(statusKey) : initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';

  // Prefer the real vote result over a non-terminal status (RDL etc.).
  const showVoteResult = latestVoteResult != null && !TERMINAL_STATUSES.has(initiative.status);

  const meta = (
    <>
      <LawTypeChip type={initiative.type} />
      {(parsed.isGovernment || parsed.groups.length > 0 || parsed.raw !== '') && (
        <>
          <span aria-hidden="true">·</span>
          <ProposerBadges
            parsed={parsed}
            governmentLabel={tTopic('proposer_government_label')}
            moreGroupsLabel={(n: number) => tTopic('proposer_more_groups', { count: n })}
            rawFallback={initiative.submitted_by ?? ''}
          />
        </>
      )}
      {(initiative.topics ?? []).length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          {(initiative.topics ?? []).slice(0, 2).map((tp) => (
            <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
          ))}
        </>
      )}
      <span aria-hidden="true">·</span>
      <span
        className="mono"
        style={{ fontSize: 10, color: 'var(--ink-3)', wordBreak: 'break-all' }}
      >
        {initiative.official_id}
      </span>
      {plainSummary && (
        <LawOriginalToggle
          original={initiative.title_original}
          provider={initiative.plain_summary_provider}
        />
      )}
    </>
  );

  const outcome = showVoteResult ? (
    // A vote happened on a still-open initiative: show the verdict pill.
    <ResultPill
      result={latestVoteResult}
      label={tVotes(`result.${latestVoteResult}` as 'result.approved')}
    />
  ) : (
    // Outlined badge tinted by lifecycle status — a STATE, not a tally.
    <span
      className="badge"
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: statusColor,
        borderColor: 'color-mix(in oklch, currentColor 35%, var(--paper))',
        whiteSpace: 'nowrap',
      }}
    >
      {statusLabel}
    </span>
  );

  return (
    <LawRow
      href={`/initiatives/${initiative.id}` as Route}
      dateLong={longDate}
      dateShort={shortDate}
      title={headline}
      meta={meta}
      outcomeAriaLabel={showVoteResult ? (latestVoteResult ?? undefined) : statusLabel}
      outcome={outcome}
    />
  );
}

/**
 * Render an initiative's proposer as one or more {@link GroupBadge}s plus the
 * group's short name. Government-sponsored initiatives render as a neutral
 * grey disc labelled "Govern" / "Gobierno" / "Government". Unparseable
 * free-text falls back through {@link ProposerEllipsis} so a non-empty value
 * is never silently dropped.
 */
export function ProposerBadges({
  parsed,
  governmentLabel,
  moreGroupsLabel,
  rawFallback,
}: {
  parsed: ParsedProposer;
  governmentLabel: string;
  moreGroupsLabel: (n: number) => string;
  rawFallback: string;
}) {
  if (parsed.isGovernment) {
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
          color: 'var(--ink-2)',
          background: 'var(--paper-2)',
          borderColor: 'var(--rule-strong)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#9ca3af',
          }}
        />
        {governmentLabel}
      </span>
    );
  }

  if (parsed.groups.length === 0) {
    if (rawFallback.trim() === '') return null;
    return <ProposerEllipsis text={rawFallback} />;
  }

  const visible = parsed.groups.slice(0, MAX_BADGES);
  const overflow = parsed.groups.length - visible.length;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {visible.map((g, i) => (
        <span key={g.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} />
          {i < 2 && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink-2)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 110,
              }}
            >
              {displayGroupShort(g.name_short)}
            </span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="badge" style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--paper-2)' }}>
          {moreGroupsLabel(overflow)}
        </span>
      )}
    </span>
  );
}
