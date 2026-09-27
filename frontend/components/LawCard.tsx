import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { ProposerBadges } from '@/components/InitiativeRow';
import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { TopicChip } from '@/components/TopicChip';
import type { InitiativeListItem, LawLatestVote, LawVoteGroupStance } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort, type ParsedProposer } from '@/lib/groups';
import { STATUS_COLOR, STATUS_KEY, prefersVoteResult } from '@/lib/lawStatus';
import { pickTopicName } from '@/lib/topics';

/**
 * One LAW, as a full-width card — the /lleis surface.
 *
 * The compact {@link LawRow} answers "what happened"; this card answers the
 * question people actually arrive with: **what does this do, whom does it
 * touch, and who voted which way** — without opening anything. That is the
 * whole point of the project, so the laws list stops being an index and
 * becomes the content.
 *
 * What it shows, in reading order:
 *  1. type + topics + the outcome (vote result, or lifecycle status).
 *  2. the plain-language summary as the headline (official title behind a
 *     toggle, as everywhere else).
 *  3. who it affects — the audiences extracted from the text itself. These
 *     are named collectives ("inquilinos", "autónomos"), never a judgement
 *     about who wins or loses; see ``app/services/affected.py``.
 *  4. the decisive vote: the tally, the proportional bar, and every group
 *     on the side it took, with how many of its deputies backed it.
 *
 * Neutrality: both sides are rendered by the same code with the same
 * prominence, ordered by delegation size, never by side. About 3 in 5
 * law-creating initiatives have no linked vote yet; those say so rather
 * than implying silence means something.
 */
export async function LawCard({
  initiative,
  parsed,
  locale,
}: {
  initiative: InitiativeListItem;
  parsed: ParsedProposer;
  locale: string;
}) {
  const t = await getTranslations('lleis');
  const tStats = await getTranslations('stats');
  const tTopic = await getTranslations('topic');
  const tVotes = await getTranslations('votes');

  const href = `/initiatives/${initiative.id}` as Route;
  const plainSummary = pickPlainSummary(initiative, locale);
  const headline = plainSummary ?? initiative.title_original;

  const statusKey = STATUS_KEY[initiative.status];
  const statusLabel = statusKey ? tStats(statusKey) : initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';
  const showVoteResult = prefersVoteResult(initiative.status, initiative.latest_vote_result);

  // "en" has no audience list of its own; Spanish is the source language.
  const audiences = (
    locale === 'ca'
      ? initiative.affected_audiences?.ca
      : (initiative.affected_audiences?.es ?? initiative.affected_audiences?.ca)
  )?.filter(Boolean);

  const vote = initiative.latest_vote ?? null;
  const inFavour = vote?.groups.filter((g) => g.choice === 'aye') ?? [];
  const against = vote?.groups.filter((g) => g.choice === 'no') ?? [];
  const abstained = vote?.groups.filter((g) => g.choice === 'abstention') ?? [];
  const voteDate = vote?.voted_at
    ? new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })
    : null;

  return (
    <li
      style={{
        listStyle: 'none',
        border: '1px solid var(--rule)',
        borderRadius: 16,
        background: 'var(--paper)',
        boxShadow: 'var(--shadow-2)',
        padding: '18px 18px 16px',
        overflow: 'hidden',
      }}
    >
      {/* Line 1: what kind of law it is, what it touches, how it ended. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <LawTypeChip type={initiative.type} />
        {(initiative.topics ?? []).slice(0, 2).map((tp) => (
          <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
        ))}
        <span style={{ flex: 1 }} />
        {showVoteResult && initiative.latest_vote_result ? (
          <ResultPill
            result={initiative.latest_vote_result}
            label={tVotes(`result.${initiative.latest_vote_result}` as 'result.approved')}
          />
        ) : (
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
        )}
      </div>

      {/* Line 2: what it does, in plain language. */}
      <h3 style={{ margin: 0 }}>
        <Link
          href={href}
          className="serif"
          style={{
            fontSize: 'clamp(16px, 2.1vw, 19px)',
            fontWeight: 600,
            lineHeight: 1.4,
            color: 'var(--ink)',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
            // Summaries are 2-3 lines, but a law with none falls back to its
            // official title, which can run 70 words and swallow the card.
            // Three lines keep every card scannable; the full text is one
            // click away (and behind the "original" toggle below).
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {headline}
        </Link>
      </h3>

      {/* Who it affects — factual collectives, from the law's own text. */}
      {audiences && audiences.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 10,
          }}
        >
          <span style={EYEBROW}>{t('card_affects')}</span>
          {audiences.slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 12,
                padding: '2px 9px',
                borderRadius: 999,
                border: '1px solid var(--rule-strong)',
                color: 'var(--ink-2)',
                background: 'var(--paper-2)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* The vote itself. */}
      <div
        style={{
          marginTop: 14,
          padding: '12px 13px',
          borderRadius: 12,
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
        }}
      >
        {vote === null ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
            {t('card_not_voted_yet')}
          </p>
        ) : vote.approved_by_assent ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            {t('card_by_assent')}
            {voteDate ? ` · ${voteDate}` : ''}
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <span style={EYEBROW}>{t('card_votes_eyebrow')}</span>
              <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {voteDate}
              </span>
            </div>
            <GroupRibbon vote={vote} />
            <div
              className="tabular"
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                marginTop: 8,
                fontSize: 12.5,
                color: 'var(--ink-2)',
              }}
            >
              <Tally color="var(--aye)" label={t('card_in_favour')} n={vote.ayes} />
              <Tally color="var(--no)" label={t('card_against')} n={vote.noes} />
              <Tally color="var(--abst)" label={t('card_abstention')} n={vote.abstentions} />
            </div>

            {vote.groups.length > 0 ? (
              // Small by default, big on demand: the ribbon above already
              // says who is on each side, so the per-group counts open only
              // for whoever wants them and a card stays scannable.
              <details style={{ marginTop: 10 }}>
                <summary
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    cursor: 'pointer',
                    listStyle: 'revert',
                  }}
                >
                  {t('card_group_detail')}
                </summary>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <StanceColumn
                    label={t('card_in_favour')}
                    color="var(--aye)"
                    groups={inFavour}
                    emptyLabel={t('card_side_empty')}
                  />
                  <StanceColumn
                    label={t('card_against')}
                    color="var(--no)"
                    groups={against}
                    emptyLabel={t('card_side_empty')}
                  />
                  {abstained.length > 0 && (
                    <StanceColumn
                      label={t('card_abstention')}
                      color="var(--abst)"
                      groups={abstained}
                      emptyLabel={t('card_side_empty')}
                    />
                  )}
                </div>
              </details>
            ) : (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
                {t('card_no_breakdown')}
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer: who tabled it, its file number, and the way in. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginTop: 12,
          fontSize: 12,
          color: 'var(--ink-3)',
        }}
      >
        {(parsed.isGovernment || parsed.groups.length > 0 || parsed.raw !== '') && (
          <ProposerBadges
            parsed={parsed}
            governmentLabel={tTopic('proposer_government_label')}
            moreGroupsLabel={(n: number) => tTopic('proposer_more_groups', { count: n })}
            rawFallback={initiative.submitted_by ?? ''}
          />
        )}
        <span className="mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          {initiative.official_id}
        </span>
        {plainSummary && (
          <LawOriginalToggle
            original={initiative.title_original}
            provider={initiative.plain_summary_provider}
          />
        )}
        <span style={{ flex: 1 }} />
        <Link
          href={href}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--ink-2)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {t('card_open')}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

const EYEBROW: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

/**
 * The chamber as one ribbon: each side takes the width its votes earned,
 * and inside it every group takes the width its deputies earned, painted in
 * the group's own colour. A rail underneath repeats the side colour, so the
 * sides stay unmistakable even though the segments are party-coloured.
 *
 * Decorative: the same information is in the tally line and, in full, in the
 * per-group detail below, so screen readers skip it.
 */
function GroupRibbon({ vote }: { vote: LawLatestVote }) {
  const zones = [
    { key: 'aye', color: 'var(--aye)', count: vote.ayes },
    { key: 'abstention', color: 'var(--abst)', count: vote.abstentions },
    { key: 'no', color: 'var(--no)', count: vote.noes },
    { key: 'absent', color: 'var(--nv)', count: vote.absent },
  ].filter((z) => z.count > 0);
  if (zones.length === 0) return null;

  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 3 }}>
      {zones.map((zone) => {
        const groups = vote.groups.filter((g) => g.choice === zone.key);
        return (
          <div key={zone.key} style={{ flex: `${zone.count} 0 0`, minWidth: 2 }}>
            <div
              style={{
                display: 'flex',
                gap: 1,
                height: 13,
                borderRadius: 3,
                overflow: 'hidden',
                background: zone.color,
              }}
            >
              {groups.map((g) => (
                <span
                  key={g.slug}
                  title={`${displayGroupShort(g.name_short)} · ${g.deputies}`}
                  style={{
                    flex: `${g.deputies} 0 0`,
                    background: g.color_hex ?? zone.color,
                    minWidth: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ height: 3, borderRadius: 999, background: zone.color, marginTop: 2 }} />
          </div>
        );
      })}
    </div>
  );
}

function Tally({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: 'none' }}
      />
      <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{n}</strong> {label}
    </span>
  );
}

/**
 * One side of the chamber. Rendered identically for every side, groups
 * ordered by how many deputies backed the stance (the API sorts them), so
 * the layout itself carries no editorial weight.
 */
function StanceColumn({
  label,
  color,
  groups,
  emptyLabel,
}: {
  label: string;
  color: string;
  groups: LawVoteGroupStance[];
  emptyLabel: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: 'none' }}
        />
        <span style={EYEBROW}>{label}</span>
      </div>
      {groups.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {groups.map((g) => (
            <span
              key={g.slug}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                maxWidth: '100%',
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid var(--rule)',
                background: 'var(--paper)',
                fontSize: 12,
                color: 'var(--ink)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: g.color_hex ?? 'var(--ink-3)',
                  flex: 'none',
                }}
              />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {displayGroupShort(g.name_short)}
              </span>
              <span className="tabular" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                {g.deputies}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
