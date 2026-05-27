import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Route as RouteIcon, Search } from 'lucide-react';

import { CompactVoteRow } from '@/components/CompactVoteRow';
import { GroupCombobox } from '@/components/GroupCombobox';
import { ActiveFilterChips, type ActiveFilter } from '@/components/ActiveFilterChips';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PageHeader } from '@/components/PageHeader';
import { TopicChipsStrip } from '@/components/TopicChipsStrip';
import { VotesCalendarStripController } from '@/components/VotesCalendarStripController';
import type { CalendarDay } from '@/components/VotesCalendarStrip';
import { TopicCombobox } from '@/components/TopicCombobox';
import { UpcomingAgenda } from '@/components/UpcomingAgenda';
import { api, type ScheduledSession, type Vote, type VoteResult } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

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
  let calendarSourceVotes: Awaited<ReturnType<typeof api.votes.list>> | null = null;
  let topicCounts: Awaited<ReturnType<typeof api.stats.topicsGlobal>> = [];
  let error: string | null = null;

  try {
    [data, topics, groups, upcomingSessions, calendarSourceVotes, topicCounts] = await Promise.all([
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
      // Calendar source: most recent 100 votes (backend max page_size)
      // irrespective of filters, aggregated by date below. We deliberately
      // ignore the current filter set here so the strip always shows the
      // same chronological landmarks — tapping a date stacks with the
      // other filters via the URL, never replaces them.
      // ``.catch`` is critical: if THIS call fails the whole Promise.all
      // would reject and the page would render the error block instead
      // of the list. The strip just hides itself when empty.
      api.votes
        .list({ legislature_id: 1, page: 1, page_size: 100 })
        .catch(() => null),
      // Per-topic initiative counts feed the mobile topic carousel
      // (every topic visible, deterministic order — never editorial).
      api.stats.topicsGlobal().catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'unknown error';
  }

  // Build the calendar strip data: aggregate vote_records by date,
  // splice upcoming sessions to the right end so the user can see the
  // next plenary without leaving the page. Sorted ascending so the strip
  // reads left-to-right as time flows.
  const calendarDays = buildCalendarDays(
    calendarSourceVotes?.items ?? [],
    upcomingSessions,
  );
  const activeDate =
    params.date_from && params.date_from === params.date_to
      ? params.date_from
      : null;

  // Active-filter chips — one per applied filter, with × to remove.
  // The list shows up between the calendar and the rest of the page.
  const activeFilters: ActiveFilter[] = [];
  if (activeDate) {
    activeFilters.push({
      paramKey: 'date_from',
      pairParamKey: 'date_to',
      label: new Date(`${activeDate}T12:00:00`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    });
  }
  if (params.topic_slug) {
    const topic = topics.find((tp) => tp.slug === params.topic_slug);
    if (topic) {
      activeFilters.push({
        paramKey: 'topic_slug',
        label: pickTopicName(topic, locale),
        color: topic.color_hex,
      });
    }
  }
  if (params.proposing_group_slug) {
    if (params.proposing_group_slug === 'govern') {
      activeFilters.push({
        paramKey: 'proposing_group_slug',
        label: t('proposed_by_government'),
      });
    } else {
      const group = groups.find((g) => g.slug === params.proposing_group_slug);
      if (group) {
        activeFilters.push({
          paramKey: 'proposing_group_slug',
          label: displayGroupShort(group.name_short),
          color: group.color_hex,
        });
      }
    }
  }
  if (params.result) {
    activeFilters.push({
      paramKey: 'result',
      label: t(`result.${params.result}` as 'result.approved'),
    });
  }
  if (params.q) {
    activeFilters.push({
      paramKey: 'q',
      label: `"${params.q}"`,
    });
  }

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

      {/* Calendar strip — past vote-days + upcoming plenaries in one
          chronological scrollable row. Mobile-first: lets a phone user
          jump to a date without typing. Stacks with the rest of the
          filters so it composes cleanly. */}
      {calendarDays.length > 0 && (
        <div style={{ paddingTop: 8 }}>
          <VotesCalendarStripController
            days={calendarDays}
            activeDate={activeDate}
            allLabel={t('calendar_all_label')}
            countSuffix={t('calendar_count_suffix')}
          />
        </div>
      )}

      {/* Active-filter chips — visible on every viewport. When a chip is
          tapped the corresponding URL param is removed and the page
          re-renders without that filter. */}
      <ActiveFilterChips
        filters={activeFilters}
        clearAllLabel={t('filters_clear_all')}
      />

      {/* Horizontal chip strip of every theme topic — same component
          on desktop and mobile. Each chip is a scroll-snap target so
          a phone user can fling through the whole taxonomy and tap
          to filter the list directly. Previously mobile got a
          rotating one-card-at-a-time carousel; users complained that
          they couldn't see the full set at once, so we collapsed
          both surfaces onto the same strip. */}
      <TopicChipsStrip
        topics={topics}
        counts={topicCounts}
        activeSlug={params.topic_slug ?? null}
        baseHref="/votes"
        allLabel={t('topic_chips_all_label')}
        countSuffix={t('carousel_count_suffix')}
      />

      {/* Upcoming sessions, compact — renders nothing if empty so the
          table is not preceded by clutter. */}
      <UpcomingAgenda sessions={upcomingSessions} mode="compact" />

      {/* Filter form — primary row (search + topic) always visible; the
          advanced block (proposing group, result) sits inside a <details>
          so server-side state survives without client JS. The summary is
          styled as a real button (44px tall on mobile, chip-count when
          there are active advanced filters) so it's discoverable. */}
      {(() => {
        // Count of currently-applied "advanced" filters (everything except
        // the primary row q/topic). Surfaced on the toggle so users can
        // tell at a glance that a non-default filter is in effect even
        // when the panel is collapsed.
        const advancedCount =
          (params.proposing_group_slug ? 1 : 0) + (params.result ? 1 : 0);
        // `open` defaults to expanded when an advanced filter is already
        // applied so the user can see/edit what's filtering the table.
        const advancedOpen = advancedCount > 0;
        return (
          <form
            method="GET"
            style={{
              paddingTop: 6,
              paddingBottom: 14,
              borderBottom: '1px solid var(--rule)',
            }}
            className="filter-simple"
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr auto',
                gap: 10,
                alignItems: 'center',
              }}
              className="filter-simple-row"
            >
              <label
                className="search-chip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 10,
                  background: 'var(--paper)',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <span aria-hidden="true" style={{ color: 'var(--ink-3)', display: 'inline-flex' }}>
                  <Search size={14} aria-hidden="true" />
                </span>
                <input
                  type="search"
                  name="q"
                  placeholder={t('filters.search')}
                  defaultValue={params.q ?? ''}
                  style={{
                    border: 0,
                    background: 'transparent',
                    fontSize: 14,
                    flex: 1,
                    outline: 'none',
                    fontFamily: 'inherit',
                    color: 'var(--ink)',
                    minWidth: 0,
                  }}
                />
              </label>
              <TopicCombobox
                name="topic_slug"
                value={params.topic_slug ?? ''}
                topics={topics}
                emptyValue=""
                clearLabel={t('filters.all_topics')}
                placeholder={t('filters.all_topics')}
                ariaLabel={t('filters.all_topics')}
              />
              <button type="submit" className="btn-ink btn-sm filter-apply-btn">
                {t('filters.apply')}
              </button>
            </div>
            <details className="filter-advanced-details" open={advancedOpen}>
              <summary className="filter-advanced-summary">
                <span aria-hidden="true" className="filter-advanced-caret" style={{ display: 'inline-flex' }}>
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
                <span>
                  {t('advanced_filters_summary')}
                  {advancedCount > 0 && (
                    <span
                      className="filter-advanced-count"
                      aria-label={`${advancedCount} ${t('advanced_filters_summary')}`}
                    >
                      {advancedCount}
                    </span>
                  )}
                </span>
              </summary>
              <div className="filter-advanced">
                {/* Field wrappers are <div>s (not <label>s) because
                    GroupCombobox renders multiple internal form controls;
                    a label would clobber its focus management. The visible
                    field label is associated via aria-label on the inner
                    control instead. */}
                <div className="filter-advanced-field">
                  <span className="filter-advanced-field-label">
                    {t('filters.proposing_group')}
                  </span>
                  <GroupCombobox
                    name="proposing_group_slug"
                    value={params.proposing_group_slug ?? ''}
                    groups={groups}
                    extraOptions={[
                      { slug: 'govern', label: t('filters.proposing_government') },
                    ]}
                    emptyValue=""
                    clearLabel={t('filters.all_groups')}
                    placeholder={t('filters.all_groups')}
                    ariaLabel={t('filters.proposing_group')}
                  />
                </div>
                <label className="filter-advanced-field">
                  <span className="filter-advanced-field-label">
                    {t('filters.result')}
                  </span>
                  <select
                    name="result"
                    defaultValue={params.result ?? ''}
                    className="filter-advanced-select"
                  >
                    <option value="">{t('filters.all_results')}</option>
                    <option value="approved">{t('result.approved')}</option>
                    <option value="rejected">{t('result.rejected')}</option>
                    <option value="tie">{t('result.tie')}</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn-ink btn-sm filter-advanced-apply"
                >
                  {t('filters.apply')}
                </button>
              </div>
            </details>
          </form>
        );
      })()}

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
        <p style={{ color: 'var(--ink-3)', padding: '24px 0' }}>{t('no_results')}</p>
      )}

      {/* Single responsive list — CompactVoteRow uses the same flat
          ``.initiative-row`` shape at every viewport (no separate
          mobile/desktop variants). The previous design rendered two
          parallel <ul>'s gated by `sm:hidden` / `hidden sm:block`,
          which left both in the HTML and read as a duplicated
          "filtered list". One list, one source of truth. */}
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

/**
 * Build the calendar strip dataset: past vote-days aggregated from
 * the most recent N votes + upcoming plenary sessions to the right.
 *
 * Ascending chronological order so the strip reads as a time-axis.
 * We cap at 30 past + 7 future entries to keep the rendered row light
 * — anything older lives behind the explicit text filters below.
 *
 * Neutrality (CLAUDE.md "regla de simetria"): every distinct date that
 * had ≥1 vote shows up; we never hide low-count days because they're
 * "boring".
 */
function buildCalendarDays(
  recentVotes: ReadonlyArray<{ voted_at: string }>,
  upcomingSessions: ReadonlyArray<ScheduledSession>,
): CalendarDay[] {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const counts = new Map<string, number>();
  for (const v of recentVotes) {
    const day = v.voted_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const past = [...counts.entries()]
    .map(([date, count]) => ({ date, count, isFuture: date > todayKey }))
    .filter((d) => !d.isFuture)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const future = upcomingSessions
    .map((s) => s.date.slice(0, 10))
    .filter((d) => d >= todayKey)
    .map((date) => ({ date, count: 0, isFuture: true }))
    .slice(0, 7);

  return [...past, ...future];
}
