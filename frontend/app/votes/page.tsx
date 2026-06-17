import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CheckSquare, ChevronLeft, ChevronRight, Route as RouteIcon, SearchX } from 'lucide-react';

import { CompactVoteRow } from '@/components/CompactVoteRow';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PageHeader } from '@/components/PageHeader';
import { TopicChipsStrip } from '@/components/TopicChipsStrip';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { VotesFilterCard } from '@/components/VotesFilterCard';
import { api, type ScheduledSession, type Vote, type VoteResult } from '@/lib/api';

interface SearchParams {
  /**
   * Legacy: ``tab=topics|votes`` used to switch between two surfaces.
   * Kept here only to absorb old links without 404s — the value is
   * ignored; both routes render the unified surface now.
   */
  tab?: string;
  // Carry-over from when the "Per tema" tab had its own SDG sub-tab.
  // The full SDG grid still lives at /agenda-2030 and /topics?kind=sdg.
  kind?: string;
  // Vote-list params
  topic_slug?: string;
  proposing_group_slug?: string;
  result?: VoteResult;
  q?: string;
  page?: string;
  /** YYYY-MM-DD — both set together when the calendar strip cell is tapped. */
  date_from?: string;
  date_to?: string;
}

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('votes');
  const tLifecycle = await getTranslations('lifecycle');
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        title={t('title')}
        icon={<CheckSquare size={20} strokeWidth={1.8} aria-hidden="true" />}
        cta={
          <Link
            href={'/recorregut' as Route}
            aria-label={tLifecycle('cta_short')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 999,
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <RouteIcon size={14} aria-hidden="true" />
            {tLifecycle('cta_short')}
          </Link>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--ink-3)',
            lineHeight: 1.4,
            maxWidth: 760,
          }}
        >
          {t('subtitle')}
        </p>
      </PageHeader>

      <VotesListTab params={params} />

      {/* Newsletter signup — at the very bottom. Compact card, neutral
          copy, posts directly to backend. */}
      <NewsletterSignup />
    </div>
  );
}

async function VotesListTab({ params }: { params: SearchParams }) {
  const t = await getTranslations('votes');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const page = Number(params.page ?? 1);

  let data: Awaited<ReturnType<typeof api.votes.list>> | null = null;
  let topics: Awaited<ReturnType<typeof api.topics.list>> = [];
  let groups: Awaited<ReturnType<typeof api.groups.list>> = [];
  let upcomingSessions: ScheduledSession[] = [];
  let topicCounts: Awaited<ReturnType<typeof api.stats.topicsGlobal>> = [];
  let error: string | null = null;

  try {
    [data, topics, groups, upcomingSessions, topicCounts] = await Promise.all([
      api.votes.list({
        topic_slug: params.topic_slug,
        proposing_group_slug: params.proposing_group_slug,
        result: params.result,
        q: params.q,
        date_from: params.date_from,
        date_to: params.date_to,
        page,
        page_size: 20,
      }),
      api.topics.list().catch(() => [] as Awaited<ReturnType<typeof api.topics.list>>),
      api.groups.list().catch(() => [] as Awaited<ReturnType<typeof api.groups.list>>),
      // Compact agenda banner above the list — same upcoming data as the
      // home page, but `mode="compact"` hides it entirely when empty so
      // the table is not preceded by a stale "no data" block.
      api.agenda
        .sessions({ legislature_id: 1, upcoming_only: true })
        .then((rows) => rows.slice(0, 4))
        .catch(() => [] as ScheduledSession[]),
      // Per-topic initiative counts feed the mobile topic carousel
      // (every topic visible, deterministic order — never editorial).
      api.stats.topicsGlobal().catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'unknown error';
  }

  const activeDate =
    params.date_from && params.date_from === params.date_to
      ? params.date_from
      : null;

  // Topic / group filters can now be a comma-separated list (the
  // backend OR's across the slugs). Split here so the chip strip and
  // the filter card both see arrays; the API call still forwards the
  // raw comma-joined string so the backend keeps the URL shape stable.
  const topicSlugs = (params.topic_slug ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const groupSlugs = (params.proposing_group_slug ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingTop: 14,
        }}
      >
        <div className="tabular" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {data ? data.total.toLocaleString(locale) : '—'}
          </span>
          {data && (
            <>
              {' · '}
              {tCommon('page')} {page} / {totalPages}
            </>
          )}
        </div>
      </div>

      {/* Horizontal chip strip of every theme topic — same component
          on desktop and mobile. Each chip is a scroll-snap target so
          a phone user can fling through the whole taxonomy and tap
          to filter the list directly. */}
      <TopicChipsStrip
        topics={topics}
        counts={topicCounts}
        activeSlugs={topicSlugs}
        allLabel={t('topic_chips_all_label')}
        countSuffix={t('carousel_count_suffix')}
        locale={locale}
      />

      {/* Upcoming sessions, compact — renders nothing if empty so the
          table is not preceded by clutter. */}
      <UpcomingAgenda sessions={upcomingSessions} mode="compact" />

      {/* Auto-apply filter card. Owns its own URL state via the
          router — no Apply button, no GET form, no advanced collapse.
          Multi-value for topic + group via comma-separated URL params
          (backend OR's across the values); selected chips render
          inline under each combobox with their own × to remove a
          single value. */}
      <VotesFilterCard
        topics={topics}
        groups={groups}
        initialQ={params.q ?? ''}
        initialTopicSlugs={topicSlugs}
        initialGroupSlugs={groupSlugs}
        initialResult={params.result ?? ''}
        hasOtherActiveFilters={Boolean(activeDate)}
        locale={locale}
        labels={{
          search: t('filters.search'),
          search_placeholder: t('filters.search'),
          topics_label: t('filters.all_topics'),
          topics_placeholder: t('filters.all_topics'),
          topics_clear: t('filters.all_topics'),
          groups_label: t('filters.proposing_group'),
          groups_placeholder: t('filters.all_groups'),
          groups_clear: t('filters.all_groups'),
          group_government: t('filters.proposing_government'),
          result_label: t('filters.result'),
          result_all: t('filters.all_results'),
          result_approved: t('result.approved'),
          result_rejected: t('result.rejected'),
          result_tie: t('result.tie'),
          clear_all: t('filters_clear_all'),
          remove_label: 'Treu',
          more_filters: t('filters.more'),
        }}
      />

      {error && (
        <div
          style={{
            border: '1px solid var(--no)',
            background: 'var(--no-soft)',
            color: 'var(--no)',
            padding: 12,
            margin: '14px 0',
            fontSize: 13,
          }}
        >
          {tCommon('error')}: {error}
        </div>
      )}

      {data && data.items.length === 0 && (
        <div
          style={{
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            color: 'var(--ink-3)',
            textAlign: 'center',
          }}
        >
          <SearchX size={32} strokeWidth={1.4} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: 14 }}>{t('no_results')}</p>
        </div>
      )}

      {/* Single responsive list — CompactVoteRow delegates to the shared
          ``.law-row`` shell (LawRow), the same flat shape at every
          viewport (no separate mobile/desktop variants). The previous
          design rendered two parallel <ul>'s gated by `sm:hidden` /
          `hidden sm:block`, which left both in the HTML and read as a
          duplicated "filtered list". One list, one source of truth. */}
      {data && data.items.length > 0 && (
        <ul
          className="votes-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '8px 0 0',
            display: 'grid',
            gap: 0,
          }}
        >
          {data.items.map((vote) => (
            <CompactVoteRow
              key={vote.id}
              v={vote}
              locale={locale}
              labels={{
                ayes: t('ayes'),
                noes: t('noes'),
                abstentions: t('abstentions'),
                proposed_by: t('proposed_by'),
                proposed_by_government: t('proposed_by_government'),
                result: t(`result.${vote.result}` as 'result.approved'),
              }}
            />
          ))}
        </ul>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={page}
          pageSize={data.page_size}
          searchParams={params}
          summaryLabel={t('pagination_label', {
            from: (page - 1) * data.page_size + 1,
            to: Math.min(page * data.page_size, data.total),
            total: data.total,
          })}
          prevLabel={t('pagination_prev_aria')}
          nextLabel={t('pagination_next_aria')}
        />
      )}

      <style>{`
        @media (max-width: 720px) {
          .filter-rail { grid-template-columns: 1fr 1fr !important; }
          .filter-rail > div:nth-child(n+5) { grid-column: 1 / -1; }
        }
      `}</style>
    </div>
  );
}

function Pagination({
  total,
  page,
  pageSize,
  searchParams,
  summaryLabel,
  prevLabel,
  nextLabel,
}: {
  total: number;
  page: number;
  pageSize: number;
  searchParams: SearchParams;
  summaryLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const buildHref = (p: number): Route => {
    const qs = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v && k !== 'page') qs.set(k, String(v));
    });
    qs.set('page', String(p));
    return `/votes?${qs.toString()}` as Route;
  };
  const pages: (number | '…')[] = [];
  if (lastPage <= 7) {
    for (let i = 1; i <= lastPage; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(lastPage - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < lastPage - 2) pages.push('…');
    pages.push(lastPage);
  }
  // Pagination chips. Visual size stays compact on desktop (~36px), but
  // on touch (`@media (hover: none)`) they bump up to the 44×44 Apple
  // guideline via a CSS class so users can land a tap on a digit.
  const pagerLink: React.CSSProperties = {
    padding: '6px 10px',
    minWidth: 36,
    minHeight: 36,
    border: '1px solid var(--rule)',
    fontSize: 13,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  };
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 0',
        fontSize: 12,
        color: 'var(--ink-3)',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <span>{summaryLabel}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            aria-label={prevLabel}
            className="pager-link"
            style={{ ...pagerLink, color: 'var(--ink-2)' }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </Link>
        )}
        {pages.map((p, i) =>
          p === '…' ? (
            <span
              key={`ellipsis-${i}`}
              style={{ padding: '6px 8px', fontSize: 13, alignSelf: 'center' }}
            >
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              className="pager-link"
              style={{
                ...pagerLink,
                background: p === page ? 'var(--ink)' : 'transparent',
                color: p === page ? 'var(--paper)' : 'var(--ink-2)',
                fontWeight: p === page ? 700 : 400,
              }}
            >
              {p}
            </Link>
          ),
        )}
        {page < lastPage && (
          <Link
            href={buildHref(page + 1)}
            aria-label={nextLabel}
            className="pager-link"
            style={{ ...pagerLink, color: 'var(--ink-2)' }}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <style>{`
        @media (hover: none) {
          .pager-link { min-width: 44px !important; min-height: 44px !important; }
        }
      `}</style>
    </div>
  );
}

