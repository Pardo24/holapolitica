import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  BarChart3,
  Layers,
  Mail,
  Users,
  Vote as VoteIcon,
} from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { GroupChip } from '@/components/GroupChip';
import { SummaryHover } from '@/components/SummaryHover';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { VoteBreakdown } from '@/components/VoteBreakdown';
import {
  api,
  type ParliamentaryGroupSummary,
  type ScheduledSession,
  type TopicVoteStat,
  type Vote,
  type VoteResult,
} from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';
import { buildHighlights, type Highlight } from '@/lib/highlights';

// CSS-var color for a vote outcome — used by the inline mobile result
// label so the colored word matches the desktop pill semantics.
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

export default async function HomePage() {
  const t = await getTranslations('home');
  const tVotes = await getTranslations('votes');
  const locale = await getLocale();

  let summary: Awaited<ReturnType<typeof api.stats.summary>> | null = null;
  let latestVotes: Vote[] = [];
  let upcomingSessions: ScheduledSession[] = [];
  let allGroups: ParliamentaryGroupSummary[] = [];
  try {
    [summary, latestVotes, upcomingSessions, allGroups] = await Promise.all([
      api.stats.summary(),
      api.votes
        .list({ page: 1, page_size: 5 })
        .then((p) => p.items),
      api.agenda
        .sessions({ legislature_id: 1, upcoming_only: true })
        .then((rows) => rows.slice(0, 4))
        .catch(() => [] as ScheduledSession[]),
      api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
    ]);
  } catch {
    /* backend not ready — render with zeros */
  }

  // Highlights carousel — moved here from MobileStatsDashboard so it sits on
  // the home as a "what each group leans into" anchor below the agenda and
  // above the latest votes. We fetch per-group topic stats in parallel and
  // build a flat, symmetric (every group gets equal billing) Highlight list.
  // Failures degrade silently — the carousel renders its own empty card.
  let highlights: Highlight[] = [];
  if (allGroups.length > 0) {
    const topicStatsPerGroup = await Promise.all(
      allGroups.map((g) =>
        api.groups
          .topicStats(g.slug)
          .then((rows) => [g.slug, rows] as const)
          .catch(() => [g.slug, [] as TopicVoteStat[]] as const),
      ),
    );
    highlights = buildHighlights(allGroups, new Map(topicStatsPerGroup));
  }

  // "This week" descriptive widget — until the API exposes a daily-counts
  // endpoint, derive the figures we have today from the latest 5 votes.
  // Kept honest: shows actual ingested counts, never fabricated trends.
  const weekVotes = latestVotes;
  const weekApproved = weekVotes.filter((v) => v.result === 'approved').length;
  const weekRejected = weekVotes.filter((v) => v.result === 'rejected').length;
  const weekTied = weekVotes.filter((v) => v.result === 'tie').length;

  const classifiedPct =
    summary && summary.initiatives_total > 0
      ? Math.round((summary.initiatives_classified / summary.initiatives_total) * 100)
      : null;

  return (
    <div>
      {/* Mobile-only dashboard (≤640px). Replaces the editorial home with a
          native-app-style entry point: brand strip, search, 2×2 tile grid,
          and three compact content sections that reuse the same fetched
          data as the desktop layout below. */}
      <MobileDashboard
        highlights={highlights}
        latestVotes={latestVotes}
        upcomingSessions={upcomingSessions}
        locale={locale}
        labels={{
          brand: t('mobile_brand'),
          legislature: t('mobile_legislature'),
          stats: t('mobile_stats_short', {
            votes: (summary?.votes_total ?? 0).toLocaleString(locale),
            deputies: 350,
          }),
          tileVotes: t('mobile_tile_votes'),
          tilePersons: t('mobile_tile_persons'),
          tileTopics: t('mobile_tile_topics'),
          tileStats: t('mobile_tile_stats'),
          sectionHighlights: t('mobile_section_highlights'),
          sectionUpcoming: t('mobile_section_upcoming'),
          sectionLatest: t('mobile_section_latest'),
          seeAll: t('mobile_see_all'),
          highlightsSeeAll: t('highlights_see_all'),
          noResults: tVotes('no_results'),
          voteResultApproved: tVotes('result.approved'),
          voteResultRejected: tVotes('result.rejected'),
          voteResultTie: tVotes('result.tie'),
        }}
      />

      {/* Desktop / tablet (≥640px) — original editorial home, unchanged. */}
      <div className="hidden sm:block">
      {/* Hero — editorial, civic */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 48,
          paddingTop: 40,
          paddingBottom: 32,
          borderBottom: '1px solid var(--rule)',
        }}
        className="home-hero"
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            {t('eyebrow')}
          </div>
          <h1 className="h-display" style={{ margin: '0 0 18px', whiteSpace: 'pre-line' }}>
            {t('hero_title')}
          </h1>
          {/* Hero subtitle — desktop only. On ≤640px the eyebrow + display
              headline are already the highest-density framing the page
              needs; the prose under-claims start to feel like wall-of-text
              on a phone. Page-level CTAs sit just below, so users still
              know what to do. */}
          <p
            className="hidden sm:block"
            style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 560, margin: '0 0 28px', lineHeight: 1.5 }}
          >
            {t('hero_subtitle')}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/votes" className="btn-ink">
              {t('cta_explore')}
            </Link>
            <Link
              href={'/recorregut' as Route}
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--rule-strong)',
                textUnderlineOffset: 4,
              }}
            >
              {t('lifecycle_link')}
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 32, fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
            <span>{t('trust_no_trackers')}</span>
            <span style={{ color: 'var(--rule)' }}>·</span>
            <span>{t('trust_licence')}</span>
            <span style={{ color: 'var(--rule)' }}>·</span>
            <span>{t('trust_api')}</span>
            <span style={{ color: 'var(--rule)' }}>·</span>
            <span>{t('trust_gdpr')}</span>
          </div>
        </div>

        <div
          // Right column now hosts TWO widgets stacked vertically: the
          // HighlightsCarousel on top (rotating per-group fact card, replaces
          // the previous CohesionCarousel — cohesion now lives only on
          // /stats) and the existing "Aquesta setmana" aside below. We size
          // them inside a flex column so they share the column gracefully.
          // On mobile the entire `home-hero` collapses to a single column
          // (see media query below) and the children stack naturally.
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
          }}
          className="home-hero__right"
        >
          {/* HighlightsCarousel — rotating per-group "top-supported / top-
              rejected topic" cards. Symmetric: every group is shown in turn.
              The component handles its own empty state internally. */}
          <HighlightsCarousel items={highlights} />

          <aside
          style={{
            border: '1px solid var(--rule-strong)',
            borderRadius: 18,
            padding: 24,
            background: 'var(--paper-2)',
            boxShadow: '0 1px 0 rgba(15,23,42,.03), 0 8px 24px -16px rgba(15,23,42,.12)',
          }}
        >
          <div className="eyebrow">{t('week_eyebrow')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
            <div
              className="serif tabular"
              style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em' }}
            >
              {weekVotes.length}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {t('week_subtitle')}
              <br />
              <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                {t('week_breakdown', {
                  sessions: new Set(weekVotes.map((v) => v.session_id)).size,
                  initiatives: new Set(
                    weekVotes
                      .map((v) => v.initiative_id)
                      .filter((x): x is number => x != null),
                  ).size,
                })}
              </span>
            </div>
          </div>

          {/* Aggregate breakdown — symmetric */}
          <div
            style={{
              marginTop: 18,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 0,
              borderTop: '1px solid var(--ink)',
            }}
          >
            <div className="kpi" style={{ borderTop: 0, padding: '12px 0' }}>
              <span className="label">{tVotes('result.approved')}</span>
              <span className="value" style={{ color: 'var(--aye)' }}>
                {weekApproved}
              </span>
            </div>
            <div className="kpi" style={{ borderTop: 0, padding: '12px 0' }}>
              <span className="label">{tVotes('result.rejected')}</span>
              <span className="value" style={{ color: 'var(--no)' }}>
                {weekRejected}
              </span>
            </div>
            <div className="kpi" style={{ borderTop: 0, padding: '12px 0' }}>
              <span className="label">{tVotes('result.tie')}</span>
              <span className="value">{weekTied}</span>
            </div>
          </div>

          {/* Week-caveat methodology note. On mobile we hide the full caveat
              body and keep just the "Mètodologia →" link so the panel
              compresses but the affordance for transparency stays one tap
              away. Desktop renders the full sentence. */}
          <div
            style={{
              marginTop: 14,
              fontSize: 11,
              color: 'var(--ink-3)',
              borderTop: '1px solid var(--rule)',
              paddingTop: 10,
              lineHeight: 1.5,
            }}
          >
            <span className="hidden sm:inline">{t('week_caveat')}</span>
          </div>
        </aside>
        </div>
      </section>

      {/* Coverage strip — clickable, leads to full /stats */}
      <section style={{ borderBottom: '1px solid var(--rule)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingTop: 18,
            paddingBottom: 4,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="eyebrow">{t('coverage_title')}</div>
          <Link
            href="/stats"
            style={{
              fontSize: 12,
              color: 'var(--ink)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Veure totes les estadístiques <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
          }}
          className="home-coverage"
        >
          <div className="kpi">
            <span className="label">{t('coverage_active_deputies')}</span>
            <span className="value tabular">350</span>
            <span className="sub">{t('coverage_active_deputies_sub')}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('coverage_votes_ingested')}</span>
            <span className="value tabular">
              {summary ? summary.votes_total.toLocaleString(locale) : '—'}
            </span>
            <span className="sub">{t('coverage_votes_ingested_sub')}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('coverage_classified')}</span>
            <span className="value tabular">
              {classifiedPct == null ? '—' : `${classifiedPct}`}
              <span style={{ fontSize: 14, color: 'var(--ink-3)' }}> %</span>
            </span>
            <span className="sub">{t('coverage_classified_sub')}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('coverage_phase')}</span>
            <span className="value">{t('coverage_phase_value')}</span>
            <span className="sub">{t('coverage_phase_sub')}</span>
          </div>
        </div>
      </section>

      {/* Newsletter signup — single card with a decorative Mail icon on the
          LEFT and the form body on the right, kept within the same
          bordered surface. On narrow viewports the icon column is hidden
          and the form expands to full width (see media query below). */}
      <section
        className="home-newsletter-row"
        aria-label={t('newsletter_section_aria') /* falls back to default text if missing */}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          marginTop: 28,
          border: '1px solid var(--rule-strong)',
          borderRadius: 12,
          background: 'var(--paper-2)',
          overflow: 'hidden',
        }}
      >
        <div
          className="home-newsletter-row__icon"
          aria-hidden="true"
          style={{
            flex: '0 0 220px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--paper)',
            color: 'var(--accent)',
            borderRight: '1px solid var(--rule)',
            padding: 24,
          }}
        >
          <Mail size={96} strokeWidth={1.25} aria-hidden="true" />
        </div>
        <div className="home-newsletter-row__signup" style={{ flex: '1 1 0', minWidth: 0, padding: '8px 4px' }}>
          <NewsletterSignup variant="bare" />
        </div>
      </section>

      {/* Upcoming votes — agenda ingestion is in progress, so this is an
          honest empty-state today. Appears above latest so it's the first
          actionable item when the data lands. */}
      <UpcomingAgenda sessions={upcomingSessions} mode="home" />

      {/* Latest votes */}
      <section style={{ paddingTop: 32 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="h-headline" style={{ margin: 0, fontSize: 26 }}>
            {t('latest_title')}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {t('latest_subtitle')} ·{' '}
            <Link href="/votes" style={{ color: 'var(--ink)' }}>
              {t('latest_see_all')}
            </Link>
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {latestVotes.map((v) => (
            <CompactVoteRow
              key={v.id}
              v={v}
              labels={{
                ayes: tVotes('ayes'),
                noes: tVotes('noes'),
                abstentions: tVotes('abstentions'),
                proposed_by: tVotes('proposed_by'),
                proposed_by_government: tVotes('proposed_by_government'),
                result: tVotes(`result.${v.result}` as 'result.approved'),
              }}
              locale={locale}
            />
          ))}
          {latestVotes.length === 0 && (
            <li style={{ padding: '24px 0', color: 'var(--ink-3)', fontSize: 13 }}>
              {tVotes('no_results')}
            </li>
          )}
        </ul>
      </section>

      {/* Responsive helper — collapse hero / coverage on narrow screens.
          Note: between 640px (sm) and 860px the desktop block is shown but
          re-styled by these rules; below 640px the entire `sm:block` wrapper
          is hidden and the mobile dashboard takes over. */}
      <style>{`
        @media (max-width: 860px) {
          .home-hero { grid-template-columns: 1fr !important; gap: 24px !important; padding-top: 24px !important; padding-bottom: 24px !important; }
          .home-coverage { grid-template-columns: repeat(2, 1fr) !important; }
          /* Newsletter row collapses: signup goes full-width and the
             decorative iconography is hidden to save vertical space on
             phones (the desktop block is hidden below 640px anyway, but
             between 640 and 860 we still trim the icon). */
          .home-newsletter-row__icon { display: none !important; }
        }
      `}</style>
      </div>
    </div>
  );
}

interface CompactVoteRowLabels {
  ayes: string;
  noes: string;
  abstentions: string;
  proposed_by: string;
  proposed_by_government: string;
  result: string;
}

function CompactVoteRow({
  v,
  labels,
  locale,
}: {
  v: Vote;
  labels: CompactVoteRowLabels;
  locale: string;
}) {
  const subject = v.description?.trim() || v.title;
  const total = v.ayes + v.noes + v.abstentions;
  const voteDate = new Date(v.voted_at);
  const isCurrentYear = voteDate.getFullYear() === new Date().getFullYear();
  // Short form for mobile (e.g. "19 nov"), long form for desktop.
  const shortDate = voteDate
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  const longDate = voteDate.toLocaleDateString(locale, { dateStyle: 'long' });
  const plainSummary = pickPlainSummary(v, locale);

  return (
    <li style={{ position: 'relative', borderTop: '1px solid var(--rule)' }}>
      <Link
        href={`/votes/${v.id}`}
        aria-label={subject}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          textDecoration: 'none',
        }}
      >
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {subject}
        </span>
      </Link>
      <div
        className="vote-row-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '90px minmax(0, 1fr) 220px 120px',
          gap: 24,
          padding: '26px 0',
          alignItems: 'start',
          position: 'relative',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <div className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
          {/* Mobile compresses the date cell into a single inline string:
              "XV · 19 nov". The "XV" prefix gives the legislatura context
              that used to live above the title (now removed on mobile);
              the date stays the same shortDate as before. Desktop keeps
              the longer date + expediente two-liner. */}
          <span className="sm:hidden whitespace-nowrap">XV · {shortDate}</span>
          <span className="hidden sm:inline">{longDate}</span>
          {v.expediente_raw && (
            <>
              <br />
              <span className="mono hidden sm:inline" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {v.expediente_raw}
              </span>
            </>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Type label above the title — desktop only. On mobile the
              title is the first thing the row shows, with all metadata
              (legislatura, date, proposer, result) compressed below.
              Hiding this row also removes the duplicated copy when the
              subject and title strings are identical. */}
          <div
            className="hidden sm:flex"
            style={{ gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{v.title}</span>
          </div>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            <SummaryHover
              summary={plainSummary}
              fallback={v.description ?? undefined}
              provider={v.plain_summary_provider}
              visibleText={subject}
            >
              {/* Inline glossary annotation for parliamentary jargon in
                  the vote subject (e.g. "Veto del Senado",
                  "Convalidación"). Falls through to plain text when no
                  term matches. */}
              <AnnotatedText text={subject} />
            </SummaryHover>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              alignItems: 'center',
              fontSize: 12,
              color: 'var(--ink-3)',
              flexWrap: 'wrap',
            }}
          >
            <span className="hidden sm:inline">{labels.proposed_by}</span>
            {v.proposed_by_government && !v.proposing_group_short ? (
              <span className="badge" style={{ fontWeight: 600 }}>
                <span className="gdot" style={{ background: 'var(--ink)' }} />
                {labels.proposed_by_government}
              </span>
            ) : v.proposing_group_short ? (
              <span style={{ pointerEvents: 'auto' }}>
                <GroupChip
                  slug={v.proposing_group_slug ?? undefined}
                  short={displayGroupShort(v.proposing_group_short)}
                  color={v.proposing_group_color}
                  size="xs"
                />
              </span>
            ) : null}
            {/* Mobile-only: colored result disc sits on the SAME baseline
                as the proposer chip. The previous version repeated the
                word ("aprovada"/"rebutjada") here AND showed a colored
                indicator — that double-encoding was redundant. The disc
                alone is enough; the label still reaches assistive tech
                via aria-label. Desktop keeps its own dedicated result
                cell on the right. */}
            <span className="sm:hidden inline-flex items-center gap-2">
              <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>·</span>
              <span
                role="img"
                aria-label={labels.result}
                title={labels.result}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  display: 'inline-block',
                  background:
                    v.result === 'tie' ? 'transparent' : resultColor(v.result),
                  border:
                    v.result === 'tie'
                      ? `2px solid ${resultColor(v.result)}`
                      : '0',
                  boxSizing: 'border-box',
                }}
              />
            </span>
          </div>
        </div>
        <div>
          <StackedBar d={{ aye: v.ayes, no: v.noes, abst: v.abstentions, nv: v.absent }} />
          <VoteBreakdown
            ayes={v.ayes}
            noes={v.noes}
            abstentions={v.abstentions}
            size="sm"
            labels={{ ayes: labels.ayes, noes: labels.noes, abstentions: labels.abstentions }}
          />
        </div>
        {/* Desktop-only column — on mobile the result lives inline with
            the proposer chip above. */}
        <div className="hidden sm:block" style={{ textAlign: 'right' }}>
          <ResultPill result={v.result} label={labels.result} />
          {total > 0 && (
            <div className="tabular" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
              {total}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Mobile dashboard (≤640px)
// ---------------------------------------------------------------------------
//
// Native-app-style entry point that replaces the editorial home on small
// screens. The desktop block above is untouched; this dashboard reuses the
// same upstream data (summary / latestVotes / upcomingSessions / highlights)
// and renders it as: brand strip → search → 2×2 tile grid → highlights →
// upcoming → 3 latest votes with a "see all" link.
//
// Symmetry note: the four tiles each lead to a route, not to a single
// destination amplified above the rest. No "featured" copy, no editorial
// selection beyond the existing reverse-chronological vote feed.

interface MobileDashboardLabels {
  brand: string;
  legislature: string;
  stats: string;
  tileVotes: string;
  tilePersons: string;
  tileTopics: string;
  tileStats: string;
  sectionHighlights: string;
  sectionUpcoming: string;
  sectionLatest: string;
  seeAll: string;
  highlightsSeeAll: string;
  noResults: string;
  voteResultApproved: string;
  voteResultRejected: string;
  voteResultTie: string;
}

function MobileDashboard({
  highlights,
  latestVotes,
  upcomingSessions,
  locale,
  labels,
}: {
  highlights: Highlight[];
  latestVotes: Vote[];
  upcomingSessions: ScheduledSession[];
  locale: string;
  labels: MobileDashboardLabels;
}) {
  // Cap the latest-votes list at 3 on mobile — the rest live behind the
  // "Veure totes →" link. Keeps the dashboard scannable on a phone.
  const latestThree = latestVotes.slice(0, 3);
  // Show only the next 2 upcoming sessions on the dashboard.
  const upcomingTwo = upcomingSessions.slice(0, 2);

  return (
    <div
      className="sm:hidden"
      style={{
        // `min-width: 0` defends against children with long single-word
        // strings (expediente codes, topic names) blowing out the viewport.
        minWidth: 0,
        overflowX: 'hidden',
        paddingTop: 12,
      }}
    >
      {/* Brand strip — name + one-line stats. No editorial copy. */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          paddingBottom: 14,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div
          className="eyebrow"
          style={{ fontSize: 10, color: 'var(--ink-3)', margin: 0 }}
        >
          {labels.brand}
        </div>
        <div
          className="tabular"
          style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}
        >
          {labels.legislature} · {labels.stats}
        </div>
      </header>

      {/* Search bar was removed from the mobile home in 2026-05-12 — it
          competed with the 2×2 tile grid for the same screen space and
          users reach the votes index via the "Votacions" tile anyway. The
          desktop home still surfaces a search via the topnav. */}

      {/* 2×2 tile grid. Uses minmax(0, 1fr) so long labels can't push the
          row beyond the viewport. Each tile is a ~120px-tall touch target
          (well above the 44×44 minimum). */}
      <nav
        aria-label={labels.brand}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 22,
        }}
      >
        <DashboardTile
          href="/votes"
          icon={<VoteIcon size={30} strokeWidth={1.75} aria-hidden="true" />}
          label={labels.tileVotes}
        />
        <DashboardTile
          href="/persons"
          icon={<Users size={30} strokeWidth={1.75} aria-hidden="true" />}
          label={labels.tilePersons}
        />
        <DashboardTile
          href={{ pathname: '/votes', query: { tab: 'topics' } }}
          icon={<Layers size={30} strokeWidth={1.75} aria-hidden="true" />}
          label={labels.tileTopics}
        />
        <DashboardTile
          href="/stats"
          icon={<BarChart3 size={30} strokeWidth={1.75} aria-hidden="true" />}
          label={labels.tileStats}
        />
      </nav>

      {/* Highlights carousel — same component as desktop. The component
          owns its own width via 100% layout, so we just wrap it in a
          tight section header here. */}
      <DashboardSection
        title={labels.sectionHighlights}
        seeAllHref="/stats"
        seeAllLabel={labels.highlightsSeeAll}
      >
        <HighlightsCarousel items={highlights} />
      </DashboardSection>

      {/* Upcoming sessions — hidden entirely when there are none, to keep
          the dashboard above-the-fold dense with real content. */}
      {upcomingTwo.length > 0 && (
        <DashboardSection title={labels.sectionUpcoming}>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: '1px solid var(--rule)',
              borderRadius: 12,
              background: 'var(--paper-2)',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {upcomingTwo.map((s, i) => (
              <li
                key={s.id}
                style={{
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--rule)',
                  fontSize: 13,
                  color: 'var(--ink-2)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  minWidth: 0,
                }}
              >
                <span
                  className="tabular"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    flex: '0 0 auto',
                  }}
                >
                  {new Date(s.date).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.items.length > 0
                    ? `${s.items.length} · ${s.items[0]?.subject ?? ''}`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {/* Latest 3 votes — minimal rows (date, subject, result colour).
          Tap target = full row; we keep each ≥ 56px. */}
      <DashboardSection
        title={labels.sectionLatest}
        seeAllHref="/votes"
        seeAllLabel={labels.seeAll}
      >
        {latestThree.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-3)',
              margin: 0,
              padding: '14px 0',
            }}
          >
            {labels.noResults}
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: '1px solid var(--rule)',
              borderRadius: 12,
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {latestThree.map((v, i) => (
              <MobileVoteRow
                key={v.id}
                v={v}
                locale={locale}
                isFirst={i === 0}
                resultLabel={
                  v.result === 'approved'
                    ? labels.voteResultApproved
                    : v.result === 'rejected'
                      ? labels.voteResultRejected
                      : labels.voteResultTie
                }
              />
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  );
}

function DashboardTile({
  href,
  icon,
  label,
}: {
  // `Link` accepts string or UrlObject; we type loose here because Next's
  // typed-routes infer them per-page. Both forms validate at the Link site.
  href: React.ComponentProps<typeof Link>['href'];
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mobile-dashboard-tile"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        minHeight: 110,
        padding: 16,
        borderRadius: 16,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper)',
        color: 'var(--ink)',
        textDecoration: 'none',
        boxShadow:
          '0 1px 0 rgba(15, 23, 42, .03), 0 6px 18px -14px rgba(15, 23, 42, .18)',
        minWidth: 0,
      }}
    >
      <span style={{ color: 'var(--ink)' }}>{icon}</span>
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '-0.005em',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {label}
      </span>
      <style>{`
        .mobile-dashboard-tile:active {
          background: var(--ink);
          color: var(--paper);
          border-color: var(--ink);
        }
        .mobile-dashboard-tile:active span { color: inherit; }
      `}</style>
    </Link>
  );
}

function DashboardSection({
  title,
  seeAllHref,
  seeAllLabel,
  children,
}: {
  title: string;
  seeAllHref?: React.ComponentProps<typeof Link>['href'];
  seeAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 10,
          minWidth: 0,
        }}
      >
        <h2
          className="eyebrow"
          style={{
            margin: 0,
            fontSize: 10,
            color: 'var(--ink-3)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h2>
        {seeAllHref && seeAllLabel && (
          <Link
            href={seeAllHref}
            style={{
              fontSize: 12,
              color: 'var(--ink-2)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flex: '0 0 auto',
            }}
          >
            {seeAllLabel} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function MobileVoteRow({
  v,
  locale,
  isFirst,
  resultLabel,
}: {
  v: Vote;
  locale: string;
  isFirst: boolean;
  resultLabel: string;
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
  const plainSummary = pickPlainSummary(v, locale);
  return (
    <li
      style={{
        borderTop: isFirst ? 'none' : '1px solid var(--rule)',
        background: 'var(--paper)',
        minWidth: 0,
      }}
    >
      <Link
        href={`/votes/${v.id}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          padding: '12px 14px',
          minHeight: 56,
          textDecoration: 'none',
          color: 'inherit',
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Mobile: title FIRST — no metadata above. Legislatura + date
              live on the inline meta line BELOW the title so the row
              reads "subject → context", not "context → subject". */}
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.35,
              color: 'var(--ink)',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {/* Plain-language summary affordance — same component used on
                the desktop home row. Touch-only on this mobile dashboard,
                so it surfaces as a small "i" button that toggles a native
                <details> panel; the trigger calls preventDefault on tap so
                the parent vote-row <Link> doesn't navigate when the user
                only wanted to read the summary. Falls through to plain
                text when no LLM summary exists for the vote. */}
            <SummaryHover
              summary={plainSummary}
              fallback={v.description ?? undefined}
              provider={v.plain_summary_provider}
              visibleText={subject}
            >
              {subject}
            </SummaryHover>
          </div>
          {/* Single meta line beneath the title — "XV · 19 nov" inline.
              Kept terse so a 2-line title still fits the 56px touch
              target. */}
          <div
            className="tabular"
            style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}
          >
            XV · {shortDate}
          </div>
        </div>
        {/* Result indicator — disc only, never the word. The redundant
            colored "aprovada"/"rebutjada" text that used to live here
            double-encoded the same fact as the indicator. The label is
            still announced via aria-label / title for assistive tech. */}
        <span
          role="img"
          aria-label={resultLabel}
          title={resultLabel}
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            display: 'inline-block',
            flex: '0 0 auto',
            background:
              v.result === 'tie' ? 'transparent' : resultColor(v.result),
            border:
              v.result === 'tie' ? `2px solid ${resultColor(v.result)}` : '0',
            boxSizing: 'border-box',
          }}
        />
      </Link>
    </li>
  );
}
