import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { CoincidenceMatrix } from '@/components/CoincidenceMatrix';
import { GroupSummaryCarousel } from '@/components/GroupSummaryCarousel';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { TopicChipsStrip } from '@/components/TopicChipsStrip';
import {
  api,
  type CoincidenceCell,
  type GroupSummaryRow,
  type ParliamentaryGroupSummary,
  type ScheduledSession,
  type StatsSummary,
  type Topic,
  type TopicGlobalStat,
  type Vote,
} from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';

/**
 * "Diari" — a newspaper-style daily front page composed automatically
 * from the live database. Conceived as both a citizen-facing landing
 * (something shareable on Bluesky / WhatsApp) and a visual showcase of
 * the widget library — every section reuses an existing primitive,
 * nothing here is bespoke editorial layout.
 *
 * Neutrality discipline (CLAUDE.md):
 *   - Lead vote is "latest" (objective). NOT "most-debated" or
 *     "widest-margin" — those quietly editorialise.
 *   - Every comparative widget (group summary, coincidence) shows the
 *     full set, never a curated subset.
 *   - Section captions describe what the reader is about to see; no
 *     adjectives, no judgement words.
 *
 * Cache: 30 min ISR. Plenary publishes votes 24-48h delayed and our
 * ingest runs every 4h; sub-30 min revalidation is wasted work, longer
 * than 1 h starts to lie. The 30 min window slots cleanly between the
 * Vercel edge (5 min) and the backend Redis layer (1 h).
 */
export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('avui');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: {
      // /avui is the eternal-now alias; same canonical for any
      // crawl, no per-day URL yet (archive permalinks are a phase-2
      // follow-up).
      canonical: '/avui',
    },
  };
}

export default async function AvuiPage() {
  const t = await getTranslations('avui');
  const locale = await getLocale();

  // Single parallel fetch wave. Every promise is wrapped so one
  // backend hiccup doesn't blank the whole page — the worst case is
  // a section that disappears, never a 500.
  const [
    summary,
    votesPage,
    groupSummary,
    coincidence,
    groups,
    topics,
    topicCounts,
    upcoming,
  ] = await Promise.all([
    api.stats.summary().catch(() => null) as Promise<StatsSummary | null>,
    // 24 votes covers the last ~2-3 plenary sessions which lets us
    // surface a "closest margin" pick across a wider window without
    // an extra backend hop.
    api.votes.list({ page: 1, page_size: 24 }).catch(() => null),
    api.metrics.groupSummary(1).catch(() => [] as GroupSummaryRow[]),
    api.metrics.coincidence(1).catch(() => [] as CoincidenceCell[]),
    api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
    api.topics.list().catch(() => [] as Topic[]),
    api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]),
    api.agenda.upcoming().catch(() => null) as Promise<ScheduledSession | null>,
  ]);

  const latestVote: Vote | null = votesPage?.items[0] ?? null;
  const recentVotes: Vote[] = (votesPage?.items ?? []).slice(0, 4);
  // Closest-margin vote across the loaded window. Pure data: smallest
  // |ayes - noes| with ≥30 votes cast (filters out procedural votes
  // where almost nobody is in the chamber). Tied votes are interesting
  // too, but treat them as a special case so the caption can say
  // "empat" rather than a misleading "0 vots de marge".
  const closestVote = pickClosestMarginVote(votesPage?.items ?? [], latestVote?.id);

  // Date in the page header — long form, local. We use the latest
  // vote's date when available (anchors the page to the data it shows
  // rather than the visitor's clock); fall back to "today" when the
  // backend is empty.
  const anchorDate = latestVote
    ? new Date(latestVote.voted_at)
    : new Date();
  const dateLong = anchorDate.toLocaleDateString(locale, { dateStyle: 'full' });
  const dateIso = anchorDate.toISOString().slice(0, 10);

  // "Fresh data" relative line — same pulse-style indicator as the
  // mobile home, server-rendered into a plain string here. Uses hours
  // because the ingest cadence is 4 h; finer-grained units would be
  // false precision.
  const hoursSince = latestVote
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(latestVote.voted_at).getTime()) / 3_600_000,
        ),
      )
    : null;
  const freshness =
    hoursSince == null
      ? null
      : hoursSince < 1
      ? t('fresh_now')
      : hoursSince < 24
      ? t('fresh_hours', { hours: hoursSince })
      : t('fresh_days', { days: Math.floor(hoursSince / 24) });

  return (
    <article style={{ paddingTop: 18, paddingBottom: 48 }}>
      {/* Header — serif "diari" title + long date + eyebrow tagline. */}
      <header
        style={{
          borderTop: '3px solid var(--ink)',
          borderBottom: '1px solid var(--ink)',
          padding: '14px 0 12px',
          marginBottom: 22,
        }}
      >
        <div
          className="eyebrow"
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            fontWeight: 600,
          }}
        >
          {t('eyebrow')}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 4,
          }}
        >
          <h1
            className="h-display"
            style={{
              margin: 0,
              fontSize: 'clamp(34px, 6vw, 56px)',
              lineHeight: 1.02,
              letterSpacing: '-0.02em',
            }}
          >
            {t('title')}
          </h1>
          <time
            dateTime={dateIso}
            className="tabular"
            style={{
              fontSize: 13,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
            }}
          >
            {dateLong}
          </time>
        </div>
        {freshness && (
          <p
            style={{
              margin: '10px 0 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
              lineHeight: 1.3,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--aye, #16A34A)',
                display: 'inline-block',
              }}
            />
            {freshness}
          </p>
        )}
      </header>

      {/* Lead row — latest vote on the left, ambient context on the
          right. Collapses to a single column on mobile via the CSS at
          the end of the file. */}
      <section
        className="avui-lead"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 36,
          paddingBottom: 28,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="avui-lead__main" style={{ minWidth: 0 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 6, color: 'var(--ink-3)' }}
          >
            {t('lead_eyebrow')}
          </div>
          {latestVote ? (
            <LeadVote vote={latestVote} locale={locale} t={t} />
          ) : (
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              {t('lead_empty')}
            </p>
          )}
        </div>

        <aside
          className="avui-lead__aside"
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {summary && <CountersBox summary={summary} t={t} />}
          {upcoming && <UpcomingBox session={upcoming} locale={locale} t={t} />}
          {recentVotes.length > 1 && (
            <RecentVotesList votes={recentVotes.slice(1)} locale={locale} t={t} />
          )}
        </aside>
      </section>

      {/* Closest-margin band — purely data-driven: across the recent
          window, the vote with the smallest |ayes − noes| difference.
          Surfaces where the chamber was most split without editorial
          framing. Hidden when the lead vote already is the closest
          (avoids a redundant card). */}
      {closestVote && (
        <section style={{ paddingTop: 22 }}>
          <BandHeader title={t('band_closest_title')} caption={t('band_closest_caption')} />
          <ClosestVoteCard vote={closestVote} locale={locale} t={t} />
        </section>
      )}

      {/* Topic strip — what parliament has been voting on, taxonomy
          surface. Same component the /votes hub uses. */}
      {topics.length > 0 && (
        <section style={{ paddingTop: 24, paddingBottom: 4 }}>
          <BandHeader title={t('band_topics_title')} caption={t('band_topics_caption')} />
          <TopicChipsStrip
            topics={topics}
            counts={topicCounts}
            activeSlug={null}
            baseHref="/votes"
            allLabel={t('topic_chips_all_label')}
            countSuffix={t('topic_chips_count_suffix')}
          />
        </section>
      )}

      {/* Group summary band — every group, ordered by member count. */}
      {groupSummary.length > 0 && (
        <section style={{ paddingTop: 18, paddingBottom: 4 }}>
          <BandHeader title={t('band_groups_title')} caption={t('band_groups_caption')} />
          <GroupSummaryCarousel rows={groupSummary} highlightSlug={null} />
        </section>
      )}

      {/* Coincidence band — full matrix; most analytical, lives near
          the bottom for readers who scroll. */}
      {coincidence.length > 0 && groups.length > 0 && (
        <section style={{ paddingTop: 18, paddingBottom: 8 }}>
          <BandHeader
            title={t('band_coincidence_title')}
            caption={t('band_coincidence_caption')}
          />
          <CoincidenceMatrix
            groups={groups}
            cells={coincidence}
            highlightSlug={null}
          />
        </section>
      )}

      {/* Closing — quiet newsletter band + journalist CTA. */}
      <section
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid var(--ink)',
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: 28,
        }}
        className="avui-closing"
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em',
            }}
          >
            {t('newsletter_title')}
          </h2>
          <p
            style={{
              margin: '6px 0 14px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.6,
            }}
          >
            {t('newsletter_caption')}
          </p>
          <NewsletterSignup />
        </div>
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 12,
          }}
        >
          <div className="eyebrow" style={{ fontSize: 10 }}>
            {t('journalists_eyebrow')}
          </div>
          <p
            style={{
              margin: '4px 0 10px',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
            }}
          >
            {t('journalists_caption')}
          </p>
          <Link
            href={'/journalists' as Route}
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              border: '1px solid var(--ink)',
              borderRadius: 999,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('journalists_cta')}
          </Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 720px) {
          .avui-lead { grid-template-columns: 1fr !important; gap: 22px !important; }
          .avui-closing { grid-template-columns: 1fr !important; gap: 22px !important; }
        }
      `}</style>
    </article>
  );
}

type AvuiT = Awaited<ReturnType<typeof getTranslations<'avui'>>>;

function LeadVote({
  vote,
  locale,
  t,
}: {
  vote: Vote;
  locale: string;
  t: AvuiT;
}) {
  const subject = vote.description?.trim() || vote.title;
  const summary = pickPlainSummary(vote, locale);
  const dateStr = new Date(vote.voted_at).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  return (
    <div>
      <Link
        href={`/votes/${vote.id}` as Route}
        style={{
          color: 'inherit',
          textDecoration: 'none',
          display: 'block',
        }}
      >
        <h2
          className="h-headline"
          style={{
            margin: '4px 0 10px',
            fontSize: 'clamp(24px, 3.4vw, 36px)',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {subject}
        </h2>
      </Link>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--ink-3)',
          marginBottom: 14,
        }}
      >
        <span className="tabular">{dateStr}</span>
        <span aria-hidden="true">·</span>
        <ResultPill result={vote.result} label={t(`result_${vote.result}`)} />
      </div>
      <StackedBar
        d={{
          aye: vote.ayes,
          no: vote.noes,
          abst: vote.abstentions,
          nv: vote.absent,
        }}
        height={14}
      />
      <p
        className="tabular"
        style={{
          margin: '10px 0 0',
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        {t('lead_caption', {
          ayes: vote.ayes,
          noes: vote.noes,
          abst: vote.abstentions,
        })}
      </p>
      {summary && (
        <p
          className="serif"
          style={{
            margin: '14px 0 0',
            fontSize: 15,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {summary}
        </p>
      )}
      <Link
        href={`/votes/${vote.id}` as Route}
        style={{
          display: 'inline-block',
          marginTop: 12,
          fontSize: 13,
          color: 'var(--accent)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {t('lead_see_detail')} →
      </Link>
    </div>
  );
}

function CountersBox({
  summary,
  t,
}: {
  summary: StatsSummary;
  t: AvuiT;
}) {
  const items = [
    { label: t('counter_votes'), value: summary.votes_total },
    { label: t('counter_initiatives'), value: summary.initiatives_total },
    { label: t('counter_classified'), value: summary.initiatives_classified },
  ];
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--rule)',
        borderRadius: 12,
        background: 'var(--paper-2)',
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>
        {t('counters_eyebrow')}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        {items.map((it) => (
          <li key={it.label} style={{ minWidth: 80 }}>
            <div
              className="tabular"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {it.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{it.label}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpcomingBox({
  session,
  locale,
  t,
}: {
  session: ScheduledSession;
  locale: string;
  t: AvuiT;
}) {
  const when = new Date(session.date).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--rule)',
        borderRadius: 12,
        background: 'var(--paper-2)',
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
        {t('upcoming_eyebrow')}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{when}</div>
      <div
        className="tabular"
        style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}
      >
        {t('upcoming_session_number', { num: session.session_number })}
      </div>
      {session.items.length > 0 && (
        <div
          style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.4 }}
        >
          {t('upcoming_items', { count: session.items.length })}
        </div>
      )}
    </div>
  );
}

function RecentVotesList({
  votes,
  locale,
  t,
}: {
  votes: Vote[];
  locale: string;
  t: AvuiT;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>
        {t('recent_eyebrow')}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {votes.map((v) => (
          <li
            key={v.id}
            style={{
              padding: '8px 0',
              borderTop: '1px solid var(--rule)',
            }}
          >
            <Link
              href={`/votes/${v.id}` as Route}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span
                className="tabular"
                style={{
                  fontSize: 10,
                  color: 'var(--ink-3)',
                  flex: 'none',
                  width: 52,
                }}
              >
                {new Date(v.voted_at).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--ink)',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                {v.description?.trim() || v.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={'/votes' as Route}
        style={{
          display: 'inline-block',
          marginTop: 8,
          fontSize: 12,
          color: 'var(--accent)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {t('recent_see_all')} →
      </Link>
    </div>
  );
}

/**
 * Pick the vote with the smallest |ayes − noes| margin across the
 * recent-vote window. Ties (|margin| = 0) win because they're the
 * literal extreme case. We exclude the lead vote (passed via
 * ``leadVoteId``) so the page never shows the same vote twice, and
 * we require a minimum cast threshold to filter out procedural
 * single-vote oddities. Returns null when no vote clears the bar.
 */
function pickClosestMarginVote(
  votes: Vote[],
  leadVoteId: number | undefined,
): Vote | null {
  const MIN_CAST = 30;
  let best: Vote | null = null;
  let bestMargin = Number.POSITIVE_INFINITY;
  for (const v of votes) {
    if (leadVoteId != null && v.id === leadVoteId) continue;
    const cast = v.ayes + v.noes + v.abstentions;
    if (cast < MIN_CAST) continue;
    const margin = Math.abs(v.ayes - v.noes);
    if (margin < bestMargin) {
      best = v;
      bestMargin = margin;
    }
  }
  return best;
}

function ClosestVoteCard({
  vote,
  locale,
  t,
}: {
  vote: Vote;
  locale: string;
  t: AvuiT;
}) {
  const subject = vote.description?.trim() || vote.title;
  const dateStr = new Date(vote.voted_at).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  const margin = Math.abs(vote.ayes - vote.noes);
  return (
    <Link
      href={`/votes/${vote.id}` as Route}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 16,
        padding: '16px 18px',
        border: '1px solid var(--rule-strong)',
        borderRadius: 12,
        background: 'var(--paper-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-3)' }}
        >
          {dateStr}
        </div>
        <div
          className="serif"
          style={{
            margin: '4px 0 8px',
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.3,
            color: 'var(--ink)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {subject}
        </div>
        <StackedBar
          d={{
            aye: vote.ayes,
            no: vote.noes,
            abst: vote.abstentions,
            nv: vote.absent,
          }}
          height={10}
        />
      </div>
      <div
        style={{
          textAlign: 'right',
          minWidth: 92,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-end',
        }}
      >
        <div
          className="tabular"
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: margin === 0 ? 'var(--abst)' : 'var(--ink)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {margin === 0 ? t('closest_tie_label') : `±${margin}`}
        </div>
        <div
          style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          {margin === 0 ? t('closest_tie_caption') : t('closest_margin_caption')}
        </div>
      </div>
    </Link>
  );
}

function BandHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--ink-3)',
          fontWeight: 700,
        }}
      >
        {title}
      </h2>
      <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {caption}
      </p>
    </div>
  );
}
