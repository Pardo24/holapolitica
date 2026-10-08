import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  ChevronRight,
  Code2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';

import { CompactVoteRow } from '@/components/CompactVoteRow';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PartyBand } from '@/components/PartyBand';
import { HomeQuickGrid } from '@/components/HomeQuickGrid';
import { ProfilePicker } from '@/components/ProfilePicker';
import { IntroNote } from '@/components/IntroNote';
import { WelcomeWizard } from '@/components/WelcomeWizard';
import { WhatsNew } from '@/components/WhatsNew';
import { LawsThatMatter } from '@/components/LawsThatMatter';
import { DailyTeaser } from '@/components/DailyTeaser';
import { ChamberMap } from '@/components/ChamberMap';
import { ResultPill } from '@/components/ResultPill';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { buildHighlights, type Highlight } from '@/lib/highlights';
import { summariseLaws } from '@/lib/sessionSummary';
import {
  api,
  type HemicycleLayout,
  type ParliamentaryGroupSummary,
  type ScheduledSession,
  type Topic,
  type TopicVoteStat,
  type Vote,
} from '@/lib/api';

// Quiet text link used in the hero action row.
const heroTextLink: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-2)',
  textDecoration: 'underline',
  textDecorationColor: 'var(--rule-strong)',
  textUnderlineOffset: 4,
};

// The situations most people are in, for the home's "what affects you":
// the rest are one tap away on /et-afecta, so the home doesn't fill up.
const HOME_PROFILES = ["assalariat", "jove", "pensionista", "llogater", "families", "autonom"] as const;

export default async function HomePage() {
  const t = await getTranslations('home');
  const tSite = await getTranslations('site');
  const tVotes = await getTranslations('votes');
  const tHub = await getTranslations('hub');
  const tNav = await getTranslations('nav');
  const tDaily = await getTranslations('daily');
  const tUpcoming = await getTranslations('upcoming');
  const locale = await getLocale();

  let summary: Awaited<ReturnType<typeof api.stats.summary>> | null = null;
  let latestVotes: Vote[] = [];
  let upcomingSessions: ScheduledSession[] = [];
  let allGroups: ParliamentaryGroupSummary[] = [];
  let allTopics: Topic[] = [];
  // The chamber map in the hero. Optional: if the layout fails to load the
  // card simply doesn't render, and the rest of the page is unaffected.
  let hemicycle: HemicycleLayout | null = null;
  // Highlights carousel — moved here from MobileStatsDashboard so it sits on
  // the home as a "what each group leans into" anchor below the agenda and
  // above the latest votes. Per-group topic stats, built into a flat,
  // symmetric (every group gets equal billing) Highlight list. Failures
  // degrade silently — the carousel renders its own empty card.
  let highlights: Highlight[] = [];
  // Latest plenary session outcome for the home "último pleno" card — the
  // full day's votes (not just the latest 5) so the aprovada/rebutjada split
  // is accurate. Degrades to no split on failure.
  let sessionVotes: Vote[] = [];

  // Every call starts as soon as what it depends on arrives: the group
  // stats when the group list is in, the day's votes when the latest votes
  // are. They used to wait for the whole first batch, three round trips to
  // the backend one after the other before the home could render.
  const groupsP = api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]);
  // Over-fetch then dedupe: a law voted several times in one pleno
  // (e.g. an RDL convalidation voted twice) produces multiple vote
  // rows sharing an expediente, which read as the same law twice on
  // the home list. Keep the most recent per expediente, trim to 5.
  const latestVotesP = api.votes.list({ page: 1, page_size: 12 }).then((p) => {
    const seen = new Set<string>();
    return p.items
      .filter((v) => {
        const key = v.expediente_raw ?? `vote-${v.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  });
  const highlightsP = groupsP.then(async (groups) => {
    if (groups.length === 0) return [] as Highlight[];
    const topicStatsPerGroup = await Promise.all(
      groups.map((g) =>
        api.groups
          .topicStats(g.slug)
          .then((rows) => [g.slug, rows] as const)
          .catch(() => [g.slug, [] as TopicVoteStat[]] as const),
      ),
    );
    return buildHighlights(groups, new Map(topicStatsPerGroup));
  });
  const sessionVotesP = latestVotesP
    .then((votes) => {
      const day = votes[0]?.voted_at?.slice(0, 10);
      if (!day) return [] as Vote[];
      return api.votes.list({ date_from: day, date_to: day, page_size: 100 }).then((p) => p.items);
    })
    .catch(() => [] as Vote[]);
  try {
    [summary, latestVotes, upcomingSessions, allGroups, allTopics, hemicycle, highlights, sessionVotes] =
      await Promise.all([
        api.stats.summary(),
        latestVotesP,
        api.agenda
          .sessions({ legislature_id: 1, upcoming_only: true })
          .catch(() => [] as ScheduledSession[]),
        groupsP,
        // Powers locale-aware topic names inside HighlightsCarousel.
        api.topics.list().catch(() => [] as Topic[]),
        api.legislatures.hemicycle(1).catch(() => null),
        highlightsP,
        sessionVotesP,
      ]);
  } catch {
    /* backend not ready — render with zeros */
  }
  // Approved / rejected are counted per INITIATIVE (its final vote), the
  // same way the pleno page counts: a bill's amendment votes are procedure,
  // and counting them made the card read "6 rechazadas" for laws that passed.
  // ``sessTotal`` stays the raw vote count (shown as "N votaciones en pleno").
  const sessOutcome = summariseLaws(sessionVotes);
  const sessApproved = sessOutcome.approved;
  const sessRejected = sessOutcome.rejected;
  const sessTotal = sessionVotes.length;

  // A session the Congress withdrew from its calendar is not an upcoming
  // session. Shown as one, it read "14 oct. —": a date with nothing on it.
  // When EVERY upcoming session was withdrawn (what a dissolution looks
  // like in the data) the home says so instead of going quiet.
  const withdrawnSessions = upcomingSessions.filter((s) => s.status === 'cancelled').length;
  upcomingSessions = upcomingSessions.filter((s) => s.status !== 'cancelled').slice(0, 4);

  // The reader's province, remembered by the deputies tab, so the home's
  // deputies tile can name it. Decoding can throw on a mangled cookie.
  const provCookie = (await cookies()).get('hp_prov')?.value;
  let province: string | null = null;
  try {
    province = provCookie ? decodeURIComponent(provCookie) : null;
  } catch {
    province = null;
  }
  // "I a tu, què t'afecta?": how many laws touch each situation.
  const profileCounts = await api.initiatives
    .profiles()
    .then((rows) => new Map(rows.map((r) => [r.key, r.count] as const)))
    .catch(() => null);
  const profilePicker = (
    <div id="et-afecta" style={{ scrollMarginTop: 72 }}>
      <ProfilePicker counts={profileCounts} featured={HOME_PROFILES} />
    </div>
  );

  const quickGrid = (
    <HomeQuickGrid province={province} nextSession={upcomingSessions[0]?.date?.slice(0, 10) ?? null} locale={locale} />
  );

  // Split the hero title so the second line can be tinted with the accent.
  const heroTitleLines = t('hero_title').split('\n');

  return (
    <div>
      {/* First-visit explanation. It used to be a three-slide overlay that
          covered the whole phone screen before any vote was visible; it is
          now a dismissible strip above the content, same storage flag, so
          the first thing a visitor sees is the chamber, not a barrier. */}
      <IntroNote />
      {/* First launch of the mobile app only: a short tour of the tabs. */}
      <WelcomeWizard />
      {/* For returning visitors: what changed since they last came. */}
      <WhatsNew />

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
        sessApproved={sessApproved}
        sessRejected={sessRejected}
        sessTotal={sessTotal}
        withdrawnSessions={withdrawnSessions}
        noPlenaryTitle={tUpcoming('none_convened_title')}
        noPlenaryBody={tUpcoming('none_convened_body', { n: withdrawnSessions })}
        plannedLabel={tUpcoming('planned_label')}
        quickGrid={quickGrid}
        profilePicker={profilePicker}
        lawsThatMatter={<LawsThatMatter topics={allTopics} locale={locale} />}
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
          lastUpdate: t('mobile_last_update'),
          sessionBannerEyebrow: t('mobile_session_banner_eyebrow'),
          sessionBannerCta: t('mobile_session_banner_cta'),
          tileJoc: tNav('jocs'),
          tileMap: tHub('map_title'),
          tileTopics: t('mobile_tile_topics'),
          sectionHighlights: t('mobile_section_highlights'),
          sectionUpcoming: t('mobile_section_upcoming'),
          sectionExplore: t('mobile_section_explore'),
          highlightsSeeAll: t('highlights_see_all'),
          sessionApproved: t('session_approved', { n: sessApproved }),
          sessionRejected: t('session_rejected', { n: sessRejected }),
          pleApproved: t('ple_approved', { n: sessApproved }),
          pleRejected: t('ple_rejected', { n: sessRejected }),
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
          paddingTop: 56,
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
            {/* The primary way in is the laws: what changes people's lives.
                Every vote (motions, procedures) is a secondary door from
                there, and from "see all" under the latest votes below. */}
            <Link href={'/lleis' as Route} className="btn-ink">
              {t('cta_explore')}
            </Link>
            <Link href={'/recorregut' as Route} style={heroTextLink}>
              {t('lifecycle_link')}
            </Link>
            {/* Press entry — surfaces the (otherwise footer-only) journalists
                page from the hero, a credibility signal for newsrooms. */}
            <Link href={'/journalists' as Route} style={heroTextLink}>
              {t('journalists_link')}
            </Link>
          </div>
          {/* Everything you can do here, one tap each: the game, the map,
              your deputies. Many visitors come for one of these and
              nothing else, so they sit on the cover, not further down. */}
          <div style={{ marginTop: 24 }}>{quickGrid}</div>
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
                      <span style={{ width: `${(sessApproved / (sessApproved + sessRejected || 1)) * 100}%`, background: 'var(--aye)' }} />
                    )}
                    {sessRejected > 0 && (
                      <span style={{ width: `${(sessRejected / (sessApproved + sessRejected || 1)) * 100}%`, background: 'var(--no)' }} />
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

          {/* The chamber itself, drawn from the real seat map. The fold
              had no image of any kind; this is the one picture of a
              parliament everyone recognises, and it is data, not
              decoration. */}
          {hemicycle && hemicycle.seats.length > 0 && (
            <ChamberMap
              layout={hemicycle}
              eyebrow={t('chamber_eyebrow')}
              caption={t('chamber_caption')}
              cta={t('chamber_cta')}
              ariaLabel={t('chamber_aria')}
            />
          )}
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
      <div style={{ marginTop: 36 }}>{profilePicker}</div>

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
      <div id="lleis-que-importen" style={{ marginTop: 40, marginBottom: 48, scrollMarginTop: 80 }}>
        <LawsThatMatter topics={allTopics} locale={locale} />
      </div>

      {(upcomingSessions.length > 0 || withdrawnSessions > 0) && (
        <UpcomingAgenda sessions={upcomingSessions} withdrawn={withdrawnSessions} />
      )}

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

      {/* What each group leans into — out of the hero (where it was a
          third card in one column) and into a band of its own. From the
          cover down the page now alternates plain paper and a tinted
          band, so it reads as sections instead of one white sheet:
          cover, facts, the parties in their own colours, the feed, and
          this. */}
      {highlights.length > 0 && (
        <section
          style={{
            marginInline: 'calc(50% - 50vw)',
            paddingInline: 'calc(50vw - 50%)',
            marginTop: 44,
            paddingBlock: 30,
            background: 'var(--hue-dades-soft)',
            borderTop: '1px solid var(--rule)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <HighlightsCarousel items={highlights} allTopics={allTopics} />
        </section>
      )}

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
  lastUpdate: string;
  sessionBannerEyebrow: string;
  sessionBannerCta: string;
  tileJoc: string;
  tileMap: string;
  tileTopics: string;
  sectionHighlights: string;
  sectionUpcoming: string;
  sectionExplore: string;
  highlightsSeeAll: string;
  sessionApproved: string;
  sessionRejected: string;
  pleApproved: string;
  pleRejected: string;
}

function MobileDashboard({
  highlights,
  allTopics,
  latestVotes,
  upcomingSessions,
  locale,
  sessApproved,
  sessRejected,
  sessTotal,
  withdrawnSessions,
  noPlenaryTitle,
  noPlenaryBody,
  plannedLabel,
  partyBand,
  quickGrid,
  profilePicker,
  lawsThatMatter,
  labels,
}: {
  highlights: Highlight[];
  allTopics: Topic[];
  latestVotes: Vote[];
  upcomingSessions: ScheduledSession[];
  locale: string;
  /** Pre-rendered <PartyBand>, shared with the desktop layout. */
  partyBand: React.ReactNode;
  /** Pre-rendered quick-access tiles, shared with the desktop. */
  quickGrid: React.ReactNode;
  /** Pre-rendered "what affects you" picker, shared with the desktop. */
  profilePicker: React.ReactNode;
  /** Pre-rendered "laws that matter" block, shared with the desktop. */
  lawsThatMatter: React.ReactNode;
  sessApproved: number;
  sessRejected: number;
  sessTotal: number;
  withdrawnSessions: number;
  noPlenaryTitle: string;
  noPlenaryBody: string;
  plannedLabel: string;
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
        paddingTop: 0,
      }}
    >
      {/* No header row: the motto lives under the name in the app bar, and
          how fresh the data is sits on the latest-plenary card. The first
          screen is the six tiles. */}


      {/* The home is now CONTENT, not a menu. The four primary
          destinations moved to the persistent bottom tab bar
          (components/BottomTabBar.tsx), so the old 2×2 tile grid and the
          chip "junk drawer" are gone. What remains reads top-to-bottom
          as: what the chamber just did → the specific latest votes → a
          look at the parties → per-group leanings → a quiet "explore"
          row for the secondary surfaces. Nothing here duplicates the
          bottom bar. */}

      {/* First: what you can do here. Many open the app for one thing
          (the game, the map, their deputies); it is one tap away, before
          the news. */}
      {/* The first screen, exactly: the six tiles and the latest plenary
          fill the space between the bars, and nothing else peeks in. */}
      <div className="home-first">
      <div className="home-first__grid">{quickGrid}</div>

      {/* The latest plenary, compact: it shares the first screen with the
          tiles, so it is one dark strip (when, how it went, how fresh)
          that opens the day's votes. */}
      {latestVotes[0]?.voted_at && (
        <Link href={`/avui/${latestVotes[0].voted_at.slice(0, 10)}` as Route} className="home-ple">
          <span className="home-ple__top">
            <span className="home-ple__eyebrow">{labels.sessionBannerEyebrow}</span>
            <FreshnessButton isoDate={latestVotes[0].voted_at} locale={locale} label={labels.lastUpdate} />
          </span>
          <span className="home-ple__row">
            <span className="home-ple__date serif">
              {new Date(latestVotes[0].voted_at).toLocaleDateString(locale, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
            {sessTotal > 0 && (
                <span
                  className="home-ple__bar"
                  role="img"
                  aria-label={`${labels.sessionApproved}, ${labels.sessionRejected}`}
                >
                  {sessApproved > 0 && <span style={{ flexGrow: sessApproved, background: 'var(--aye)' }} />}
                  {sessRejected > 0 && <span style={{ flexGrow: sessRejected, background: 'var(--no)' }} />}
                </span>
            )}
            <ChevronRight size={18} aria-hidden="true" style={{ flex: 'none', opacity: 0.8 }} />
          </span>
          {sessTotal > 0 && (
            <span className="home-ple__counts tabular">
              <b style={{ color: 'var(--aye)' }}>{labels.pleApproved}</b>
              <span aria-hidden="true">·</span>
              <b style={{ color: 'var(--no)' }}>{labels.pleRejected}</b>
            </span>
          )}
        </Link>
      )}
      </div>

      {/* "I a tu, què t'afecta?": pick your situation. */}
      <div style={{ margin: '22px 0 26px' }}>{profilePicker}</div>

      {/* Where to start when you don't know what to look for: everyday
          subjects, and what a law changes. */}
      <div id="lleis-que-importen" style={{ marginTop: 22, marginBottom: 34, scrollMarginTop: 72 }}>
        {lawsThatMatter}
      </div>

      {/* No chamber map here. It reads as an illustration on a phone, where
          350 seats collapse to a smudge of colour and it pushes the day's
          votes down; it stays on the wide layout, where the seats are
          legible. That also stops the page shipping the SVG twice. */}


      {/* No plenary convened: every planned session was withdrawn. */}
      {upcomingTwo.length === 0 && withdrawnSessions > 0 && (
        <DashboardSection title={labels.sectionUpcoming}>
          <div className="no-plenary">
            <strong>{noPlenaryTitle}</strong>
            <p>{noPlenaryBody}</p>
          </div>
        </DashboardSection>
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
                  {s.items.length > 0 ? `${s.items.length} · ${s.items[0]?.subject ?? ''}` : plannedLabel}
                </span>
              </li>
            ))}
          </ul>
        </DashboardSection>
      )}

      {/* A look at the parties — the single home entry to the group
          pages now (the deputies tile and the "search deputy" chip are
          gone, so this no longer competes with them). The band leads
          into the Partits tab for the full roster. The id is the scroll
          target of the "start here" cue above; scroll-margin keeps a
          little air above it when jumped to. */}
      <div id="mobile-parties" style={{ scrollMarginTop: 12 }}>
        {partyBand}
      </div>

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


function FreshnessButton({
  isoDate,
  locale,
  label,
}: {
  isoDate: string;
  locale: string;
  label: string;
}) {
  // How long ago the latest vote was, on the dark latest-plenary card: a
  // pulsing dot (the data is alive) and "fa 8 dies". Not clickable; the
  // card around it is the link. Hours under a day; never finer, the data
  // only refreshes every few hours.
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const rel = hours < 24 ? rtf.format(-Math.max(1, hours), 'hour') : rtf.format(-Math.floor(hours / 24), 'day');
  const formatted = new Date(isoDate).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return (
    <span
      aria-label={`${label} ${formatted}, ${rel}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--paper-2)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: '#22C55E',
          animation: 'hp-pulse 2.2s ease-out infinite',
          flex: 'none',
          display: 'inline-block',
        }}
      />
      {rel}
      <style>{`
        @keyframes hp-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(34, 197, 94, .55); }
          70%  { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0   rgba(34, 197, 94, 0); }
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

