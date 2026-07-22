import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Code2,
  Gamepad2,
  Layers,
  LockKeyhole,
  Map as MapIcon,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { CompactVoteRow } from '@/components/CompactVoteRow';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PartyBand } from '@/components/PartyBand';
import { OnboardingModal } from '@/components/OnboardingModal';
import { DailyTeaser } from '@/components/DailyTeaser';
import { DailyNotification } from '@/components/DailyNotification';
import { ResultPill } from '@/components/ResultPill';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { buildHighlights, type Highlight } from '@/lib/highlights';
import {
  api,
  type ParliamentaryGroupSummary,
  type ScheduledSession,
  type Topic,
  type TopicVoteStat,
  type Vote,
} from '@/lib/api';

// Outlined secondary button + quiet text link used in the hero action row.
const heroOutlineBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '9px 16px',
  borderRadius: 999,
  border: '1px solid var(--rule-strong)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
};
const heroTextLink: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-2)',
  textDecoration: 'underline',
  textDecorationColor: 'var(--rule-strong)',
  textUnderlineOffset: 4,
};

export default async function HomePage() {
  const t = await getTranslations('home');
  const tSite = await getTranslations('site');
  const tVotes = await getTranslations('votes');
  const tHub = await getTranslations('hub');
  const tNav = await getTranslations('nav');
  const tDaily = await getTranslations('daily');
  const locale = await getLocale();

  let summary: Awaited<ReturnType<typeof api.stats.summary>> | null = null;
  let latestVotes: Vote[] = [];
  let upcomingSessions: ScheduledSession[] = [];
  let allGroups: ParliamentaryGroupSummary[] = [];
  let allTopics: Topic[] = [];
  try {
    [summary, latestVotes, upcomingSessions, allGroups, allTopics] = await Promise.all([
      api.stats.summary(),
      // Over-fetch then dedupe: a law voted several times in one pleno
      // (e.g. an RDL convalidation voted twice) produces multiple vote
      // rows sharing an expediente, which read as the same law twice on
      // the home list. Keep the most recent per expediente, trim to 5.
      api.votes
        .list({ page: 1, page_size: 12 })
        .then((p) => {
          const seen = new Set<string>();
          return p.items
            .filter((v) => {
              const key = v.expediente_raw ?? `vote-${v.id}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, 5);
        }),
      api.agenda
        .sessions({ legislature_id: 1, upcoming_only: true })
        .then((rows) => rows.slice(0, 4))
        .catch(() => [] as ScheduledSession[]),
      api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
      // Powers locale-aware topic names inside HighlightsCarousel.
      api.topics.list().catch(() => [] as Topic[]),
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

  // Latest plenary session outcome for the home "último pleno" card — the
  // full day's votes (not just the latest 5) so the aprovada/rebutjada split
  // is accurate. One extra cached call; degrades to no split on failure.
  const latestSessionDate = latestVotes[0]?.voted_at?.slice(0, 10) ?? null;
  const sessionVotes = latestSessionDate
    ? await api.votes
        .list({ date_from: latestSessionDate, date_to: latestSessionDate, page_size: 100 })
        .then((p) => p.items)
        .catch(() => [] as Vote[])
    : [];
  const sessApproved = sessionVotes.filter((v) => v.result === 'approved').length;
  const sessRejected = sessionVotes.filter((v) => v.result === 'rejected').length;
  const sessTotal = sessionVotes.length;

  // Split the hero title so the second line can be tinted with the accent.
  const heroTitleLines = t('hero_title').split('\n');

  return (
    <div>
      {/* First-visit onboarding overlay — auto-opens once per
          device (localStorage flag, see OnboardingModal); skipped
          on every subsequent visit. */}
      <OnboardingModal />

      {/* Mobile: a floating, dismissible daily-question notification (overlays,
          no layout shift). The desktop daily card now sits BELOW the hero, so
          the serious value proposition — not a game — is the first thing a
          first-time visitor or a journalist sees. */}
      <div className="sm:hidden">
        <DailyNotification
          labels={{
            eyebrow: tDaily('eyebrow'),
            invite: tDaily('teaser_invite'),
            dismiss: tDaily('dismiss'),
          }}
        />
      </div>

      {/* Mobile-only dashboard (≤640px). Replaces the editorial home with a
          native-app-style entry point: brand strip, search, 2×2 tile grid,
          and three compact content sections that reuse the same fetched
          data as the desktop layout below. */}
      <MobileDashboard
        highlights={highlights}
        allTopics={allTopics}
        latestVotes={latestVotes}
        upcomingSessions={upcomingSessions}
        locale={locale}
        partyBand={
          <PartyBand
            groups={allGroups}
            title={t('parties_title')}
            caption={t('parties_caption')}
            seatsLabel={(n) => t('parties_seats', { n })}
            seeAllLabel={t('parties_see_all')}
          />
        }
        labels={{
          brand: t('mobile_brand'),
          motto: tSite('motto'),
          legislature: t('mobile_legislature'),
          stats: t('mobile_stats_short', {
            votes: (summary?.votes_total ?? 0).toLocaleString(locale),
            deputies: 350,
          }),
          lastUpdate: t('mobile_last_update'),
          sessionBannerEyebrow: t('mobile_session_banner_eyebrow'),
          sessionBannerCta: t('mobile_session_banner_cta'),
          tileJoc: tNav('jocs'),
          tileMap: tHub('map_title'),
          tileTopics: t('mobile_tile_topics'),
          tileStats: t('mobile_tile_stats'),
          sectionHighlights: t('mobile_section_highlights'),
          sectionUpcoming: t('mobile_section_upcoming'),
          sectionExplore: t('mobile_section_explore'),
          highlightsSeeAll: t('highlights_see_all'),
        }}
      />

      {/* Desktop / tablet (≥640px) — original editorial home, unchanged. */}
      <div className="hidden sm:block">
      {/* Hero — editorial, civic */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 44,
          // Full-bleed tinted band: negative inline margins stretch the
          // section to the viewport edges (the .page container is
          // centred), and the matching inline padding puts the content
          // back exactly where it was. The negative top margin swallows
          // .page's top padding so the wash meets the topnav.
          marginInline: 'calc(50% - 50vw)',
          paddingInline: 'calc(50vw - 50%)',
          marginTop: -32,
          paddingTop: 72,
          paddingBottom: 36,
          // A very soft accent wash, fading back to paper at the fold —
          // the vertical breathing room reads as a designed cover, not
          // leftover white.
          background:
            'linear-gradient(180deg, var(--paper) 0%, color-mix(in oklch, var(--accent) 6%, var(--paper)) 45%, color-mix(in oklch, var(--accent) 4%, var(--paper)) 72%, var(--paper) 100%)',
          borderBottom: '1px solid var(--rule)',
          alignItems: 'center',
          // The cover owns the first viewport: hero + meta strip fill
          // the screen on open, and "Últimas leyes" only appears when
          // you scroll. Cleared under 860px (media query below) where
          // the columns stack and a forced height would leave a crater.
          minHeight: 'calc(100svh - 205px)',
        }}
        className="home-hero"
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="eyebrow" style={{ marginBottom: 18, color: 'var(--accent)' }}>
            {t('eyebrow')}
          </div>
          <h1 className="h-display" style={{ margin: '0 0 20px' }}>
            {heroTitleLines[0]}
            {heroTitleLines.length > 1 && (
              <>
                <br />
                <span style={{ color: 'var(--accent)' }}>{heroTitleLines.slice(1).join(' ')}</span>
              </>
            )}
          </h1>
          {/* Hero subtitle — desktop only. On ≤640px the eyebrow + display
              headline are already the highest-density framing the page
              needs; the prose under-claims start to feel like wall-of-text
              on a phone. Page-level CTAs sit just below, so users still
              know what to do. */}
          <p
            className="hidden sm:block"
            style={{
              fontSize: 18,
              color: 'var(--ink-2)',
              maxWidth: 560,
              margin: '0 0 30px',
              lineHeight: 1.7,
            }}
          >
            {t('hero_subtitle')}
          </p>
          {/* Actions: the four current-affairs entries. The laws carry
              full button weight; the chamber's week (Plens), the parties
              and the deputies follow as outlined siblings — each one
              tinted with its surface hue so the row reads as four
              territories, not four identical pills.

              The game used to sit here as a peer of the parliamentary
              record. It has moved down to the quiet link row: still
              available, no longer presented as one of the reasons to
              use the site. */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 14,
            }}
          >
            <Link href="/votes" className="btn-ink">
              {t('cta_explore')}
            </Link>
            <Link
              href={'/avui' as Route}
              style={{ ...heroOutlineBtn, borderColor: 'var(--hue-plens)' }}
            >
              <CalendarDays
                size={15}
                strokeWidth={1.9}
                aria-hidden="true"
                style={{ color: 'var(--hue-plens)' }}
              />
              {t('cta_plenary')}
            </Link>
            <Link
              href={'/el-teu-diputat' as Route}
              style={{ ...heroOutlineBtn, borderColor: 'var(--hue-partits)' }}
            >
              <Users
                size={15}
                strokeWidth={1.9}
                aria-hidden="true"
                style={{ color: 'var(--hue-partits)' }}
              />
              {t('cta_deputies')}
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 22, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href={'/recorregut' as Route} style={heroTextLink}>
              {t('lifecycle_link')}
            </Link>
            <Link
              href={'/jocs' as Route}
              style={{ ...heroTextLink, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Gamepad2 size={14} strokeWidth={1.9} aria-hidden="true" />
              {t('cta_play')}
            </Link>
            {/* Press entry — surfaces the (otherwise footer-only) journalists
                page from the hero, a credibility signal for newsrooms. */}
            <Link href={'/journalists' as Route} style={heroTextLink}>
              {t('journalists_link')}
            </Link>
          </div>
          {/* Trust signals — three icon chips pinned to the bottom of the
              column. The licence chip ("EUPL-1.2 / CC-BY 4.0") is gone
              from the fold: cryptic to a first-time visitor, and the
              licences already live in the footer. */}
          <div
            style={{
              display: 'flex',
              gap: '10px 26px',
              marginTop: 28,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {[
              { Icon: ShieldCheck, label: t('trust_no_trackers') },
              { Icon: Code2, label: t('trust_api') },
              { Icon: LockKeyhole, label: t('trust_gdpr') },
            ].map(({ Icon, label }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--ink-2)',
                }}
              >
                <Icon
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ color: 'var(--accent)', flex: 'none' }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div
          // Right column: the latest-pleno card on TOP (the primary,
          // freshest content) with the per-group highlights carousel
          // beneath it — stacked from the top with a moderate gap.
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            minWidth: 0,
          }}
          className="home-hero__right"
        >
          {latestVotes[0]?.voted_at && (
            <Link href={'/avui' as Route} className="hero-pleno-card">
              <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 8 }}>
                {t('latest_session_eyebrow')}
              </div>
              <div
                className="serif"
                style={{
                  fontSize: 'clamp(22px, 2.4vw, 30px)',
                  fontWeight: 600,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                }}
              >
                {new Date(latestVotes[0].voted_at).toLocaleDateString(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </div>
              {sessTotal > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div
                    role="img"
                    aria-label={`${t('session_approved', { n: sessApproved })}, ${t('session_rejected', { n: sessRejected })}`}
                    style={{
                      display: 'flex',
                      height: 7,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'var(--paper-3)',
                    }}
                  >
                    {sessApproved > 0 && (
                      <span style={{ width: `${(sessApproved / sessTotal) * 100}%`, background: 'var(--aye)' }} />
                    )}
                    {sessRejected > 0 && (
                      <span style={{ width: `${(sessRejected / sessTotal) * 100}%`, background: 'var(--no)' }} />
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginTop: 8,
                      fontSize: 12.5,
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                    }}
                  >
                    <span className="tabular" style={{ color: 'var(--aye)', fontWeight: 600 }}>
                      {t('session_approved', { n: sessApproved })}
                    </span>
                    <span className="tabular" style={{ color: 'var(--no)', fontWeight: 600 }}>
                      {t('session_rejected', { n: sessRejected })}
                    </span>
                    <span className="tabular" style={{ color: 'var(--ink-3)' }}>
                      · {sessTotal} {t('week_subtitle')}
                    </span>
                  </div>
                </div>
              )}
              <span className="hero-pleno-cta">
                {t('latest_session_explore')}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          )}

          {/* HighlightsCarousel — rotating per-group "top-supported / top-
              rejected topic" cards. Symmetric: every group is shown in turn.
              The component handles its own empty state internally. */}
          <HighlightsCarousel items={highlights} allTopics={allTopics} />
        </div>
        <style>{`
          .hero-pleno-card {
            display: flex;
            flex-direction: column;
            padding: 22px 24px;
            border: 1px solid var(--rule-strong);
            border-top: 3px solid var(--accent);
            border-radius: 16px;
            background: var(--paper-2);
            color: inherit;
            text-decoration: none;
            box-shadow: 0 1px 0 rgba(15,23,42,.03), 0 8px 24px -16px rgba(15,23,42,.12);
            transition: border-color 0.12s ease;
          }
          .hero-pleno-card:hover, .hero-pleno-card:focus-visible { border-color: var(--ink); outline: none; }
          .hero-pleno-cta {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 16px;
            padding: 9px 16px;
            border-radius: 999px;
            background: var(--ink);
            color: var(--paper);
            font-size: 14px;
            font-weight: 600;
            align-self: flex-start;
          }
        `}</style>
      </section>

      {/* Meta strip — one quiet line of coverage facts (the "how much
          data is behind this" credibility signal) with the daily
          question as a compact pill on the right. Replaces the previous
          two-card glance band + separate coverage row: the latest pleno
          now lives in the hero, and the daily game no longer competes
          with it at the same visual weight. */}
      <section
        className="home-meta-strip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 12.5,
          color: 'var(--ink-3)',
          padding: '14px 0',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        {/* Two plain-language facts only. The "94% iniciativas
            clasificadas" figure moved out of the fold: without context
            it reads as unexplained jargon; /stats carries it with the
            explanation next to it. */}
        <span>
          <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>350</span>{' '}
          {t('coverage_active_deputies').toLowerCase()}
        </span>
        <span style={{ color: 'var(--rule)' }}>·</span>
        <span>
          <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {summary ? summary.votes_total.toLocaleString(locale) : '—'}
          </span>{' '}
          {t('coverage_votes_ingested').toLowerCase()}{' '}
          <span style={{ color: 'var(--ink-3)' }}>· {t('coverage_since')}</span>
        </span>
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
          {t('coverage_see_all')} <ArrowRight size={13} aria-hidden="true" />
        </Link>
        <span style={{ marginLeft: 'auto' }}>
          <DailyTeaser
            labels={{
              eyebrow: tDaily('eyebrow'),
              invite: tDaily('teaser_invite'),
              answered_today_short: tDaily('answered_today_short'),
              streak: tDaily.raw('streak'),
            }}
          />
        </span>
      </section>

      {/* The parties — the first thing you meet after the cover. Placed
          this high on purpose: the per-group pages hold the deepest
          analysis on the site (voting record, cohesion, manifesto vs.
          votes) and were getting almost no traffic because nothing on
          the home page pointed at them. It also carries the page's
          strongest colour, and it is colour we don't have to invent:
          the parties' own brand hues. */}
      <PartyBand
        groups={allGroups}
        title={t('parties_title')}
        caption={t('parties_caption')}
        seatsLabel={(n) => t('parties_seats', { n })}
        seeAllLabel={t('parties_see_all')}
      />

      {/* Upcoming votes — agenda ingestion is in progress, so this is an
          shown only when there's something scheduled, so an empty agenda
          doesn't add a blank section to the home. */}
      {upcomingSessions.length > 0 && <UpcomingAgenda sessions={upcomingSessions} mode="home" />}

      {/* Latest votes — below the fold by design (the hero owns the
          first viewport); a wide top margin + its own hairline mark the
          clear break between the cover and the feed. */}
      <section style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
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

      {/* Newsletter — at the very END of the page, quiet: a hairline-
          topped section with title, one-line caption and the form. No
          card, no giant icon; someone who scrolled the whole page is
          the person the invitation is for. */}
      <section
        aria-label={t('newsletter_title')}
        style={{
          marginTop: 40,
          paddingTop: 24,
          paddingBottom: 8,
          borderTop: '1px solid var(--rule)',
          maxWidth: 560,
        }}
      >
        <h2
          className="serif"
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
            lineHeight: 1.2,
          }}
        >
          {t('newsletter_title')}
        </h2>
        <p
          style={{
            margin: '6px 0 14px',
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {t('newsletter_caption')}
        </p>
        <NewsletterSignup variant="bare" />
      </section>

      {/* Responsive helper — collapse hero / coverage on narrow screens.
          Note: between 640px (sm) and 860px the desktop block is shown but
          re-styled by these rules; below 640px the entire `sm:block` wrapper
          is hidden and the mobile dashboard takes over. */}
      <style>{`
        @media (max-width: 860px) {
          .home-hero { grid-template-columns: 1fr !important; gap: 24px !important; margin-top: -18px !important; padding-top: 40px !important; padding-bottom: 24px !important; min-height: 0 !important; }
          /* Surfaces row stacks under 860 so each card keeps a
             comfortable internal layout; on a narrow tablet two
             cards side-by-side were cramming the body copy. */
          .home-surfaces { grid-template-columns: 1fr !important; }
        }
      `}</style>
      </div>
    </div>
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
  motto: string;
  legislature: string;
  stats: string;
  lastUpdate: string;
  sessionBannerEyebrow: string;
  sessionBannerCta: string;
  tileJoc: string;
  tileMap: string;
  tileTopics: string;
  tileStats: string;
  sectionHighlights: string;
  sectionUpcoming: string;
  sectionExplore: string;
  highlightsSeeAll: string;
}

function MobileDashboard({
  highlights,
  allTopics,
  latestVotes,
  upcomingSessions,
  locale,
  partyBand,
  labels,
}: {
  highlights: Highlight[];
  allTopics: Topic[];
  latestVotes: Vote[];
  upcomingSessions: ScheduledSession[];
  locale: string;
  /** Pre-rendered <PartyBand>, shared with the desktop layout. */
  partyBand: React.ReactNode;
  labels: MobileDashboardLabels;
}) {
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
      {/* Brand header — logo mark + wordmark + motto, then a meta
          line with the legislature counters, then a green pill that
          reports the most recent vote's recency. Everything sits
          INSIDE a single header so the page identity is one visual
          block; the dashboard tiles below start the navigation. */}
      <header
        style={{
          paddingBottom: 16,
          marginBottom: 4,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <span
            aria-hidden="true"
            className="mobile-home-mark"
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.015em',
                lineHeight: 1.05,
                color: 'var(--ink)',
              }}
            >
              {labels.brand}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'var(--ink-3)',
                marginTop: 3,
                lineHeight: 1.2,
              }}
            >
              {labels.motto}
            </div>
          </div>
        </div>

        <div
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.4,
            marginBottom: latestVotes[0]?.voted_at ? 10 : 0,
          }}
        >
          {labels.legislature} · {labels.stats}
        </div>

        {latestVotes[0]?.voted_at && (
          <FreshnessButton
            isoDate={latestVotes[0].voted_at}
            locale={locale}
            label={labels.lastUpdate}
          />
        )}
      </header>

      <style>{`
        /* Bigger sibling of .topnav .brand-mark — same ballot/lines
           glyph, scaled for the mobile home identity block. Lives
           here (not globals.css) because it's bound to this single
           surface; a future redesign should be free to rip it out. */
        .mobile-home-mark {
          width: 30px;
          height: 30px;
          flex: none;
          align-self: center;
          border: 1.75px solid var(--ink);
          position: relative;
          border-radius: 4px;
        }
        .mobile-home-mark::before,
        .mobile-home-mark::after {
          content: "";
          position: absolute;
          left: 4px;
          right: 4px;
          border-top: 1.5px solid var(--ink);
        }
        .mobile-home-mark::before { top: 9px; }
        .mobile-home-mark::after  { top: 17px; }
      `}</style>

      {/* The home is now CONTENT, not a menu. The four primary
          destinations moved to the persistent bottom tab bar
          (components/BottomTabBar.tsx), so the old 2×2 tile grid and the
          chip "junk drawer" are gone. What remains reads top-to-bottom
          as: what the chamber just did → the specific latest votes → a
          look at the parties → per-group leanings → a quiet "explore"
          row for the secondary surfaces. Nothing here duplicates the
          bottom bar. */}

      {/* Lead: the latest plenary session, as a full card. This is the
          one thing a returning visitor wants first — what happened. */}
      {latestVotes[0]?.voted_at && (
        <Link
          href={`/avui/${latestVotes[0].voted_at.slice(0, 10)}` as Route}
          style={{
            display: 'block',
            padding: '16px 18px',
            border: '1px solid var(--ink)',
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 16,
            textDecoration: 'none',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--paper-2)',
              marginBottom: 5,
            }}
          >
            {labels.sessionBannerEyebrow}
          </div>
          <div
            className="serif"
            style={{
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.2,
              letterSpacing: '-0.015em',
            }}
          >
            {new Date(latestVotes[0].voted_at).toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--paper-2)',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {labels.sessionBannerCta} →
          </div>
        </Link>
      )}

      {/* Upcoming sessions — only when something is scheduled. */}
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
                  {new Date(s.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.items.length > 0 ? `${s.items.length} · ${s.items[0]?.subject ?? ''}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {/* A look at the parties — the single home entry to the group
          pages now (the deputies tile and the "search deputy" chip are
          gone, so this no longer competes with them). The band leads
          into the Partits tab for the full roster. */}
      {partyBand}

      {/* The landing's navigation proposals — where to go next: the
          map, the games, the topics, the data. Four equal tiles, each
          with its own muted hue. Deliberately AFTER the content (pleno +
          parties): the home leads with what happened, then offers the
          onward journeys. All layout-critical styles are inline — same
          hardening as the party cards, so no stylesheet mishap can
          break the grid. */}
      <DashboardSection title={labels.sectionExplore}>
        <nav
          aria-label={labels.sectionExplore}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <NavTile
            href={'/mapa' as Route}
            icon={<MapIcon size={24} strokeWidth={1.75} aria-hidden="true" />}
            label={labels.tileMap}
            fg="#475189"
          />
          <NavTile
            href={'/jocs' as Route}
            icon={<Gamepad2 size={24} strokeWidth={1.75} aria-hidden="true" />}
            label={labels.tileJoc}
            fg="#6E4F8E"
          />
          <NavTile
            href="/topics"
            icon={<Layers size={24} strokeWidth={1.75} aria-hidden="true" />}
            label={labels.tileTopics}
            fg="#2F807A"
          />
          <NavTile
            href="/stats"
            icon={<BarChart3 size={24} strokeWidth={1.75} aria-hidden="true" />}
            label={labels.tileStats}
            fg="#9A6628"
          />
        </nav>
      </DashboardSection>

      {/* Per-group topic leanings — discovery, → Dades. */}
      <DashboardSection
        title={labels.sectionHighlights}
        seeAllHref="/stats"
        seeAllLabel={labels.highlightsSeeAll}
      >
        <HighlightsCarousel items={highlights} allTopics={allTopics} />
      </DashboardSection>

    </div>
  );
}


function NavTile({
  href,
  icon,
  label,
  fg,
}: {
  href: React.ComponentProps<typeof Link>['href'];
  icon: React.ReactNode;
  label: string;
  /** The tile's muted hue — drives the icon disc tint. */
  fg: string;
}) {
  // Landing navigation tile. Everything load-bearing is inline (the
  // party-card lesson): equal size, layout and tint survive any
  // stylesheet loss.
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        minHeight: 104,
        minWidth: 0,
        padding: 14,
        borderRadius: 14,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper)',
        color: 'var(--ink)',
        textDecoration: 'none',
        boxShadow: 'var(--shadow-2)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 42,
          height: 42,
          borderRadius: 12,
          flex: 'none',
          background: `color-mix(in oklch, ${fg} 13%, var(--paper))`,
          color: fg,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          letterSpacing: '-0.005em',
          lineHeight: 1.2,
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </span>
    </Link>
  );
}

function FreshnessButton({
  isoDate,
  locale,
  label,
}: {
  isoDate: string;
  locale: string;
  label: string;
}) {
  // Server-rendered green pill that reports the most recent vote's
  // recency. Visually a button (rounded, filled with a soft green
  // tint, ink-coloured text) but not actually clickable — it's an
  // ambient "the pipeline is alive" signal. The pulsing dot is a
  // tiny 7px element with a CSS keyframes; no client JS.
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const days = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
  const hours = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60)));
  const formatted = new Date(isoDate).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
  // Pick the most informative unit. "<1h" hides exact minutes (the
  // data only refreshes every few hours so finer granularity would be
  // false precision).
  const rel = hours < 1 ? '<1h' : hours < 24 ? `${hours}h` : `${days}d`;
  return (
    <span
      role="status"
      aria-label={`${label} ${formatted}, ${rel}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px 7px 10px',
        borderRadius: 999,
        background: 'color-mix(in oklch, #16A34A 14%, var(--paper))',
        border: '1px solid color-mix(in oklch, #16A34A 32%, var(--paper))',
        color: 'var(--ink)',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: '#16A34A',
          boxShadow: '0 0 0 0 rgba(22, 163, 74, .55)',
          animation: 'hp-pulse 2.2s ease-out infinite',
          flex: 'none',
          display: 'inline-block',
        }}
      />
      <span>
        {label}{' '}
        <span className="tabular" style={{ color: 'var(--ink-2)' }}>
          · {formatted}
        </span>{' '}
        <span style={{ color: 'var(--ink-3)' }}>({rel})</span>
      </span>
      <style>{`
        @keyframes hp-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(22, 163, 74, .50); }
          70%  { box-shadow: 0 0 0 8px rgba(22, 163, 74, 0); }
          100% { box-shadow: 0 0 0 0   rgba(22, 163, 74, 0); }
        }
      `}</style>
    </span>
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

