import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { NewsletterSignup } from '@/components/NewsletterSignup';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { GroupChip } from '@/components/GroupChip';
import { SummaryHover } from '@/components/SummaryHover';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { VoteBreakdown } from '@/components/VoteBreakdown';
import { api, type ScheduledSession, type Vote, type VoteResult } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';

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
  try {
    [summary, latestVotes, upcomingSessions] = await Promise.all([
      api.stats.summary(),
      api.votes
        .list({ page: 1, page_size: 5 })
        .then((p) => p.items),
      api.agenda
        .sessions({ legislature_id: 1, upcoming_only: true })
        .then((rows) => rows.slice(0, 4))
        .catch(() => [] as ScheduledSession[]),
    ]);
  } catch {
    /* backend not ready — render with zeros */
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
          <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 560, margin: '0 0 28px', lineHeight: 1.5 }}>
            {t('hero_subtitle')}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/votes" className="btn-ink">
              {t('cta_explore')}
            </Link>
            <Link
              href="/about"
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--rule-strong)',
                textUnderlineOffset: 4,
              }}
            >
              {t('why_link')}
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
            {t('week_caveat')}{' '}
            <Link href="/about" style={{ color: 'var(--ink-2)' }}>
              {t('week_methodology_link')}
            </Link>
          </div>
        </aside>
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

      {/* Newsletter signup — placed RIGHT after the coverage tiles so
          the macro numbers (initiatives, votes, classified) give the
          reader a reason to want updates. Compact card on mobile. */}
      <NewsletterSignup />

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

      {/* Responsive helper — collapse hero / coverage on narrow screens */}
      <style>{`
        @media (max-width: 860px) {
          .home-hero { grid-template-columns: 1fr !important; gap: 24px !important; padding-top: 24px !important; padding-bottom: 24px !important; }
          .home-coverage { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
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
          <span className="sm:hidden whitespace-nowrap">{shortDate}</span>
          <span className="hidden sm:inline">{longDate}</span>
          {v.expediente_raw && (
            <>
              <br />
              <span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {v.expediente_raw}
              </span>
            </>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
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
            >
              {subject}
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
            {/* Mobile-only: colored result text sits on the SAME baseline
                as the proposer chip — matches the user's mock. Desktop
                keeps its own dedicated result cell on the right. */}
            <span className="sm:hidden inline-flex items-center gap-2">
              <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>·</span>
              <span style={{ color: resultColor(v.result), fontWeight: 600 }}>
                {labels.result}
              </span>
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
