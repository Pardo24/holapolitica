import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, ChevronLeft, ChevronRight, MessagesSquare, Scale } from 'lucide-react';

import { InitiativeRow } from '@/components/InitiativeRow';
import { LawsFilterBar } from '@/components/LawsFilterBar';
import { PageHeader } from '@/components/PageHeader';
import {
  api,
  type InitiativeListItem,
  type ParliamentaryGroupSummary,
  type Topic,
} from '@/lib/api';
import { parseProposer } from '@/lib/groups';

/**
 * The laws view — the primary surface. Lists the initiatives that actually
 * become law (Projecte/Proposició de Llei, Reial Decret Llei) with their
 * outcome, filterable by status, topic and proposing group. The many
 * non-binding votes (positions) are not mixed in here; they live on /votes,
 * reached via the explained link at the foot of the page.
 *
 * Strictly factual; the prioritisation is by procedural type, never by side.
 */

interface SearchParams {
  result?: string;
  topic_slug?: string;
  proposing_group_slug?: string;
  q?: string;
  page?: string;
}

const PAGE_SIZE = 30;
// The chips filter by the latest VOTE outcome (what the row shows), not the
// portal's unreliable Initiative.status. "pending" = no decisive vote yet.
const RESULT_FILTERS = ['approved', 'rejected', 'pending'] as const;
type ResultFilter = (typeof RESULT_FILTERS)[number];

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

  const resultFilter = RESULT_FILTERS.includes(sp.result as ResultFilter)
    ? (sp.result as ResultFilter)
    : undefined;
  const topicSlugs = splitCsv(sp.topic_slug);
  const groupSlugs = splitCsv(sp.proposing_group_slug);
  const query = (sp.q ?? '').trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [data, groups, topics] = await Promise.all([
    api.initiatives.list({
      legislature_id: 1,
      creates_law: true,
      result: resultFilter,
      topic_slug: topicSlugs.length ? topicSlugs.join(',') : undefined,
      proposing_group_slug: groupSlugs.length ? groupSlugs.join(',') : undefined,
      q: query || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
    api.topics.list().catch(() => [] as Topic[]),
  ]);

  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const buildPageHref = (p: number): Route => {
    const qs = new URLSearchParams();
    if (resultFilter) qs.set('result', resultFilter);
    if (topicSlugs.length) qs.set('topic_slug', topicSlugs.join(','));
    if (groupSlugs.length) qs.set('proposing_group_slug', groupSlugs.join(','));
    if (query) qs.set('q', query);
    if (p !== 1) qs.set('page', String(p));
    const s = qs.toString();
    return (s ? `/lleis?${s}` : '/lleis') as Route;
  };

  return (
    <div>
      <PageHeader title={t('title')} icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.4, maxWidth: 760 }}>
          {t('subtitle')}
        </p>
      </PageHeader>

      <LawsFilterBar
        topics={topics}
        groups={groups}
        initialQ={query}
        initialResult={resultFilter ?? ''}
        initialTopicSlugs={topicSlugs}
        initialGroupSlugs={groupSlugs}
        locale={locale}
        labels={{
          search_placeholder: t('search_placeholder'),
          status_all: t('status_all'),
          status_approved: tStats('status_singular_approved'),
          status_rejected: tStats('status_singular_rejected'),
          status_in_debate: tStats('status_singular_in_debate'),
          topic_label: t('topic_label'),
          topic_placeholder: t('topic_placeholder'),
          group_label: t('group_label'),
          group_placeholder: t('group_placeholder'),
          group_government: t('group_government'),
          more_filters: t('more_filters'),
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

      {/* The rest: votes that don't create law. Explained, then linked out —
          laws stay the focus here; positions live on /votes. */}
      <section
        style={{
          marginTop: 32,
          padding: '20px 22px',
          borderRadius: 16,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule-strong)',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 18,
          alignItems: 'center',
        }}
        className="lleis-nonlaw-cta"
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 46,
            height: 46,
            borderRadius: 13,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-2)',
            flex: 'none',
          }}
        >
          <MessagesSquare size={22} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t('nonlaw_eyebrow')}
          </div>
          <h2 className="serif" style={{ margin: 0, fontSize: 'clamp(16px, 2vw, 19px)', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
            {t('nonlaw_title')}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 620 }}>
            {t('nonlaw_body')}
          </p>
        </div>
        <Link
          href={'/votes' as Route}
          className="btn-ink"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', whiteSpace: 'nowrap' }}
        >
          {t('nonlaw_cta')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>

      <style>{`
        @media (max-width: 720px) {
          .lleis-nonlaw-cta {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
          }
          .lleis-nonlaw-cta > a { justify-content: center; }
        }
      `}</style>
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
