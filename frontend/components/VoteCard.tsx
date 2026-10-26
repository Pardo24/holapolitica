import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawTypeChip } from '@/components/LawTypeChip';
import { stanceLabel } from '@/components/PartyStanceRow';
import { ProfileEffects } from '@/components/ProfileEffects';
import { SummaryProvenance } from '@/components/SummaryProvenance';
import { TopicChip } from '@/components/TopicChip';
import type { Vote } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline, summaryPointCount, summaryRestCount } from '@/lib/plainSummary';
import { groupLogoUrl } from '@/lib/groupLogos';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * One VOTE, as a full-width card: the /votes archive.
 *
 * Two parts (2026-10-26): what was voted on the left (what it does, who it
 * affects, how each group voted) and the result on the right, as a
 * scoreboard: the outcome, the count, the margin and the bar against the
 * absolute majority. On a phone the scoreboard sits under the headline.
 * The groups were behind a "detail by group" button; they are the point
 * of the card, so they are on it, named and counted.
 *
 * Styled by class (.vcard in globals.css): the list prints twenty of these.
 */

const SIDES = [
  { choice: 'aye', key: 'card_in_favour', color: 'var(--aye)' },
  { choice: 'no', key: 'card_against', color: 'var(--no)' },
  { choice: 'abstention', key: 'card_abstention', color: 'var(--abst)' },
] as const;

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

  // The scoreboard: the bar spans the whole chamber, so the majority line
  // (176 of 350) sits where it really is.
  const chamber = vote.ayes + vote.noes + vote.abstentions + vote.absent || 350;
  const majority = Math.floor(chamber / 2) + 1;
  const margin = Math.abs(vote.ayes - vote.noes);
  const pct = (n: number) => `${(100 * n) / chamber}%`;
  const groups = [...(vote.groups ?? [])].sort((a, b) => (b.deputies ?? 0) - (a.deputies ?? 0));
  const proposer =
    vote.proposed_by_government && !vote.proposing_group_short
      ? tVotes('proposed_by_government')
      : vote.proposing_group_short
        ? displayGroupShort(vote.proposing_group_short)
        : null;

  return (
    <li className={`vcard vcard--${vote.result}`}>
      <div className="vcard__head">
        <div className="vcard__chips">
          {vote.initiative_type && <LawTypeChip type={vote.initiative_type} />}
          {(vote.topics ?? []).slice(0, 2).map((tp) => (
            <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
          ))}
        </div>
        {/* Same label as on a law card: the headline is either a machine
            summary or the chamber's own wording, and which one it is should
            never be a guess. */}
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
          // The points the headline leaves out. Counted, not run together:
          // "+3 punts més" says there is a list without pretending the card
          // can show it.
          <span className="vcard__more">{t('card_more_points', { n: morePoints })}</span>
        )}
        <ProfileEffects
          effects={vote.profile_effects}
          locale={locale}
          max={3}
          moreHref={vote.initiative_id != null ? `/initiatives/${vote.initiative_id}#com-t-afecta` : undefined}
          folded
        />
      </div>

      <div className="vcard__score">
        <span className="vcard__result">{tVotes(`result.${vote.result}` as 'result.approved')}</span>
        {vote.approved_by_assent ? (
          <span className="vcard__note">{t('card_by_assent')}</span>
        ) : (
          <>
            <span className="vcard__count serif tabular">
              {vote.ayes}
              <span className="vcard__dash" aria-hidden="true">
                {' – '}
              </span>
              <span className="sr-only"> / </span>
              {vote.noes}
            </span>
            <span className="vcard__note tabular">
              {vote.result !== 'tie' && `${t('card_margin', { n: margin })} · `}
              {t('card_abstentions', { n: vote.abstentions })}
            </span>
            <span className="vcard__bar" aria-hidden="true">
              <span style={{ width: pct(vote.ayes), background: 'var(--aye)' }} />
              <span style={{ width: pct(vote.abstentions), background: 'var(--abst)' }} />
              <span style={{ width: pct(vote.noes), background: 'var(--no)' }} />
              <i style={{ left: pct(majority) }} />
            </span>
          </>
        )}
        <span className="vcard__date">{voteDate}</span>
        <Link href={href} className="vcard__open card-open-link">
          {tVotes('see_vote')}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {!vote.approved_by_assent && (
        // Who voted what, by logo: one row per position, each party's mark
        // ringed in that position's colour with its short name and deputies
        // under it (the .psm marks of the plenary sheet). Read at a glance,
        // where a list of names had to be read.
        <div className="vcard__groups psm">
          {groups.length === 0 ? (
            <p className="vcard__none">{t('card_no_breakdown')}</p>
          ) : (
            SIDES.map(({ choice, key, color }) => {
              const side = groups.filter((g) => g.choice === choice);
              if (side.length === 0) return null;
              return (
                <div key={choice} className="vcard__side" style={{ ['--psm-ring' as string]: color }}>
                  <span className="vcard__side-label" style={{ color }}>
                    {t(key)}
                  </span>
                  <span className="vcard__marks">
                    {side.map((g) => {
                      const logo = groupLogoUrl(g.slug);
                      return (
                        <span
                          key={g.slug}
                          className="psm-party"
                          title={`${displayGroupShort(g.name_short)} · ${t(key)}`}
                        >
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logo}
                              alt=""
                              width={22}
                              height={22}
                              loading="lazy"
                              decoding="async"
                              className="psm-mark psm-mark--logo"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="psm-mark psm-mark--disc"
                              style={{ background: g.color_hex ?? 'var(--ink-3)' }}
                            />
                          )}
                          <span className="psm-label">{stanceLabel(g)}</span>
                          {g.deputies != null && <span className="tabular psm-count">{g.deputies}</span>}
                        </span>
                      );
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="vcard__foot">
        {proposer && <span>{t('card_proposed_by', { who: proposer })}</span>}
        {vote.expediente_raw && <span className="mono vcard__exp">{vote.expediente_raw}</span>}
        {plainSummary && <LawOriginalToggle original={subject} provider={vote.plain_summary_provider} />}
      </div>
    </li>
  );
}
