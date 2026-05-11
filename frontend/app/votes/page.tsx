import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { GroupChip } from '@/components/GroupChip';
import { GroupCombobox } from '@/components/GroupCombobox';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import { SummaryHover } from '@/components/SummaryHover';
import { TopicCombobox } from '@/components/TopicCombobox';
import { VoteBreakdown } from '@/components/VoteBreakdown';
import { api, type Vote, type VoteResult } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';

interface SearchParams {
  topic_slug?: string;
  proposing_group_slug?: string;
  result?: VoteResult;
  q?: string;
  page?: string;
}

export default async function VotesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('votes');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const locale = await getLocale();

  let data: Awaited<ReturnType<typeof api.votes.list>> | null = null;
  let topics: Awaited<ReturnType<typeof api.topics.list>> = [];
  let groups: Awaited<ReturnType<typeof api.groups.list>> = [];
  let error: string | null = null;

  try {
    [data, topics, groups] = await Promise.all([
      api.votes.list({
        topic_slug: params.topic_slug,
        proposing_group_slug: params.proposing_group_slug,
        result: params.result,
        q: params.q,
        page,
        page_size: 20,
      }),
      api.topics.list(),
      api.groups.list(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'unknown error';
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 18,
          borderBottom: '1px solid var(--ink)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="eyebrow">{t('subtitle')}</div>
          <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
            {t('title')}
          </h1>
        </div>
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
      </header>

      {/* Simplified filter — primary row (search + topic), advanced hidden */}
      <form
        method="GET"
        style={{
          paddingTop: 14,
          paddingBottom: 6,
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 999,
              background: 'var(--paper)',
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>⌕</span>
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
          <button type="submit" className="btn-ink btn-sm" style={{ padding: '10px 18px' }}>
            {t('filters.apply')}
          </button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--ink-3)',
              padding: '4px 0',
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden="true">▸</span> Filtres avançats
          </summary>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 8,
              paddingBottom: 4,
            }}
            className="filter-advanced"
          >
            <GroupCombobox
              name="proposing_group_slug"
              value={params.proposing_group_slug ?? ''}
              groups={groups}
              extraOptions={[{ slug: 'govern', label: t('filters.proposing_government') }]}
              emptyValue=""
              clearLabel={t('filters.all_groups')}
              placeholder={t('filters.all_groups')}
              ariaLabel={t('filters.all_groups')}
            />
            <select
              name="result"
              defaultValue={params.result ?? ''}
              style={{
                ...selectStyle,
                padding: '8px 10px',
                border: '1px solid var(--rule)',
                background: 'var(--paper)',
                fontSize: 12,
              }}
            >
              <option value="">{t('filters.all_results')}</option>
              <option value="approved">{t('result.approved')}</option>
              <option value="rejected">{t('result.rejected')}</option>
              <option value="tie">{t('result.tie')}</option>
            </select>
          </div>
        </details>
      </form>

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

      {data && data.items.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="tab tab-votes-list">
            <thead>
              <tr>
                <th style={{ width: 100 }}>{t('filters.date_from')}</th>
                <th style={{ width: 110 }}>{t('expediente_label')}</th>
                <th>{t('header_subject_breadcrumb')}</th>
                <th style={{ width: 160 }}>{t('proposed_by')}</th>
                <th style={{ width: 240 }}>{t('cohesion_title')}</th>
                <th style={{ width: 110, textAlign: 'right' }}>{t('filters.result')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((vote) => (
                <VoteTableRow key={vote.id} vote={vote} locale={locale} t={{
                  ayes: t('ayes'),
                  noes: t('noes'),
                  abstentions: t('abstentions'),
                  proposed_by_government: t('proposed_by_government'),
                  result: t(`result.${vote.result}`),
                }} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <Pagination
          total={data.total}
          page={page}
          pageSize={data.page_size}
          searchParams={params}
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

const selectStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 13,
  flex: 1,
  outline: 'none',
  fontFamily: 'inherit',
  color: 'var(--ink-2)',
};

function FilterCell({
  children,
  border,
}: {
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRight: border ? '1px solid var(--rule)' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

interface RowLabels {
  ayes: string;
  noes: string;
  abstentions: string;
  proposed_by_government: string;
  result: string;
}

function VoteTableRow({
  vote,
  locale,
  t,
}: {
  vote: Vote;
  locale: string;
  t: RowLabels;
}) {
  const subject = vote.description?.trim() || vote.title;
  const date = new Date(vote.voted_at);
  const plainSummary = pickPlainSummary(vote, locale);
  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  // Short form for mobile: "19 nov" (no year if current). Long form for
  // desktop: "19 de nov. 2025" via the locale's medium date style.
  const shortDate = date
    .toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      ...(isCurrentYear ? {} : { year: '2-digit' }),
    })
    .replace(/\.$/, '');
  const longDate = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <tr style={{ position: 'relative' }}>
      <td className="tabular" style={{ color: 'var(--ink-2)', fontSize: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        <span className="sm:hidden">{shortDate}</span>
        <span className="hidden sm:inline">{longDate}</span>
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {vote.expediente_raw ?? '—'}
      </td>
      <td>
        <div style={{ position: 'relative' }}>
          <Link
            href={`/votes/${vote.id}`}
            style={{
              position: 'absolute',
              inset: '-10px -10px',
              zIndex: 0,
            }}
            aria-label={subject}
          >
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {subject}
            </span>
          </Link>
          <div style={{ position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>{vote.title}</span>
            </div>
            <div
              className="line-clamp-2 sm:line-clamp-3"
              style={{ lineHeight: 1.35, color: 'var(--ink)' }}
            >
              <SummaryHover
                summary={plainSummary}
                fallback={vote.description ?? undefined}
                provider={vote.plain_summary_provider}
              >
                {subject}
              </SummaryHover>
            </div>
          </div>
        </div>
      </td>
      <td style={{ position: 'relative', zIndex: 2 }}>
        {vote.proposed_by_government && !vote.proposing_group_short ? (
          <span className="badge" style={{ fontWeight: 600 }}>
            <span className="gdot" style={{ background: 'var(--ink)' }} />
            {t.proposed_by_government}
          </span>
        ) : vote.proposing_group_short ? (
          <GroupChip
            slug={vote.proposing_group_slug ?? undefined}
            short={displayGroupShort(vote.proposing_group_short)}
            color={vote.proposing_group_color}
            size="xs"
          />
        ) : (
          <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>—</span>
        )}
      </td>
      <td>
        <StackedBar
          d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
          height={6}
        />
        <VoteBreakdown
          ayes={vote.ayes}
          noes={vote.noes}
          abstentions={vote.abstentions}
          size="sm"
          labels={{ ayes: t.ayes, noes: t.noes, abstentions: t.abstentions }}
        />
      </td>
      <td style={{ textAlign: 'right' }}>
        <ResultPill result={vote.result} label={t.result} responsive />
      </td>
    </tr>
  );
}

function Pagination({
  total,
  page,
  pageSize,
  searchParams,
}: {
  total: number;
  page: number;
  pageSize: number;
  searchParams: SearchParams;
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
      <span>
        Mostrant {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--rule)',
              color: 'var(--ink-2)',
              fontSize: 12,
            }}
          >
            ‹
          </Link>
        )}
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '4px 10px', fontSize: 12 }}>
              …
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              style={{
                padding: '4px 10px',
                border: '1px solid var(--rule)',
                background: p === page ? 'var(--ink)' : 'transparent',
                color: p === page ? 'var(--paper)' : 'var(--ink-2)',
                fontSize: 12,
                textDecoration: 'none',
              }}
            >
              {p}
            </Link>
          ),
        )}
        {page < lastPage && (
          <Link
            href={buildHref(page + 1)}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--rule)',
              color: 'var(--ink-2)',
              fontSize: 12,
            }}
          >
            ›
          </Link>
        )}
      </div>
    </div>
  );
}
