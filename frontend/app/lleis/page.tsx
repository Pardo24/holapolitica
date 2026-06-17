import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Scale } from 'lucide-react';

import { InitiativeRow } from '@/components/InitiativeRow';
import { LawsFilterBar, type LawsLens } from '@/components/LawsFilterBar';
import { PageHeader } from '@/components/PageHeader';
import {
  api,
  type InitiativeListItem,
  type InitiativeStatus,
  type ParliamentaryGroupSummary,
  type Topic,
} from '@/lib/api';
import { parseProposer } from '@/lib/groups';

/**
 * The laws lens. Most plenary votes are non-binding positions (PNL,
 * Moció); the ones that actually change the law are few and are what
 * matters most to citizens. This page leads with those, lets the reader
 * narrow by outcome and topic, and keeps positions one tap away.
 *
 * Strictly factual: type, proposer, outcome. No editorial framing — the
 * prioritisation is by procedural type, never by political side.
 */

interface SearchParams {
  lens?: string;
  status?: string;
  topic_slug?: string;
  q?: string;
  page?: string;
}

const PAGE_SIZE = 30;
const STATUS_FILTERS: InitiativeStatus[] = ['approved', 'rejected', 'in_debate'];

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export default async function LleisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('lleis');
  const tStats = await getTranslations('stats');
  const locale = await getLocale();

  const lens: LawsLens =
    sp.lens === 'posicionaments' ? 'posicionaments' : sp.lens === 'tot' ? 'tot' : 'lleis';
  const statusFilter = STATUS_FILTERS.includes(sp.status as InitiativeStatus)
    ? (sp.status as InitiativeStatus)
    : undefined;
  const topicSlugs = splitCsv(sp.topic_slug);
  const query = (sp.q ?? '').trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const createsLaw = lens === 'lleis' ? true : lens === 'posicionaments' ? false : undefined;

  const [data, groups, topics] = await Promise.all([
    api.initiatives.list({
      legislature_id: 1,
      creates_law: createsLaw,
      status: statusFilter,
      topic_slug: topicSlugs.length ? topicSlugs.join(',') : undefined,
      q: query || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
    api.topics.list().catch(() => [] as Topic[]),
  ]);

  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  // Pagination hrefs preserve every active filter and only change page.
  const buildPageHref = (p: number): Route => {
    const qs = new URLSearchParams();
    if (lens !== 'lleis') qs.set('lens', lens);
    if (statusFilter) qs.set('status', statusFilter);
    if (topicSlugs.length) qs.set('topic_slug', topicSlugs.join(','));
    if (query) qs.set('q', query);
    if (p !== 1) qs.set('page', String(p));
    const s = qs.toString();
    return (s ? `/lleis?${s}` : '/lleis') as Route;
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.4, maxWidth: 760 }}>
          {t('subtitle')}
        </p>
      </PageHeader>

      <LawsFilterBar
        topics={topics}
        initialQ={query}
        initialLens={lens}
        initialStatus={statusFilter ?? ''}
        initialTopicSlugs={topicSlugs}
        locale={locale}
        labels={{
          search_placeholder: t('search_placeholder'),
          lens_aria: t('lens_aria'),
          lens_laws: t('lens_laws'),
          lens_positions: t('lens_positions'),
          lens_all: t('lens_all'),
          status_all: t('status_all'),
          status_approved: tStats('status_singular_approved'),
          status_rejected: tStats('status_singular_rejected'),
          status_in_debate: tStats('status_singular_in_debate'),
          topic_label: t('topic_label'),
          topic_placeholder: t('topic_placeholder'),
          topic_clear: t('topic_placeholder'),
          clear_all: t('clear_all'),
          remove_label: t('remove_label'),
        }}
      />

      <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '16px 0 4px' }}>
        {t('results_count', { count: data.total })}
      </p>

      {data.items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', paddingTop: 12 }}>{t('empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.items.map((i: InitiativeListItem) => (
            <InitiativeRow
              key={i.id}
              initiative={i}
              parsed={parseProposer(i.submitted_by, groups)}
              locale={locale}
              latestVoteResult={i.latest_vote_result}
            />
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 0',
            fontSize: 12,
            color: 'var(--ink-3)',
            gap: 10,
          }}
        >
          <span>{t('pagination_label', { page, last: lastPage })}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {page > 1 && (
              <Link href={buildPageHref(page - 1)} aria-label={t('prev')} className="pager-link" style={pagerLink}>
                <ChevronLeft size={14} aria-hidden="true" />
              </Link>
            )}
            {page < lastPage && (
              <Link href={buildPageHref(page + 1)} aria-label={t('next')} className="pager-link" style={pagerLink}>
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const pagerLink = {
  padding: '6px 10px',
  minWidth: 36,
  minHeight: 36,
  border: '1px solid var(--rule)',
  color: 'var(--ink-2)',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;
