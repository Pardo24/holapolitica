import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CheckSquare, ChevronLeft, ChevronRight, Route as RouteIcon, SearchX, SlidersHorizontal } from 'lucide-react';

import { VoteCard } from '@/components/VoteCard';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PageHeader } from '@/components/PageHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { VotesLens } from '@/components/VotesLens';
import { VotesFilterCard } from '@/components/VotesFilterCard';
import { api, type Legislature, type VoteResult } from '@/lib/api';

/**
 * The votes archive — every roll call, law-making or not.
 *
 * /lleis is the front door (the initiatives that become law); this is the
 * complete record behind it, so the page is built like an archive: one
 * control surface at the top, then results. What wasn't searching or
 * filtering (the agenda banner, the topic strip) moved out — an archive that
 * makes you scroll past a promo before the first result isn't one.
 */

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
  /** YYYY-MM-DD — set together by the links from /avui and the embed explorer. */
  date_from?: string;
  date_to?: string;
  /** Legislature id to browse (historical). Absent = current (active). */
  legislature?: string;
  /** '1' → keep only law-creating votes (Proyecto/Proposición/RDL de Ley). */
  law?: string;
  /** '1' → keep only positions (PNL and motions). */
  positions?: string;
  /** recent (default) | close */
  sort?: string;
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
  let legislatures: Legislature[] = [];
  let error: string | null = null;

  // Resolve which legislature to browse. The list is fetched first so we can
  // map the ?legislature=<id> param to the active default and scope every
  // other query to it. Falls back to "all current" if the list endpoint fails.
  legislatures = await api.legislatures
    .list()
    .then((rows) => rows.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)))
    .catch(() => [] as Legislature[]);
  const activeLeg = legislatures.find((l) => l.status === 'active') ?? legislatures[0] ?? null;
  const requestedId = params.legislature ? Number(params.legislature) : null;
  const selectedLeg =
    (requestedId != null && legislatures.find((l) => l.id === requestedId)) || activeLeg;
  const selectedLegId = selectedLeg?.id;
  const isHistorical = !!selectedLeg && !!activeLeg && selectedLeg.id !== activeLeg.id;

  try {
    [data, topics, groups] = await Promise.all([
      api.votes.list({
        legislature_id: selectedLegId,
        topic_slug: params.topic_slug,
        proposing_group_slug: params.proposing_group_slug,
        result: params.result,
        law_only: params.law === '1',
        positions_only: params.positions === '1',
        sort: params.sort === 'close' ? 'close' : undefined,
        q: params.q,
        date_from: params.date_from,
        date_to: params.date_to,
        page,
        page_size: 20,
      }),
      api.topics.list().catch(() => [] as Awaited<ReturnType<typeof api.topics.list>>),
      api.groups
        .list(selectedLegId)
        .catch(() => [] as Awaited<ReturnType<typeof api.groups.list>>),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'unknown error';
  }

  // A single day, arrived at from /avui or the embed explorer. There is no
  // date picker on this page, so the filter card shows it as a removable
  // chip: a filter the reader can't see is a filter they can't undo.
  const activeDate =
    params.date_from && params.date_from === params.date_to ? params.date_from : null;
  const activeDateLabel = activeDate
    ? new Date(activeDate).toLocaleDateString(locale, { dateStyle: 'medium' })
    : null;

  // Topic / group filters can be a comma-separated list (the backend OR's
  // across the slugs). Split here so the filter card sees arrays; the API
  // call still forwards the raw comma-joined string so the backend keeps
  // the URL shape stable.
  const topicSlugs = (params.topic_slug ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const groupSlugs = (params.proposing_group_slug ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  // The latest sitting, for the "last plenary" lens.
  const lastSessionDate =
    (await api.votes.list({ page: 1, page_size: 1 }).catch(() => null))?.items[0]?.voted_at.slice(0, 10) ?? null;

  return (
    <div>
      <VotesLens
        state={{
          sort: params.sort === 'close' ? 'close' : 'recent',
          topicSlugs,
          groupSlugs,
          lawOnly: params.law === '1',
          positionsOnly: params.positions === '1',
          date: activeDate,
          q: params.q ?? '',
          keep: {
            ...(params.legislature ? { legislature: params.legislature } : {}),
            ...(params.result ? { result: params.result } : {}),
          },
        }}
        topics={topics}
        groups={groups}
        lastSessionDate={isHistorical ? null : lastSessionDate}
        locale={locale}
        labels={{
          search_placeholder: t('filters.search'),
          search_submit: t('lens_search_submit'),
          eyebrow: t('lens_eyebrow'),
          close_title: t('lens_close_title'),
          close_sub: t('lens_close_sub'),
          topic_title: t('lens_topic_title'),
          topic_sub: t('lens_topic_sub'),
          party_title: t('lens_party_title'),
          party_sub: t('lens_party_sub'),
          laws_title: t('lens_laws_title'),
          laws_sub: t('lens_laws_sub'),
          positions_title: t('lens_positions_title'),
          positions_sub: t('lens_positions_sub'),
          session_title: t('lens_session_title'),
          session_sub: t('lens_session_sub'),
          government: t('filters.proposing_government'),
          clear: t('filters_clear_all'),
          close: t('lens_close'),
        }}
      />

      {/* The full toolbar: in place on a desktop, behind "Filtres" in a
          sheet on a phone, as on /lleis. */}
      <div className="laws-results-row">
        {data && (
          <p className="laws-results-count tabular">
            {t('records_count', { count: data.total.toLocaleString(locale) })}
            {totalPages > 1 && ` · ${tCommon('page')} ${page}/${totalPages}`}
          </p>
        )}
        <BottomSheet
          inlineOnDesktop
          trigger={
            <>
              <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
              {t('lens_filters')}
            </>
          }
          triggerClassName="laws-filter-trigger"
          title={t('lens_filters')}
          closeLabel={t('lens_close')}
          doneLabel={t('lens_done')}
        >
          <VotesFilterCard
            topics={topics}
            groups={groups}
            initialQ={params.q ?? ''}
            initialTopicSlugs={topicSlugs}
            initialGroupSlugs={groupSlugs}
            initialResult={params.result ?? ''}
            lawOnly={params.law === '1'}
            activeDateLabel={activeDateLabel}
            legislatures={legislatures}
            activeLegId={activeLeg?.id ?? null}
            selectedLegId={selectedLegId ?? null}
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
              law_only: t('law_only_label'),
              legislature_label: t('legislature_label'),
              legislature_current: t('legislature_current'),
            }}
          />
        </BottomSheet>
      </div>

      {isHistorical && selectedLeg && (
        <p
          style={{
            margin: '12px 0 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            fontSize: 12.5,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}
        >
          {t('legislature_historical_note', {
            number: selectedLeg.number,
            start: new Date(selectedLeg.start_date).getFullYear(),
            end: selectedLeg.end_date ? new Date(selectedLeg.end_date).getFullYear() : '',
          })}
        </p>
      )}

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

      {/* The same card as /lleis (VoteCard is LawCard's twin), so a vote
          looks like a vote wherever you meet it. */}
      {data && data.items.length > 0 && (
        <ul
          className="votes-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '8px 0 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {data.items.map((vote) => (
            <VoteCard key={vote.id} vote={vote} locale={locale} />
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
