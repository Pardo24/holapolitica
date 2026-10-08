import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, ExternalLink, FileText, Route as RouteIcon, Users } from 'lucide-react';

import { AiBadge } from '@/components/AiBadge';
import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupVoteBreakdown } from '@/components/GroupVoteBreakdown';
import { LawJourney } from '@/components/LawJourney';
import { LawTextPanel } from '@/components/LawTextPanel';
import { VoteChain } from '@/components/VoteChain';
import { VoteSplit } from '@/components/VoteSplit';
import { LawTypeChip } from '@/components/LawTypeChip';
import {
  PartyStanceMini,
  buildStanceByVote,
  type PartyStance,
  type StanceLabels,
} from '@/components/PartyStanceRow';
import { DecreeLinkNote } from '@/components/DecreeLinkNote';
import { ResultPill } from '@/components/ResultPill';
import { FollowLawButton } from '@/components/FollowLawButton';
import { ShareButton } from '@/components/ShareButton';
import { StackedBar } from '@/components/StackedBar';
import { SummaryBody } from '@/components/SummaryBody';
import { SummaryProvenance } from '@/components/SummaryProvenance';
import {
  api,
  ApiError,
  type Initiative,
  type InitiativeVoteSummary,
  type ParliamentaryGroupSummary,
} from '@/lib/api';
import { parseProposer, displayGroupShort } from '@/lib/groups';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { isStubLead, parseSummary } from '@/lib/plainSummary';
import { effectiveResult } from '@/lib/lawStatus';
import { pickTopicName } from '@/lib/topics';
import { topicIcon } from '@/lib/topic_icons';
import { pdfUrl } from '@/lib/changeTags';

interface Params {
  id: string;
}

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

/** Procedures voted point by point, where each point stands on its own. */
const MOTION_TYPES = new Set(['mocion', 'proposicion_no_ley', 'interpelacion']);

const STATUS_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const initiativeId = Number(id);
  if (!Number.isFinite(initiativeId)) return {};
  try {
    const ini = await api.initiatives.get(initiativeId);
    const title = ini.title_ca ?? ini.title_original;
    const titleShort = title.length > 120 ? title.slice(0, 117) + '…' : title;
    const description =
      ini.plain_summary_ca ??
      ini.plain_summary_es ??
      `Iniciativa ${ini.official_id} · ${ini.type}`;
    return {
      title: titleShort,
      description: description.slice(0, 220),
      openGraph: { title: titleShort, description: description.slice(0, 220), type: 'article' },
      twitter: { card: 'summary_large_image', title: titleShort, description: description.slice(0, 220) },
    };
  } catch {
    return {};
  }
}

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const initiativeId = Number(id);
  if (!Number.isFinite(initiativeId)) notFound();

  const t = await getTranslations('initiative_detail');
  const tVotes = await getTranslations('votes');
  const tLleis = await getTranslations('lleis');
  const tCommon = await getTranslations('common');
  const tLifecycle = await getTranslations('lifecycle');
  const tLawText = await getTranslations('law_text');
  // Status labels live under the ``stats`` namespace; we look them up
  // via a small key map so the fallback to the raw enum string remains
  // graceful when an unexpected backend value lands.
  const tStats = await getTranslations('stats');
  const resolveStatusLabel = (status: string): string => {
    const key = STATUS_KEY[status];
    if (!key) return status;
    try {
      return tStats(key);
    } catch {
      return status;
    }
  };
  const locale = await getLocale();

  let initiative: Initiative;
  let related: Initiative[] = [];
  let groups: ParliamentaryGroupSummary[] = [];
  try {
    initiative = await api.initiatives.get(initiativeId);
    const [rel, grp] = await Promise.all([
      api.initiatives.related(initiativeId, 6).catch(() => [] as Initiative[]),
      api.groups.list(initiative.legislature_id).catch(() => [] as ParliamentaryGroupSummary[]),
    ]);
    related = rel;
    groups = grp;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const title = pickTitle(initiative, locale);
  const summary = pickPlainSummary(initiative, locale);
  // Same split as on the vote page: lead as the headline, asks as a list.
  // Except when the lead is the bare formula ("Demana al Govern que:"): that
  // introduces the list fine and says nothing as a headline, so the official
  // title takes the headline back and the whole summary renders below.
  const plainTitle = pickPlainTitle(initiative, locale);
  // With a generated headline the whole summary renders below it; without
  // one the lead does headline duty, unless it is the bare formula
  // ("Demana al Govern que:"), when the official title takes over.
  const summaryStub = isStubLead(summary);
  const summaryLead =
    plainTitle ?? (summary && !summaryStub ? parseSummary(summary).lead : null);
  const officialTextUrl =
    pdfUrl(initiative.source_url) ??
    (initiative.type === 'real_decreto_ley' ? (initiative.boe_url ?? null) : null);
  const submittedDate = initiative.submitted_at
    ? new Date(initiative.submitted_at).toLocaleDateString(locale, { dateStyle: 'long' })
    : null;
  const parsedProposer = parseProposer(initiative.submitted_by, groups);
  const votes = initiative.votes ?? [];
  const primaryVote = votes[0] ?? null;
  // Per-group stance on each of the law's votes ("who voted for / against"),
  // in one cached call. Best-effort: on failure the cards render without it.
  const tSession = await getTranslations('session_sheet');
  const voteIds = votes.map((v) => v.id);
  const groupChoices =
    voteIds.length > 0 ? await api.votes.groupChoices(voteIds).catch(() => null) : null;
  const stanceByVote: Map<number, PartyStance[]> = groupChoices
    ? buildStanceByVote(groupChoices.groups)
    : new Map();
  const stanceLabels: StanceLabels = {
    aye: tSession('choice_aye'),
    no: tSession('choice_no'),
    abstention: tSession('choice_abstention'),
    absent: tSession('choice_absent'),
  };
  // The law's fate = the result of its final (latest) vote — the whole-text
  // vote after the amendments.
  const finalVote =
    votes.length > 0
      ? [...votes].sort((a, b) => a.voted_at.localeCompare(b.voted_at))[votes.length - 1]!
      : null;
  // Motions and PNLs are often split into numbered points, each voted on
  // its own, so there is no "final, decisive" vote to lead with: the last
  // one by id is simply the last one. The plenary sheet already says "X de N
  // punts aprovats" for these; this page said "Votació final (decisiva)" and
  // picked one arbitrarily. Same rule as ``fateResult`` in lib/sessionSummary
  // so the two surfaces cannot disagree about how a motion ended.
  const byPoints = MOTION_TYPES.has(initiative.type) && votes.length > 1;
  const approvedPoints = votes.filter((v) => v.result === 'approved').length;
  const pointsOutcome: 'approved' | 'rejected' | 'tie' | null = !byPoints
    ? null
    : votes.some((v) => v.result === 'approved')
      ? 'approved'
      : votes.every((v) => v.result === 'tie')
        ? 'tie'
        : 'rejected';
  // The chip the page leads with. The portal's lifecycle status goes stale
  // (a decree-law stays "submitted" long after the chamber convalidated it),
  // so a page could open with "Presentada" directly above a vote block that
  // said "Aprovada". When a roll call has happened it decides the chip, the
  // same rule the cards in every list already follow.
  const outcome = effectiveResult(initiative.status, pointsOutcome ?? finalVote?.result ?? null);
  const chipStatus = outcome ?? initiative.status;
  const statusLabel =
    outcome === 'tie' ? tVotes('result.tie') : resolveStatusLabel(chipStatus);
  const statusColor =
    outcome === 'tie' ? 'var(--abst)' : (STATUS_COLOR[chipStatus] ?? 'var(--ink-3)');
  // A law with no summary of its own fell back to its official title, and
  // for a motion that title is the proposing group's own wording. This page
  // opened with "sobre la nefasta política educativa de su Gobierno" set in
  // display serif, which reads as the site saying it rather than quoting it.
  // The votes on the very same text carry generated headlines, so the
  // earliest one leads instead and the official wording keeps its place
  // below, labelled for anyone checking the exact words.
  const borrowedHeadline = summaryLead
    ? null
    : ([...votes]
        .sort((a, b) => a.voted_at.localeCompare(b.voted_at) || a.id - b.id)
        .map((v) => pickPlainTitle(v, locale))
        .find((candidate): candidate is string => Boolean(candidate)) ?? null);
  const headline = summaryLead ?? borrowedHeadline;
  // The official wording shows below whenever it is not already the headline.
  const showOfficialBelow = Boolean(borrowedHeadline) || Boolean(summary && !summaryStub && !plainTitle);
  // The amendment / article votes (everything but the decisive final one),
  // shown collapsed since the final vote is what decides the law.
  const otherVotes = finalVote
    ? [...votes]
        .filter((v) => v.id !== finalVote.id)
        .sort((a, b) => a.voted_at.localeCompare(b.voted_at))
    : [];
  const topics = initiative.topics ?? [];

  return (
    <article>

      {/* Breadcrumb */}
      <div className="crumbs" style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 6 }}>
        <Link href="/votes" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_root')}
        </Link>
        {' / '}
        <span className="mono">{initiative.official_id}</span>
      </div>

      {/* Header. Four plain layers, so a reader finds each thing without
          reading the rest: the title (big, the one line to read); what kind
          of text it is and when it was tabled (small); who proposed it and
          how it ended; then the AI summary, quieter, in its own box, with
          one short caveat. The actions close it. */}
      <header className="law-head">
        <SummaryProvenance
          kind={summary || borrowedHeadline ? 'ai' : 'none'}
          label={
            summary
              ? tLleis('card_ai_summary')
              : borrowedHeadline
                ? tLleis('card_ai_title_from_vote')
                : tLleis('card_no_summary')
          }
        />
        <h1 className="h-headline law-head__title">{headline ?? <AnnotatedText text={title} />}</h1>

        <div className="law-head__context">
          <LawTypeChip type={initiative.type} size="md" />
          <span className="mono">EXP {initiative.official_id}</span>
          {submittedDate && (
            <span>
              {t('submitted_at_short')} <span className="tabular">{submittedDate}</span>
            </span>
          )}
        </div>

        {initiative.decree_link && <DecreeLinkNote link={initiative.decree_link} />}

        <div className="law-head__who initiative-meta-strip">
          {(parsedProposer.isGovernment || parsedProposer.groups.length > 0) && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {tVotes('proposed_by')}
              </span>
              {parsedProposer.isGovernment ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--ink)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--ink)' }}
                  />
                  {tVotes('proposed_by_government')}
                </span>
              ) : (
                parsedProposer.groups.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/groups/${g.slug}` as Route}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 9,
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <GroupBadge slug={g.slug} color={g.color_hex} size="md" link={false} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                      {displayGroupShort(g.name_short)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
          {/* Status as a self-explanatory coloured pill (soft tint of the
              status colour + dot + label) — reads without a heading. */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              borderRadius: 999,
              background: `color-mix(in oklch, ${statusColor} 14%, var(--paper))`,
              border: `1px solid color-mix(in oklch, ${statusColor} 35%, var(--paper))`,
              color: statusColor,
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: 999, background: statusColor }}
            />
            {statusLabel}
          </span>
        </div>

        {summary && (
          <div className="law-head__summary">
            {/* The asks, as the list they are. A motion with six points read
                as one paragraph under the headline. */}
            <SummaryBody text={summary} omitLead={!summaryStub && !plainTitle} />
            <p className="law-head__caveat" title={initiative.plain_summary_provider ?? undefined}>
              {t('summary_caveat_short')} <Link href={'/about#ia' as Route}>{t('summary_caveat_how')}</Link>
            </p>
          </div>
        )}

        {/* The official wording, whenever the headline above is not already
            it: under a summary, or under a headline borrowed from a vote.
            Skipped when the summary's lead was a stub, because then the
            headline IS this title and it would print twice. */}
        {showOfficialBelow && (
          <p className="law-head__official">
            <span>{t('official_title_label')}</span> <AnnotatedText text={title} />
          </p>
        )}

        <div className="law-head__actions">
          {/* The official text, at the top: many titles don't say what a
              law does, and the PDF used to sit far down the left column.
              A Real Decreto-ley has no PDF in Congress: its text is the
              BOE one. */}
          {officialTextUrl && (
            <a
              href={officialTextUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="law-pdf-top"
            >
              <FileText size={13} strokeWidth={2} aria-hidden="true" />
              {tLawText('pdf_short')}
            </a>
          )}
          <Link
            href={'/recorregut' as Route}
            aria-label={tLifecycle('cta_short')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 999,
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <RouteIcon size={12} aria-hidden="true" />
            {tLifecycle('cta_short')}
          </Link>
          {/* "Tell me how this one ends": a law is voted several times over
              months, and the only way to find out was to come back. */}
          <FollowLawButton initiativeId={initiative.id} />
          <ShareButton url={`/initiatives/${initiative.id}`} title={title} size="sm" label={tVotes('share_cta')} />
        </div>
      </header>

      {/* How the chamber split, right after what the law does. It used
          to sit some 400 lines below, so the page answered "what is this"
          long before "who backed it". Same component as the laws list,
          with the breakdown open: on a law's own page it is the point. */}
      {finalVote && !byPoints && !finalVote.approved_by_assent && (
        <section
          style={{
            marginTop: 18,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid var(--rule)',
            background: 'var(--paper-2)',
          }}
        >
          <VoteSplit
            ayes={finalVote.ayes}
            noes={finalVote.noes}
            abstentions={finalVote.abstentions}
            absent={finalVote.absent}
            groups={stanceByVote.get(finalVote.id) ?? []}
            date={new Date(finalVote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
            size="lg"
            labels={{
              eyebrow: tLleis('card_votes_eyebrow'),
              inFavour: tLleis('card_in_favour'),
              against: tLleis('card_against'),
              abstention: tLleis('card_abstention'),
              detail: tLleis('card_group_detail'),
              sideEmpty: tLleis('card_side_empty'),
              noBreakdown: tLleis('card_no_breakdown'),
            }}
          />
        </section>
      )}

      {/* What the bill's own text says, article by article, and the PDF. */}
      <LawTextPanel initiative={initiative} locale={locale} />

      {/* Where the law stands in its journey. It used to open the page,
          which spent the most valuable position on procedure; it now
          follows the answer (what it does, and the official wording). */}
      <LawJourney
        type={initiative.type}
        status={initiative.status}
        hasBoe={!!initiative.boe_url}
        // Without this the banner read "Presentada, 1 de 4 etapes" under a
        // vote block announcing the result. It already knows how to prefer
        // the roll call for single-vote procedures; it was never told one
        // had happened.
        voteResult={finalVote?.result ?? null}
      />

      {/* Two-column layout: plain summary + vote box */}
      <section
        className="initiative-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 48,
          paddingTop: 28,
        }}
      >
        <div>
          {/* The summary now leads the page header, so this column opens
              with who the law touches instead of repeating it. */}
          {!summary && (
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_summary_yet')}</p>
          )}

          {/* Who does this directly affect — LLM-extracted audience tags
              (inquilinos, autónomos…). The consequences layer: not just
              what the law does, but whose life it touches. Hidden when
              the extraction hasn't run or found no concrete audience. */}
          {(() => {
            const audiences =
              initiative.affected_audiences?.[locale === 'ca' ? 'ca' : 'es'] ?? [];
            if (audiences.length === 0) return null;
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                  }}
                >
                  <Users
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    style={{ color: 'var(--accent)' }}
                  />
                  {t('affects_label')}
                </span>
                {audiences.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: '3px 11px',
                      borderRadius: 999,
                      background: 'color-mix(in oklch, var(--accent) 10%, var(--paper))',
                      border: '1px solid color-mix(in oklch, var(--accent) 26%, var(--paper))',
                      color: 'var(--ink)',
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            );
          })()}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 18,
            }}
          >
            {/* The PDF and the BOE now live in the "what the text says"
                panel, and the PDF at the top of the page as well. */}
          </div>
          {initiative.boe_entry_in_force && (
            <div
              style={{
                marginTop: 14,
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              <span
                className="eyebrow"
                style={{ fontSize: 10, color: 'var(--ink-3)' }}
              >
                {t('entry_in_force')}
              </span>
              <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {new Date(initiative.boe_entry_in_force).toLocaleDateString(locale, {
                  dateStyle: 'long',
                })}
              </span>
            </div>
          )}

          {topics.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {t('topics_label')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topics.map((tp) => {
                  const Icon = topicIcon(tp.icon);
                  const c = tp.color_hex ?? 'var(--ink-3)';
                  return (
                    <Link
                      key={tp.slug}
                      href={`/topics/${tp.slug}` as Route}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px 4px 6px',
                        borderRadius: 999,
                        border: `1px solid color-mix(in oklch, ${c} 40%, var(--rule))`,
                        background: `color-mix(in oklch, ${c} 10%, var(--paper))`,
                        color: 'var(--ink)',
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: `color-mix(in oklch, ${c} 22%, var(--paper))`,
                          color: c,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      {pickTopicName(tp, locale)}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          {votes.length > 1 && (
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {byPoints
                ? tSession('points_summary', { approved: approvedPoints, total: votes.length })
                : t('vote_box_title_multipart', { n: votes.length })}
            </div>
          )}
          {primaryVote ? (
            votes.length === 1 ? (
              // A law with a single vote now has that vote at the top of the
              // page; repeating it here showed the same tally and the same
              // group lists twice.
              null
            ) : (
              <>
                {/* The decisive vote leads — the whole-text vote after the
                    amendments. It carries the outcome and who voted; the rest
                    are collapsed below. A motion voted by points has no such
                    vote: every point is its own question, so the list of
                    points below IS the answer. */}
                {!byPoints && (
                  <>
                    <div
                      className="eyebrow"
                      style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 6 }}
                    >
                      {t('final_vote_label')}
                    </div>
                    {finalVote && (
                      <VoteCardBig
                        vote={finalVote}
                        locale={locale}
                        t={t}
                        tVotes={tVotes}
                        stance={stanceByVote.get(finalVote.id)}
                        stanceLabels={stanceLabels}
                      />
                    )}
                  </>
                )}
                {byPoints && (
                  <p
                    style={{
                      margin: '0 0 14px',
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: 'var(--ink-2)',
                    }}
                  >
                    {tSession('points_why')}
                  </p>
                )}
                {/* The chain: every vote this law went through, in order,
                    saying what each one decided. It used to be a collapsed
                    list of dates, so a reader could see there were four
                    votes and not how they related. */}
                <div style={{ marginTop: byPoints ? 0 : 18 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>
                    {byPoints ? t('points_title') : t('chain_title')}
                  </div>
                  <VoteChain
                    votes={votes}
                    locale={locale}
                    pointLabel={byPoints ? (n) => tSession('point_label', { n }) : undefined}
                  />
                </div>
                {!byPoints && otherVotes.length > 0 && (
                  <details style={{ marginTop: 16 }}>
                    <summary
                      style={{
                        cursor: 'pointer',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--ink-2)',
                      }}
                    >
                      {t('other_votes_toggle', { n: otherVotes.length })}
                    </summary>
                    <p
                      style={{
                        margin: '8px 0 10px',
                        fontSize: 12,
                        color: 'var(--ink-3)',
                        lineHeight: 1.5,
                      }}
                    >
                      {t('vote_box_multipart_explainer')}
                    </p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {otherVotes.map((v, i) => (
                        <li key={v.id}>
                          <VoteCardCompact
                            vote={v}
                            index={i + 1}
                            total={otherVotes.length}
                            locale={locale}
                            t={t}
                            tVotes={tVotes}
                            stance={stanceByVote.get(v.id)}
                            stanceLabels={stanceLabels}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {/* How each group voted on the decisive (final) vote —
                    grouped by stance, clearer than a per-vote table. */}
                {!byPoints && finalVote && (stanceByVote.get(finalVote.id)?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>
                      {tVotes('group_stance_title')}
                    </div>
                    <GroupVoteBreakdown
                      parties={stanceByVote.get(finalVote.id)!}
                      labels={stanceLabels}
                    />
                  </div>
                )}
              </>
            )
          ) : (
            <p
              style={{
                padding: '14px 18px',
                borderRadius: 12,
                border: '1px dashed var(--rule)',
                background: 'var(--paper-2)',
                fontSize: 13,
                color: 'var(--ink-3)',
                margin: 0,
              }}
            >
              {t('no_vote_yet')}
            </p>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section style={{ paddingTop: 40, paddingBottom: 32 }}>
          <h2
            className="serif"
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: '0 0 14px',
              color: 'var(--ink)',
            }}
          >
            {t('related_title')}
          </h2>
          <ul
            className="initiative-related-grid"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
              gap: 12,
            }}
          >
            {related.map((r) => {
              const rTitle = pickTitle(r, locale);
              const rStatus = resolveStatusLabel(r.status);
              const rStatusColor = STATUS_COLOR[r.status] ?? 'var(--ink-3)';
              return (
                <li key={r.id}>
                  <Link
                    href={`/initiatives/${r.id}` as Route}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'var(--paper-2)',
                      border: '1px solid var(--rule)',
                      color: 'inherit',
                      textDecoration: 'none',
                      height: '100%',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                      {r.official_id}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        lineHeight: 1.35,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {rTitle}
                    </span>
                    <span
                      style={{
                        marginTop: 'auto',
                        fontSize: 11,
                        fontWeight: 600,
                        color: rStatusColor,
                      }}
                    >
                      {rStatus}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <style>{`
        @media (max-width: 860px) {
          .initiative-detail-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
        .initiative-source-link:hover,
        .initiative-source-link:focus-visible {
          background: var(--paper) !important;
          outline: none;
        }
        .initiative-vote-card:hover,
        .initiative-vote-card:focus-visible {
          background: var(--paper) !important;
          outline: none;
        }
      `}</style>
    </article>
  );
}

function pickTitle(ini: Initiative, locale: string): string {
  if (locale === 'es' && ini.title_es) return ini.title_es;
  if (locale === 'en' && ini.title_en) return ini.title_en;
  return ini.title_ca ?? ini.title_original;
}

type InitiativeTranslator = Awaited<ReturnType<typeof getTranslations<'initiative_detail'>>>;
type VotesTranslator = Awaited<ReturnType<typeof getTranslations<'votes'>>>;

function VoteCardBig({
  vote,
  locale,
  t,
  tVotes,
  stance,
  stanceLabels,
}: {
  vote: InitiativeVoteSummary;
  locale: string;
  t: InitiativeTranslator;
  tVotes: VotesTranslator;
  stance?: PartyStance[];
  stanceLabels: StanceLabels;
}) {
  return (
    <Link
      href={`/votes/${vote.id}` as Route}
      className="initiative-vote-card"
      style={{
        display: 'block',
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ResultPill result={vote.result} label={tVotes(`result.${vote.result}`)} />
        <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>
          {new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 0,
          marginBottom: 10,
        }}
      >
        {[
          { label: tVotes('ayes'), n: vote.ayes, color: 'var(--aye)' },
          { label: tVotes('noes'), n: vote.noes, color: 'var(--no)' },
          { label: tVotes('abstentions'), n: vote.abstentions, color: 'var(--abst)' },
        ].map((c, i) => (
          <div
            key={c.label}
            style={{
              borderLeft: i > 0 ? '1px solid var(--rule)' : 'none',
              paddingLeft: i > 0 ? 10 : 0,
              minWidth: 0,
            }}
          >
            <div className="eyebrow">{c.label}</div>
            <div
              className="tabular"
              style={{ fontSize: 24, fontWeight: 600, color: c.color, letterSpacing: '-0.02em' }}
            >
              {c.n}
            </div>
          </div>
        ))}
      </div>
      <StackedBar
        d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
        height={10}
      />
      {stance && stance.length > 0 && (
        <PartyStanceMini parties={stance} labels={stanceLabels} />
      )}
      <span
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink-2)',
        }}
      >
        {t('view_vote_detail')}
        <ArrowRight size={12} aria-hidden="true" />
      </span>
    </Link>
  );
}

function VoteCardCompact({
  vote,
  index,
  total,
  locale,
  t,
  tVotes,
  stance,
  stanceLabels,
}: {
  vote: InitiativeVoteSummary;
  index: number;
  total: number;
  locale: string;
  t: InitiativeTranslator;
  tVotes: VotesTranslator;
  stance?: PartyStance[];
  stanceLabels: StanceLabels;
}) {
  return (
    <Link
      href={`/votes/${vote.id}` as Route}
      className="initiative-vote-card"
      style={{
        display: 'block',
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          className="eyebrow"
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {t('vote_box_part_label', { index, total })}
        </span>
        <ResultPill result={vote.result} label={tVotes(`result.${vote.result}`)} />
        <span
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}
        >
          {new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 0,
          marginBottom: 8,
        }}
      >
        {[
          { label: tVotes('ayes'), n: vote.ayes, color: 'var(--aye)' },
          { label: tVotes('noes'), n: vote.noes, color: 'var(--no)' },
          { label: tVotes('abstentions'), n: vote.abstentions, color: 'var(--abst)' },
        ].map((c, i) => (
          <div
            key={c.label}
            style={{
              borderLeft: i > 0 ? '1px solid var(--rule)' : 'none',
              paddingLeft: i > 0 ? 10 : 0,
              minWidth: 0,
            }}
          >
            <div className="eyebrow" style={{ fontSize: 10 }}>
              {c.label}
            </div>
            <div
              className="tabular"
              style={{ fontSize: 18, fontWeight: 600, color: c.color, letterSpacing: '-0.02em' }}
            >
              {c.n}
            </div>
          </div>
        ))}
      </div>
      <StackedBar
        d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
        height={8}
      />
      {stance && stance.length > 0 && (
        <PartyStanceMini parties={stance} labels={stanceLabels} />
      )}
    </Link>
  );
}
