import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ResultPill } from '@/components/ResultPill';
import { ProfileEffects } from '@/components/ProfileEffects';
import { SummaryProvenance } from '@/components/SummaryProvenance';
import { TopicChip } from '@/components/TopicChip';
import { VoteSplit } from '@/components/VoteSplit';
import type { Vote } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline, summaryPointCount, summaryRestCount } from '@/lib/plainSummary';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One VOTE, as a full-width card — the /votes archive.
 *
 * The twin of {@link LawCard}: the same reading order (what it does, then
 * who voted what), so a vote doesn't change appearance depending on which
 * list you met it in. The two differ only where the objects differ: a vote
 * has a result rather than a lifecycle status, and it has no audiences of
 * its own, since those belong to the initiative behind it.
 */
export async function VoteCard({ vote, locale }: { vote: Vote; locale: string }) {
  const t = await getTranslations('lleis');
  const tVotes = await getTranslations('votes');

  const href = `/votes/${vote.id}` as Route;
  const subject = vote.description?.trim() || vote.title;
  const plainSummary = pickPlainSummary(vote, locale);
  // Same as on a law card: the list becomes lead + first point, counted.
  const plainTitle = pickPlainTitle(vote, locale);
  const headline = plainTitle ?? (plainSummary ? summaryHeadline(plainSummary) : subject);
  // With a real headline none of the points are on the card, so the chip
  // counts them all; without one the headline already showed the first.
  const morePoints = !plainSummary
    ? 0
    : plainTitle
      ? summaryPointCount(plainSummary)
      : summaryRestCount(plainSummary);
  const voteDate = new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' });

  return (
    <li
      style={{
        listStyle: 'none',
        border: '1px solid var(--rule)',
        borderRadius: 16,
        background: 'var(--paper)',
        boxShadow: 'var(--shadow-2)',
        padding: '18px 18px 16px',
        // See LawCard: clipping here swallowed the law-type tooltip.
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        {vote.initiative_type && <LawTypeChip type={vote.initiative_type} />}
        {(vote.topics ?? []).slice(0, 2).map((tp) => (
          <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
        ))}
        <span style={{ flex: 1 }} />
        <ResultPill
          result={vote.result}
          label={tVotes(`result.${vote.result}` as 'result.approved')}
        />
      </div>

      {/* Same label as on a law card: the headline is either a machine
          summary or the chamber's own wording, and which one it is should
          never be a guess. */}
      <SummaryProvenance
        kind={plainSummary ? 'ai' : 'none'}
        label={plainSummary ? t('card_ai_summary') : t('card_no_summary')}
      />
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
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {headline}
        </Link>
      </h3>
      <ProfileEffects
        effects={vote.profile_effects}
        locale={locale}
        max={3}
        moreHref={vote.initiative_id != null ? `/initiatives/${vote.initiative_id}#com-t-afecta` : undefined}
      />
      {morePoints > 0 && (
        // The points the headline leaves out. Counted, not run together:
        // "+3 punts més" says there is a list without pretending the card
        // can show it.
        <span
          style={{
            display: 'inline-block',
            marginTop: 6,
            padding: '2px 9px',
            borderRadius: 999,
            border: '1px solid var(--rule-strong)',
            background: 'var(--paper-2)',
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--ink-3)',
          }}
        >
          {t('card_more_points', { n: morePoints })}
        </span>
      )}

      <div
        style={{
          marginTop: 14,
          padding: '12px 13px',
          borderRadius: 12,
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
        }}
      >
        {vote.approved_by_assent ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            {t('card_by_assent')} · {voteDate}
          </p>
        ) : (
          <VoteSplit
            ayes={vote.ayes}
            noes={vote.noes}
            abstentions={vote.abstentions}
            absent={vote.absent}
            groups={vote.groups ?? []}
            date={voteDate}
            labels={{
              eyebrow: t('card_votes_eyebrow'),
              inFavour: t('card_in_favour'),
              against: t('card_against'),
              abstention: t('card_abstention'),
              detail: t('card_group_detail'),
              sideEmpty: t('card_side_empty'),
              noBreakdown: t('card_no_breakdown'),
            }}
          />
        )}
      </div>

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
        {vote.proposed_by_government && !vote.proposing_group_short ? (
          <span>{tVotes('proposed_by_government')}</span>
        ) : vote.proposing_group_short ? (
          <span>{displayGroupShort(vote.proposing_group_short)}</span>
        ) : null}
        {vote.expediente_raw && (
          <span className="mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
            {vote.expediente_raw}
          </span>
        )}
        {plainSummary && (
          <LawOriginalToggle original={subject} provider={vote.plain_summary_provider} />
        )}
        <span style={{ flex: 1 }} />
        <Link
          href={href}
          className="card-open-link"
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
          {tVotes('see_vote')}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
