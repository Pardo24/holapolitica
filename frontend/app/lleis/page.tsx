import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  MessagesSquare,
  Route as RouteIcon,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';

import { BottomSheet } from '@/components/BottomSheet';
import { LawCard } from '@/components/LawCard';
import { LawsFilterBar } from '@/components/LawsFilterBar';
import { LawsLens } from '@/components/LawsLens';
import { PageHeader } from '@/components/PageHeader';
import {
  api,
  type AudienceCount,
  type InitiativeListItem,
  type ParliamentaryGroupSummary,
  type Topic,
} from '@/lib/api';
import { isChangeTag } from '@/lib/changeTags';
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
  /** Affected-audience tags, comma-separated: "laws that affect me". */
  audience?: string;
  q?: string;
  /** recent (default) | voted | close */
  sort?: string;
  /** "What the text changes" tags, comma-separated. */
  change?: string;
  page?: string;
}

const PAGE_SIZE = 30;
// The chips filter by the latest VOTE outcome (what the row shows), not the
// portal's unreliable Initiative.status. "pending" = no decisive vote yet.
const RESULT_FILTERS = ['approved', 'rejected', 'pending'] as const;
type ResultFilter = (typeof RESULT_FILTERS)[number];
const SORTS = ['recent', 'voted', 'close'] as const;
type Sort = (typeof SORTS)[number];

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

  // Several outcomes at once: the API OR-s them, same as topics and groups.
  const resultFilters = splitCsv(sp.result).filter((r): r is ResultFilter =>
    RESULT_FILTERS.includes(r as ResultFilter),
  );
  const topicSlugs = splitCsv(sp.topic_slug);
  const groupSlugs = splitCsv(sp.proposing_group_slug);
  const audienceTags = splitCsv(sp.audience);
  const changeTags = splitCsv(sp.change).filter(isChangeTag);
  const query = (sp.q ?? '').trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const sort: Sort = SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : 'recent';

  const [data, groups, topics, audiences] = await Promise.all([
    api.initiatives.list({
      legislature_id: 1,
      creates_law: true,
      result: resultFilters.length ? resultFilters.join(',') : undefined,
      topic_slug: topicSlugs.length ? topicSlugs.join(',') : undefined,
      proposing_group_slug: groupSlugs.length ? groupSlugs.join(',') : undefined,
      audience: audienceTags.length ? audienceTags.join(',') : undefined,
      q: query || undefined,
      sort: sort === 'recent' ? undefined : sort,
      change: changeTags.length ? changeTags.join(',') : undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
    api.topics.list().catch(() => [] as Topic[]),
    // Audience tags exist in Catalan and Spanish only; English readers get
    // the Spanish ones, which is what the extractor produced from the law.
    api.initiatives
      .audiences({
        legislature_id: 1,
        creates_law: true,
        lang: locale === 'ca' ? 'ca' : 'es',
        limit: 24,
      })
      .catch(() => [] as AudienceCount[]),
  ]);

  const lastPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const buildHref = ({ p = 1, sortTo = sort }: { p?: number; sortTo?: Sort }): Route => {
    const qs = new URLSearchParams();
    if (resultFilters.length) qs.set('result', resultFilters.join(','));
    if (topicSlugs.length) qs.set('topic_slug', topicSlugs.join(','));
    if (groupSlugs.length) qs.set('proposing_group_slug', groupSlugs.join(','));
    if (audienceTags.length) qs.set('audience', audienceTags.join(','));
    if (changeTags.length) qs.set('change', changeTags.join(','));
    if (query) qs.set('q', query);
    if (sortTo !== 'recent') qs.set('sort', sortTo);
    if (p !== 1) qs.set('page', String(p));
    const s = qs.toString();
    return (s ? `/lleis?${s}` : '/lleis') as Route;
  };
  const buildPageHref = (p: number) => buildHref({ p });
  const activeFilters =
    resultFilters.length + topicSlugs.length + groupSlugs.length + audienceTags.length + changeTags.length;
  const sortLabel: Record<Sort, string> = {
    recent: t('sort_recent'),
    voted: t('sort_voted'),
    close: t('sort_close'),
  };

  return (
    <div>
      <PageHeader
        hue="var(--hue-lleis)"
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}
        cta={
          // Secondary on purpose: the laws are the page; every vote of
          // every kind (motions, procedures) is one quiet link away.
          <Link href={'/votes' as Route} className="laws-all-votes">
            {t('all_votes_link')}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />

      <LawsLens
        state={{
          sort,
          results: resultFilters,
          topicSlugs,
          groupSlugs,
          audiences: audienceTags,
          changes: changeTags,
          q: query,
        }}
        topics={topics}
        groups={groups}
        audiences={audiences}
        locale={locale}
        labels={{
          search_placeholder: t('search_placeholder'),
          search_submit: t('lens_search_submit'),
          eyebrow: t('lens_eyebrow'),
          voted_title: t('lens_voted_title'),
          voted_sub: t('lens_voted_sub'),
          close_title: t('lens_close_title'),
          close_sub: t('lens_close_sub'),
          topic_title: t('lens_topic_title'),
          topic_sub: t('lens_topic_sub'),
          party_title: t('lens_party_title'),
          party_sub: t('lens_party_sub'),
          change_title: t('lens_change_title'),
          change_sub: t('lens_change_sub'),
          audience_title: t('lens_audience_title'),
          audience_sub: t('lens_audience_sub'),
          government: t('group_government'),
          clear: t('clear_all'),
          close: t('lens_close'),
        }}
      />

      {/* How a law is made: the explainer of every step the cards below
          mention (amendments, taking into consideration, the Senate...). On
          a phone this is its way in, next to the laws themselves. */}
      <Link href={'/recorregut' as Route} className="howlaw-link">
        <span className="howlaw-link__icon" aria-hidden="true">
          <RouteIcon size={18} strokeWidth={2} />
        </span>
        <span className="howlaw-link__text">
          <strong>{t('howlaw_title')}</strong>
          <span>{t('howlaw_sub')}</span>
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </Link>

      {/* One toolbar, two shapes: in place on a desktop, in a sheet behind
          the "Filtres" button on a phone, where the lens above already
          answers the common questions and the full toolbar is the rest. */}
      <div className="laws-results-row">
        <p className="laws-results-count">
          {sort === 'recent'
            ? t('results_count', { count: data.total })
            : t('results_count_sorted', { count: data.total, sort: sortLabel[sort].toLowerCase() })}
        </p>
        <nav className="laws-sort" aria-label={t('sort_aria')}>
          {SORTS.map((key) => (
            <Link
              key={key}
              href={buildHref({ sortTo: key })}
              aria-current={key === sort ? 'true' : undefined}
              scroll={false}
            >
              {sortLabel[key]}
            </Link>
          ))}
        </nav>
        <BottomSheet
          inlineOnDesktop
          trigger={
            <>
              <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
              {t('lens_filters')}
              {activeFilters > 0 && <span className="laws-filter-count tabular">{activeFilters}</span>}
            </>
          }
          triggerClassName="laws-filter-trigger"
          title={t('lens_filters')}
          closeLabel={t('lens_close')}
          doneLabel={t('lens_done', { count: data.total })}
        >
          <LawsFilterBar
            topics={topics}
            groups={groups}
            initialQ={query}
            initialResults={resultFilters}
            initialTopicSlugs={topicSlugs}
            initialGroupSlugs={groupSlugs}
            audiences={audiences}
            initialAudiences={audienceTags}
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
              audience_label: t('card_audience_filter'),
            }}
          />
        </BottomSheet>
      </div>

      {data.items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', paddingTop: 12 }}>{t('empty')}</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {data.items.map((i: InitiativeListItem) => (
            <LawCard
              key={i.id}
              initiative={i}
              parsed={parseProposer(i.submitted_by, groups)}
              locale={locale}
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
        .laws-results-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px 14px;
          margin: 16px 0 10px;
        }
        .laws-results-count { margin: 0; font-size: 12px; color: var(--ink-3); }
        .laws-sort { display: inline-flex; gap: 4px; font-size: 12.5px; }
        .laws-sort a {
          padding: 4px 10px;
          border-radius: 999px;
          color: var(--ink-2);
          text-decoration: none;
        }
        .laws-sort a[aria-current="true"] { background: var(--ink); color: var(--paper); font-weight: 600; }
        .laws-filter-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 19px;
          height: 19px;
          padding: 0 5px;
          border-radius: 999px;
          background: var(--ink);
          color: var(--paper);
          font-size: 11px;
          font-weight: 700;
        }
        /* Desktop: the toolbar renders first, full width, then the count
           and the sort switch on one line under it. */
        @media (min-width: 641px) {
          .laws-results-row > .sheet--inline-desktop { order: -1; width: 100%; }
        }
        /* Phone: the lens owns sorting; the row is count + Filtres. */
        @media (max-width: 640px) {
          .laws-sort { display: none; }
          .laws-results-row { margin-top: 14px; }
        }
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
