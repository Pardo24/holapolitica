import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ProfileEffects } from '@/components/ProfileEffects';
import { GroupRows, ScoreCard, ScorePanel, scoreTone } from '@/components/ScoreCard';
import { SummaryProvenance } from '@/components/SummaryProvenance';
import { TopicChip } from '@/components/TopicChip';
import type { Vote } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline, summaryPointCount, summaryRestCount } from '@/lib/plainSummary';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One VOTE, as a list card: the /votes archive and the group pages. The
 * shared scoreboard card (components/ScoreCard.tsx), like the laws and the
 * plenary sheets.
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
  const proposer =
    vote.proposed_by_government && !vote.proposing_group_short
      ? tVotes('proposed_by_government')
      : vote.proposing_group_short
        ? displayGroupShort(vote.proposing_group_short)
        : null;

  return (
    <ScoreCard
      tone={scoreTone(vote.result)}
      head={
        <>
          <div className="vcard__chips">
            {vote.initiative_type && <LawTypeChip type={vote.initiative_type} />}
            {(vote.topics ?? []).slice(0, 2).map((tp) => (
              <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
            ))}
          </div>
          {/* The headline is either a machine summary or the chamber's own
              wording, and which one it is should never be a guess. */}
          <SummaryProvenance
            kind={plainSummary ? 'ai' : 'none'}
            label={plainSummary ? t('card_ai_summary') : t('card_no_summary')}
          />
          <h3 className="vcard__title">
            <Link href={href} className="serif">
              {headline}
            </Link>
          </h3>
          {morePoints > 0 && (
            // The points the headline leaves out, counted: there is a list,
            // and the card does not pretend it can show it.
            <span className="vcard__more">{t('card_more_points', { n: morePoints })}</span>
          )}
        </>
      }
      score={
        <ScorePanel
          label={tVotes(`result.${vote.result}` as 'result.approved')}
          tally={vote.approved_by_assent ? null : vote}
          note={vote.approved_by_assent ? t('card_by_assent') : null}
          date={voteDate}
          href={href}
          openLabel={tVotes('see_vote')}
        />
      }
      groups={vote.approved_by_assent ? null : <GroupRows groups={vote.groups ?? []} />}
      foot={
        <>
          {proposer && <span>{t('card_proposed_by', { who: proposer })}</span>}
          {vote.expediente_raw && <span className="mono vcard__exp">{vote.expediente_raw}</span>}
          {plainSummary && <LawOriginalToggle original={subject} provider={vote.plain_summary_provider} />}
          <ProfileEffects
            effects={vote.profile_effects}
            locale={locale}
            max={3}
            moreHref={vote.initiative_id != null ? `/initiatives/${vote.initiative_id}#com-t-afecta` : undefined}
            folded
          />
        </>
      }
    />
  );
}
