import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Scale } from 'lucide-react';

import { InitiativeRow } from '@/components/InitiativeRow';
import { PageHeader } from '@/components/PageHeader';
import {
  api,
  type InitiativeListItem,
  type InitiativeStatus,
  type ParliamentaryGroupSummary,
} from '@/lib/api';
import { parseProposer } from '@/lib/groups';

/**
 * The laws lens. Most plenary votes are non-binding positions (PNL,
 * Moció); the ones that actually change the law are few and are what
 * matters most to citizens. This page leads with those, lets the reader
 * narrow to a lifecycle outcome (approved / rejected / in progress), and
 * keeps the positions one tap away under a secondary lens.
 *
 * Strictly factual: type, proposer, outcome. No editorial framing — the
 * prioritisation is by procedural type, never by political side.
 */

type Lens = 'lleis' | 'posicionaments' | 'tot';

interface SearchParams {
  lens?: string;
  status?: string;
  page?: string;
}

const PAGE_SIZE = 30;
const STATUS_FILTERS: InitiativeStatus[] = ['approved', 'rejected', 'in_debate'];

export default async function LleisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('lleis');
  const tStats = await getTranslations('stats');
  const locale = await getLocale();

  const lens: Lens =
    sp.lens === 'posicionaments' ? 'posicionaments' : sp.lens === 'tot' ? 'tot' : 'lleis';
  const statusFilter = STATUS_FILTERS.includes(sp.status as InitiativeStatus)
    ? (sp.status as InitiativeStatus)
    : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const createsLaw = lens === 'lleis' ? true : lens === 'posicionaments' ? false : undefined;

  const [data, groups] = await Promise.all([
    api.initiatives.list({
      legislature_id: 1,
      creates_law: createsLaw,
      status: statusFilter,
      page,
      page_size: PAGE_SIZE,
    }),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
  ]);

  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  // Build an href that preserves the other filters and resets the page.
  const buildHref = (next: Partial<SearchParams>): Route => {
    const qs = new URLSearchParams();
    const merged = { lens, status: statusFilter, ...next };
    if (merged.lens && merged.lens !== 'lleis') qs.set('lens', merged.lens);
    if (merged.status) qs.set('status', merged.status);
    if (merged.page && merged.page !== '1') qs.set('page', merged.page);
    const s = qs.toString();
    return (s ? `/lleis?${s}` : '/lleis') as Route;
  };

  const lensTabs: { key: Lens; label: string }[] = [
    { key: 'lleis', label: t('lens_laws') },
    { key: 'posicionaments', label: t('lens_positions') },
    { key: 'tot', label: t('lens_all') },
  ];

  // Status chips only make sense for laws — positions (PNL/Moció) carry an
  // unreliable "submitted" status from the search portlet, so we hide the
  // sub-filter outside the laws / all lenses.
  const showStatusChips = lens !== 'posicionaments';

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

      {/* Lens: Lleis · Posicionaments · Tot. URL-driven, works without JS. */}
      <div
        role="tablist"
        aria-label={t('lens_aria')}
        style={{
          display: 'inline-flex',
          border: '1px solid var(--rule-strong)',
          borderRadius: 999,
          padding: 2,
          background: 'var(--paper-2)',
          marginTop: 18,
        }}
      >
        {lensTabs.map((tab) => {
          const isActive = lens === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildHref({ lens: tab.key, page: '1' })}
              role="tab"
              aria-selected={isActive}
              style={{
                padding: '5px 13px',
                borderRadius: 999,
                textDecoration: 'none',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--ink)' : 'transparent',
                color: isActive ? 'var(--paper)' : 'var(--ink-2)',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {showStatusChips && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <StatusChip href={buildHref({ status: undefined, page: '1' })} active={!statusFilter}>
            {t('status_all')}
          </StatusChip>
          {STATUS_FILTERS.map((s) => (
            <StatusChip
              key={s}
              href={buildHref({ status: s, page: '1' })}
              active={statusFilter === s}
            >
              {tStats(`status_singular_${s}`)}
            </StatusChip>
          ))}
        </div>
      )}

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
              <Link
                href={buildHref({ page: String(page - 1) })}
                aria-label={t('prev')}
                className="pager-link"
                style={pagerLink}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </Link>
            )}
            {page < lastPage && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                aria-label={t('next')}
                className="pager-link"
                style={pagerLink}
              >
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

function StatusChip({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: '4px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}
