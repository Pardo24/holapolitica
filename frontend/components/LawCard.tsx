import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProposerBadges } from '@/components/InitiativeRow';
import {
  LawCardFooter,
  LawCardFrame,
  LawCardHeadline,
  LawCardTopLine,
  LawCardVoteBox,
} from '@/components/LawCardParts';
import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { SummaryProvenance } from '@/components/SummaryProvenance';
import { TopicChip } from '@/components/TopicChip';
import { VoteSplit } from '@/components/VoteSplit';
import type { InitiativeListItem } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline, summaryPointCount, summaryRestCount } from '@/lib/plainSummary';
import { type ParsedProposer } from '@/lib/groups';
import { STATUS_COLOR, STATUS_KEY, prefersVoteResult } from '@/lib/lawStatus';
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
}: {
  initiative: InitiativeListItem;
  parsed: ParsedProposer;
  locale: string;
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
  // With a real headline the card shows the whole summary count; without one
  // the headline already swallowed the first point.
  // With a real headline none of the points are on the card, so the chip
  // counts them all; without one the headline already showed the first.
  const morePoints = !plainSummary
    ? 0
    : plainTitle
      ? summaryPointCount(plainSummary)
      : summaryRestCount(plainSummary);

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
    <LawCardFrame>
      {/* Line 1: what kind of law it is, what it touches, how it ended. */}
      <LawCardTopLine
        outcome={
          showVoteResult && initiative.latest_vote_result ? (
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
          )
        }
      >
        <LawTypeChip type={initiative.type} />
        {(initiative.topics ?? []).slice(0, 2).map((tp) => (
          <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
        ))}
      </LawCardTopLine>

      {/* Line 2: what it does, in plain language — and who wrote that
          line. When no summary exists the card used to show the official
          title with no explanation, which read as if the project had
          chosen to speak in legalese. */}
      <SummaryProvenance
        kind={plainSummary ? 'ai' : 'none'}
        label={plainSummary ? t('card_ai_summary') : t('card_no_summary')}
      />
      <LawCardHeadline href={href}>{headline}</LawCardHeadline>
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

      {/* What the text changes: symmetric facts read from the bill
          itself, both sides of a pair drawn alike. The passage behind
          each is on the law's page; the tooltip gives it here. */}
      {changeTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <span style={EYEBROW}>{tLawText('changes_label')}</span>
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
        <span className="mono" style={{ fontSize: 10, wordBreak: 'break-all' }}>
          {initiative.official_id}
        </span>
        {plainSummary && (
          <LawOriginalToggle
            original={initiative.title_original}
            provider={initiative.plain_summary_provider}
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

const EYEBROW: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};
