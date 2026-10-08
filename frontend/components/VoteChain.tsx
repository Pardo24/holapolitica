import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronDown } from 'lucide-react';

import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import type { InitiativeVoteSummary } from '@/lib/api';
import { pickPlainTitle } from '@/lib/glossary';
import { isAmendmentStage, localizeSubgroupText } from '@/lib/voteStage';

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
 *
 * Each step says which part of the law it decided (``stage``, from the
 * vote XML). A run of amendment votes on one day folds into a single step
 * ("6 votacions d'esmenes · 0 aprovades"), opened when you are on one of
 * them: listed flat, six rejected amendments and the approved law read as
 * the same question answered "no" six times, with the groups appearing to
 * flip between "for" and "against".
 */
export async function VoteChain({
  votes,
  locale,
  currentVoteId = null,
  pointLabel,
}: {
  votes: InitiativeVoteSummary[];
  locale: string;
  /** Marks the vote you are already reading, and stops it linking to itself. */
  currentVoteId?: number | null;
  /** Numbers the entries ("Punt 1", "Punt 2") for a motion voted point by
   *  point. Those points are separate questions, and the generated headline
   *  is often the same sentence for several of them, so without a number the
   *  chain read as the same thing approved once and rejected twice. */
  pointLabel?: (n: number) => string;
}) {
  const t = await getTranslations('initiative_detail');
  const tVotes = await getTranslations('votes');
  const tStage = await getTranslations('vote_stage');
  if (votes.length === 0) return null;

  // Same day, several votes: the id breaks the tie, which is the order the
  // session took them in.
  const ordered = [...votes].sort(
    (a, b) => a.voted_at.localeCompare(b.voted_at) || a.id - b.id,
  );

  // Fold consecutive same-day amendment votes into one step.
  type Step = { kind: 'vote'; vote: InitiativeVoteSummary; index: number } | { kind: 'cluster'; votes: InitiativeVoteSummary[] };
  const steps: Step[] = [];
  ordered.forEach((v, index) => {
    const last = steps[steps.length - 1];
    const day = v.voted_at.slice(0, 10);
    if (isAmendmentStage(v.stage)) {
      if (last?.kind === 'cluster' && last.votes[0]!.voted_at.slice(0, 10) === day) {
        last.votes.push(v);
        return;
      }
      if (
        last?.kind === 'vote' &&
        isAmendmentStage(last.vote.stage) &&
        last.vote.voted_at.slice(0, 10) === day
      ) {
        steps[steps.length - 1] = { kind: 'cluster', votes: [last.vote, v] };
        return;
      }
    }
    steps.push({ kind: 'vote', vote: v, index });
  });

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
  const stageLabel = (v: InitiativeVoteSummary): string | null =>
    v.stage ? tStage(v.stage) : null;

  /** Who proposed the amendment and which one: "PP · Esmena 26". */
  const amendmentLine = (v: InitiativeVoteSummary) => {
    const detail = localizeSubgroupText(v.subgroup_text, locale);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {(v.stage_groups ?? []).map((g) => (
          <GroupChip key={g.slug} short={g.name_short} color={g.color_hex} size="xs" />
        ))}
        {detail && <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{detail}</span>}
      </span>
    );
  };

  const youAreHere = (
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
  );

  const stageChip = (label: string) => (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: 'var(--ink)',
      }}
    >
      {label}
    </span>
  );

  const rail = (filled: boolean, isLast: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span
        aria-hidden="true"
        style={{
          width: 11,
          height: 11,
          borderRadius: 999,
          marginTop: 4,
          flex: 'none',
          background: filled ? 'var(--ink)' : 'var(--paper)',
          border: `2px solid ${filled ? 'var(--ink)' : 'var(--rule-strong)'}`,
        }}
      />
      {!isLast && (
        <span aria-hidden="true" style={{ flex: 1, width: 2, background: 'var(--rule)', marginTop: 3 }} />
      )}
    </div>
  );

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {steps.map((step, si) => {
        const isLast = si === steps.length - 1;
        const liStyle = {
          display: 'grid',
          gridTemplateColumns: '22px minmax(0, 1fr)',
          columnGap: 12,
          paddingBottom: isLast ? 0 : 14,
        } as const;

        if (step.kind === 'cluster') {
          const containsCurrent = step.votes.some((v) => v.id === currentVoteId);
          const approved = step.votes.filter((v) => v.result === 'approved').length;
          const rejected = step.votes.filter((v) => v.result === 'rejected').length;
          return (
            <li key={`c-${step.votes[0]!.id}`} style={liStyle}>
              {rail(containsCurrent, isLast)}
              <details className="vchain-cluster" open={containsCurrent}>
                <summary>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                      {fmtDate(step.votes[0]!.voted_at)}
                    </span>
                    {stageChip(tStage('cluster_title', { n: step.votes.length }))}
                    <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {tStage('cluster_counts', { approved, rejected })}
                    </span>
                    {containsCurrent && youAreHere}
                  </span>
                  <ChevronDown size={16} aria-hidden="true" className="vchain-cluster__chev" />
                </summary>
                <p className="vchain-cluster__help">{tStage('cluster_help')}</p>
                <ul className="vchain-cluster__list">
                  {step.votes.map((v) => {
                    const isCurrent = v.id === currentVoteId;
                    const row = (
                      <>
                        <ResultPill
                          result={v.result}
                          label={tVotes(`result.${v.result}` as 'result.approved')}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          {v.stage !== 'amendment' && stageLabel(v) && (
                            <span style={{ fontSize: 12, fontWeight: 700, marginRight: 6 }}>{stageLabel(v)}</span>
                          )}
                          {amendmentLine(v)}
                        </span>
                        <span className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                          {v.ayes}–{v.noes}
                        </span>
                        {isCurrent && youAreHere}
                      </>
                    );
                    return (
                      <li key={v.id} className={isCurrent ? 'is-current' : undefined}>
                        {isCurrent ? (
                          <div className="vchain-cluster__row">{row}</div>
                        ) : (
                          <Link href={`/votes/${v.id}` as Route} className="vchain-cluster__row">
                            {row}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        }

        const v = step.vote;
        const isCurrent = v.id === currentVoteId;
        const amendment = isAmendmentStage(v.stage);
        // An amendment's own words are "Enmienda 26"; the law's generated
        // headline would misstate what this vote decided.
        const headline = amendment
          ? null
          : (pickPlainTitle(v, locale) ?? v.description?.trim() ?? v.title?.trim() ?? '');
        const point =
          v.stage === 'point'
            ? localizeSubgroupText(v.subgroup_text, locale)
            : pointLabel
              ? pointLabel(step.index + 1)
              : null;
        const label = point ?? stageLabel(v);
        const body = (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
              <span className="tabular" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {fmtDate(v.voted_at)}
              </span>
              {label && stageChip(label)}
              <ResultPill result={v.result} label={tVotes(`result.${v.result}` as 'result.approved')} />
              {isCurrent && youAreHere}
            </div>
            {amendment ? (
              amendmentLine(v)
            ) : (
              headline && (
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
              )
            )}
          </>
        );

        return (
          <li key={v.id} style={liStyle}>
            {rail(isCurrent, isLast)}
            <div style={{ minWidth: 0 }}>
              {isCurrent ? (
                body
              ) : (
                <Link href={`/votes/${v.id}` as Route} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>
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
