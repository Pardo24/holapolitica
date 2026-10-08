import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProposerBadges } from '@/components/InitiativeRow';
import {
  AiMark,
  LawCardBand,
  LawCardFooter,
  LawCardFrame,
  LawCardHeadline,
  LawCardVoteBox,
} from '@/components/LawCardParts';
import { DecreeLinkNote } from '@/components/DecreeLinkNote';
import { LawTypeChip } from '@/components/LawTypeChip';
import { LAW_TYPE_BINDING } from '@/lib/lawTypes';
import { VoteSplit } from '@/components/VoteSplit';
import type { InitiativeListItem } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline } from '@/lib/plainSummary';
import { type ParsedProposer } from '@/lib/groups';
import { STATUS_KEY, prefersVoteResult } from '@/lib/lawStatus';
import { pickTopicName } from '@/lib/topics';
import { changeTagIcon, isChangeTag, pdfUrl } from '@/lib/changeTags';
import { FileText } from 'lucide-react';

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
  profileKey,
}: {
  initiative: InitiativeListItem;
  parsed: ParsedProposer;
  locale: string;
  /** On a "what affects you" page: show what the text establishes for
   *  that situation, right under the headline. */
  profileKey?: string;
}) {
  const t = await getTranslations('lleis');
  const tStats = await getTranslations('stats');
  const tTopic = await getTranslations('topic');
  const tVotes = await getTranslations('votes');
  const tTags = await getTranslations('change_tags');
  const tLawText = await getTranslations('law_text');
  const changeTags = (initiative.change_tags ?? []).filter(isChangeTag);
  const changeEvidence =
    initiative.change_evidence?.[locale === 'ca' ? 'ca' : 'es'] ?? initiative.change_evidence?.es ?? {};
  const pdf = pdfUrl(initiative.source_url);
  const tProfiles = await getTranslations('profiles');
  const profileEffect = profileKey ? initiative.profile_effects?.[profileKey] : undefined;
  const forYou = profileEffect
    ? (locale === 'ca' ? profileEffect.ca : profileEffect.es) ?? profileEffect.es ?? profileEffect.ca
    : undefined;

  const href = `/initiatives/${initiative.id}` as Route;
  const plainSummary = pickPlainSummary(initiative, locale);
  // A motion's summary is a list of asks. As a card headline the list reads
  // as "… que: 1. Obligui… 2. Simplifiqui…"; here it becomes the lead plus
  // the first point, and the rest is counted beside it.
  // The generated headline when the row has one; otherwise the line derived
  // from the summary, and the official title when there is no summary at all.
  const plainTitle = pickPlainTitle(initiative, locale);
  const headline =
    plainTitle ?? (plainSummary ? summaryHeadline(plainSummary) : initiative.title_original);
  const statusKey = STATUS_KEY[initiative.status];
  const statusLabel = statusKey ? tStats(statusKey) : initiative.status;
  const showVoteResult = prefersVoteResult(initiative.status, initiative.latest_vote_result);

  const vote = initiative.latest_vote ?? null;
  const voteDate = vote?.voted_at
    ? new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })
    : null;

  // The band: the first subject (a theme before an SDG) and the outcome.
  const outcomeKey = showVoteResult ? initiative.latest_vote_result : null;
  // The colour follows the verdict wherever it comes from: the latest vote,
  // or the initiative's own status when that is the verdict (a rejected
  // proposición de ley carries it in its status).
  const toneKey =
    outcomeKey ??
    (initiative.status === 'approved' || initiative.status === 'rejected' ? initiative.status : null);
  const outcomeLabel = outcomeKey
    ? tVotes(`result.${outcomeKey}` as 'result.approved')
    : statusLabel;
  const dateIso = vote?.voted_at ?? initiative.submitted_at;
  const dateLabel = dateIso
    ? new Date(dateIso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  // The summary's lead, when the headline is a title of its own.
  const cardSummary = plainTitle && plainSummary ? summaryHeadline(plainSummary) : null;
  // "en" has no audience list of its own; Spanish is the source language.
  const audiences = (
    locale === 'ca'
      ? initiative.affected_audiences?.ca
      : (initiative.affected_audiences?.es ?? initiative.affected_audiences?.ca)
  )?.filter(Boolean);

  return (
    <LawCardFrame data={{ 'data-result': toneKey ?? 'pending' }}>
      {/* The band: what it is about, and how it ended, in the outcome's
          colour. One look says "housing, approved". */}
      <LawCardBand topics={initiative.topics} outcome={toneKey} label={outcomeLabel} locale={locale} />

      {/* What kind of text, and when it was last voted (or tabled). */}
      <div className="law-card-meta">
        <LawTypeChip type={initiative.type} />
        {LAW_TYPE_BINDING[initiative.type] === false && (
          <span className="law-card-nonbinding">{t('card_non_binding')}</span>
        )}
        {dateLabel && <span className="tabular">{dateLabel}</span>}
      </div>

      {/* What it does, in plain language. A machine-written line carries a
          small sparkle (with its label for screen readers and on hover). */}
      <LawCardHeadline href={href} size="lg">
        {plainSummary && <AiMark label={t('card_ai_summary')} />}
        {headline}
      </LawCardHeadline>

      {initiative.decree_link && <DecreeLinkNote link={initiative.decree_link} />}

      {/* Three lines of the summary, under a headline of its own. When the
          headline is itself taken from the summary, this would repeat it. */}
      {cardSummary && <p className="law-card-summary">{cardSummary}</p>}

      {/* Who it touches: the collectives named in the text itself. */}
      {audiences && audiences.length > 0 && (
        <div className="law-card-affects">
          <span>{t('card_affects')}</span>
          {(() => {
            const list = audiences.slice(0, 5).join(', ');
            return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1);
          })()}
        </div>
      )}

      {/* What the text establishes for the reader's situation. */}
      {forYou && (
        <p className="law-card-for-you">
          <span>{tProfiles('for_you')}</span>
          {forYou}
        </p>
      )}

      {/* What the text changes: symmetric facts read from the bill itself,
          as icon chips, no label row. The passage behind each is on the
          law's page; the tooltip gives it here. Who it affects lives on
          the law's page too: four more chips here was one layer too many. */}
      {changeTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {changeTags.map((tag) => {
            const Icon = changeTagIcon(tag);
            return (
              <span key={tag} className="change-chip" title={changeEvidence[tag] ?? undefined}>
                <Icon size={12} strokeWidth={2} aria-hidden="true" />
                {tTags(tag)}
              </span>
            );
          })}
        </div>
      )}

      {/* The vote itself. */}
      <LawCardVoteBox>
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
          <VoteSplit
            ayes={vote.ayes}
            noes={vote.noes}
            abstentions={vote.abstentions}
            absent={vote.absent}
            groups={vote.groups}
            date={voteDate}
            bigTally
            labels={{
              // Say what was voted when it was a step, not the law: the
              // card's verdict above can differ from this vote's result
              // (amendments to the whole text rejected = the law goes on).
              eyebrow:
                vote.stage === 'totality'
                  ? t('card_votes_eyebrow_totality')
                  : vote.stage === 'taking'
                    ? t('card_votes_eyebrow_taking')
                    : vote.stage === 'convalidation'
                      ? t('card_votes_eyebrow_convalidation')
                      : t('card_votes_eyebrow'),
              inFavour: t('card_in_favour'),
              against: t('card_against'),
              abstention: t('card_abstention'),
              detail: t('card_group_detail'),
              sideEmpty: t('card_side_empty'),
              noBreakdown: t('card_no_breakdown'),
            }}
          />
        )}
      </LawCardVoteBox>

      {/* Footer: who tabled it, its file number, and the way in. */}
      <LawCardFooter href={href} openLabel={t('card_open')}>
        {(parsed.isGovernment || parsed.groups.length > 0 || parsed.raw !== '') && (
          <ProposerBadges
            parsed={parsed}
            governmentLabel={tTopic('proposer_government_label')}
            moreGroupsLabel={(n: number) => tTopic('proposer_more_groups', { count: n })}
            rawFallback={initiative.submitted_by ?? ''}
          />
        )}
        {pdf && (
          <a href={pdf} target="_blank" rel="noopener noreferrer" className="card-pdf-link">
            <FileText size={12} strokeWidth={2} aria-hidden="true" />
            {tLawText('pdf_short')}
          </a>
        )}
      </LawCardFooter>
    </LawCardFrame>
  );
}
