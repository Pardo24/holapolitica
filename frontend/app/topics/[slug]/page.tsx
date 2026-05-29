import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Bell, ExternalLink, Newspaper } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupBadge } from '@/components/GroupBadge';
import { LawSummaryPanel } from '@/components/LawSummaryPanel';
import { LawTypeChip } from '@/components/LawTypeChip';
import { ProposerEllipsis } from '@/components/ProposerEllipsis';
import { ResultPill } from '@/components/ResultPill';
import { TopicGroupFilter } from '@/components/TopicGroupFilter';
import { Tooltip } from '@/components/Tooltip';
import {
  api,
  ApiError,
  type Initiative,
  type ParliamentaryGroupSummary,
  type ScheduledAgendaItem,
  type Topic,
  type TopicNewsItem,
  type Vote,
} from '@/lib/api';
import { glossaryShort, pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort, parseProposer, type ParsedProposer } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

interface Params {
  slug: string;
}

interface SearchParams {
  subset?: string;
  group?: string;
  /**
   * Free-text initiative-title filter. Matched against
   * ``initiative.title_original`` case- and accent-insensitively. URL-
   * bound so the filter persists across share/bookmark.
   */
  q?: string;
}

/**
 * Normalise a string for case- and diacritic-insensitive substring matching.
 *
 * - Lowercases via the Unicode-aware ``toLocaleLowerCase`` so Turkish-style
 *   edge cases ("İ") don't surprise us.
 * - Strips combining diacritical marks via NFD decomposition so a search
 *   for "habitatge" matches "habitatge", "habítatge", and "Hábitat".
 * - Collapses runs of whitespace so partial-word queries still match
 *   when the source title has line-wrap artefacts.
 */
function normalizeForSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATUS_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

const PENDING_STATUSES = new Set(['submitted', 'in_debate']);
const VOTED_STATUSES = new Set(['approved', 'rejected']);
const OTHER_STATUSES = new Set(['withdrawn', 'expired']);

type Subset = 'pending' | 'voted' | 'other';

export default async function TopicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await getTranslations('topic');
  const tStats = await getTranslations('stats');
  const locale = await getLocale();

  // URL-bound UI state. Each defaults to a safe value so a bare URL still
  // renders sensibly, and bookmarks / shareable links round-trip cleanly.
  const subset: Subset =
    sp.subset === 'voted' ? 'voted' : sp.subset === 'other' ? 'other' : 'pending';
  const groupFilter = (sp.group ?? '').trim();
  const rawQuery = (sp.q ?? '').trim();
  const queryNeedle = rawQuery ? normalizeForSearch(rawQuery) : '';

  let topic: Topic;
  try {
    topic = await api.topics.get(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const topicLabel = pickTopicName(topic, locale);

  const [initiatives, upcomingAgenda, topicGlobals, groups, recentVotesPage, news] =
    await Promise.all([
      api.topics.initiatives(slug, { legislature_id: 1 }),
      api.agenda.itemsByTopic(slug).catch(() => [] as ScheduledAgendaItem[]),
      api.stats.topicsGlobal().catch(() => []),
      api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
      // Most recent vote(s) classified under this topic. We only need the
      // first record for the "Què passa ara" lede; over-fetching by 3 keeps
      // the API call cheap if we later want to surface a small "also
      // recently" list. Empty list on failure.
      api.votes
        .list({ topic_slug: slug, legislature_id: 1, page: 1, page_size: 3 })
        .catch(() => ({ total: 0, page: 1, page_size: 3, items: [] as Vote[] })),
      // Google News RSS pass-through. Backend returns [] on upstream
      // failure; the section disappears gracefully in that case.
      api.topics.news(slug, locale).catch(() => [] as TopicNewsItem[]),
    ]);
  const recentVotes = recentVotesPage.items;
  const lastVote = recentVotes[0] ?? null;
  // Pick the next agenda item that points at THIS topic. ``upcomingAgenda``
  // is already filtered to the topic on the backend; we just take the head.
  const nextAgendaItem = upcomingAgenda[0] ?? null;

  // Pre-resolve the proposer parse per initiative once. Used both for the
  // group filter (matching) and for rendering badges in the row. Keeps the
  // O(n*m) name_long substring work out of the render hot path.
  const parsedByInitiative = new Map<number, ParsedProposer>();
  for (const it of initiatives) {
    parsedByInitiative.set(it.id, parseProposer(it.submitted_by, groups));
  }

  const matchesGroupFilter = (init: Initiative): boolean => {
    if (groupFilter === '') return true;
    if (groupFilter === 'govern') {
      return parsedByInitiative.get(init.id)?.isGovernment === true;
    }
    return (
      parsedByInitiative.get(init.id)?.groups.some((g) => g.slug === groupFilter) ?? false
    );
  };

  // Pre-compute the normalised title once per initiative so the filter
  // runs in O(n) without re-normalising on every keystroke (the URL is
  // the source of truth, but the same SSR pass renders multiple lists).
  const normalizedTitleByInitiative = new Map<number, string>();
  for (const it of initiatives) {
    normalizedTitleByInitiative.set(it.id, normalizeForSearch(it.title_original));
  }

  const matchesQueryFilter = (init: Initiative): boolean => {
    if (queryNeedle === '') return true;
    const haystack = normalizedTitleByInitiative.get(init.id) ?? '';
    return haystack.includes(queryNeedle);
  };

  const matchesAllFilters = (init: Initiative): boolean =>
    matchesGroupFilter(init) && matchesQueryFilter(init);

  const pendingAll = initiatives.filter((i) => PENDING_STATUSES.has(i.status));
  const votedAll = initiatives.filter((i) => VOTED_STATUSES.has(i.status));
  // Terminal-but-not-decided bucket: withdrawn / expired initiatives. These
  // never reached an aye/no result but are no longer in flight either —
  // exposing them under their own "Altres" tab keeps the row visible without
  // mixing it into the active subsets above.
  const otherAll = initiatives.filter((i) => OTHER_STATUSES.has(i.status));
  const pending = pendingAll.filter(matchesAllFilters);
  const voted = votedAll.filter(matchesAllFilters);
  const otherFiltered = otherAll.filter(matchesAllFilters);

  const approved = initiatives.filter((i) => i.status === 'approved').length;
  const rejected = initiatives.filter((i) => i.status === 'rejected').length;
  const decided = approved + rejected;
  const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : null;

  // Top proposers — aggregate the submitted_by free-text field. The strings
  // come from the Congreso feed verbatim ("Grupo Parlamentario VOX",
  // "Gobierno", etc.); we just count and sort. Keep top 4.
  const proposerCounts = new Map<string, number>();
  for (const it of initiatives) {
    const k = (it.submitted_by ?? 'Sense origen registrat').trim();
    proposerCounts.set(k, (proposerCounts.get(k) ?? 0) + 1);
  }
  const topProposers = Array.from(proposerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const proposerMax = Math.max(...topProposers.map(([, n]) => n), 1);

  // Use the global stats as a fallback if our per-page initiatives count
  // diverges (e.g., during ingestion).
  const _topicGlobal = topicGlobals.find((g) => g.topic_slug === slug);
  void _topicGlobal;

  // The active list and its empty-state copy depend on which subset tab the
  // user is currently viewing. Keeping these locals keeps the JSX below
  // declarative and avoids repeating the branching in three places.
  const activeList =
    subset === 'voted' ? voted : subset === 'other' ? otherFiltered : pending;
  const totalForSubset =
    subset === 'voted'
      ? votedAll.length
      : subset === 'other'
        ? otherAll.length
        : pendingAll.length;
  const emptyNoFilter =
    subset === 'voted'
      ? t('no_votes_yet')
      : subset === 'other'
        ? t('no_other_in_topic')
        : t('no_pending_in_topic');
  const emptyWithFilter =
    subset === 'voted'
      ? t('no_voted_with_filter')
      : subset === 'other'
        ? t('no_other_with_filter')
        : t('no_pending_with_filter');
  // The list above is "filtered" (and so should use the with-filter
  // empty-state copy) whenever ANY of the active filters narrowed it.
  const anyFilterActive = groupFilter !== '' || rawQuery !== '';

  // Build a URL-builder for the subset segmented control. Preserves
  // both the group and the text query so flipping subset never drops
  // a filter — a user who has narrowed to "habitatge / Junts pending"
  // and clicks "Votades" should land on "habitatge / Junts voted".
  const buildSubsetHref = (s: Subset): Route => {
    const qs = new URLSearchParams();
    qs.set('subset', s);
    if (groupFilter) qs.set('group', groupFilter);
    if (rawQuery) qs.set('q', rawQuery);
    return `/topics/${slug}?${qs.toString()}` as Route;
  };
  // "Clear filters" wipes BOTH group + free-text query in one click.
  // Preserves subset so the user stays on the same tab. This matches
  // the affordance copy ("× Neteja el filtre") and the user expectation
  // when both filters are visible side-by-side.
  const clearGroupHref: Route =
    (subset === 'voted'
      ? `/topics/${slug}?subset=voted`
      : subset === 'other'
        ? `/topics/${slug}?subset=other`
        : `/topics/${slug}`) as Route;

  return (
    <article>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/topics" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_topics')}
        </Link>
        {' / '}
        <span style={{ color: 'var(--ink)' }}>{topicLabel}</span>
      </div>

      <header
        style={{
          paddingTop: 12,
          paddingBottom: 24,
          borderTop: `3px solid ${topic.color_hex ?? 'var(--accent)'}`,
          marginTop: 12,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1
            className="h-display"
            style={{ margin: 0, fontSize: 'clamp(32px, 4.4vw, 48px)' }}
          >
            {topicLabel}
          </h1>
          <span
            className="eyebrow"
            style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
          >
            {t('topic_eyebrow')}
          </span>
        </div>
        {/* Cross-language label line. Hidden on mobile to keep the header
            tight — Catalan-default UI users on a phone already see the
            Catalan name in the H1; the Spanish/English variants are a
            nice-to-have transparency cue that lives well on desktop only. */}
        <p
          className="hidden sm:block"
          style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}
        >
          {topic.name_es} · {topic.name_en}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            borderTop: '1px solid var(--rule)',
            marginTop: 18,
          }}
        >
          <div className="kpi">
            <span className="label">{t('kpi_total_initiatives')}</span>
            <span className="value tabular">{initiatives.length}</span>
            <span className="sub">{t('kpi_classified_under_topic')}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('kpi_not_yet_voted')}</span>
            <span className="value tabular">{pendingAll.length}</span>
            <span className="sub">{t('kpi_submitted_or_in_debate')}</span>
          </div>
          <div className="kpi">
            <span className="label">{t('kpi_already_voted')}</span>
            <span className="value tabular">{votedAll.length}</span>
            <span className="sub">{t('kpi_approved_or_rejected')}</span>
          </div>
        </div>
      </header>

      {/* "Què passa ara" — narrative lede that answers, in two cards, the
          two most-asked questions about a topic: what was the most recent
          decision, and what's coming next. Either side can be empty (no
          votes yet / nothing on the next agenda) and we render an honest
          empty-state copy rather than hiding the section, so the page
          structure stays predictable across topics. */}
      <section style={{ paddingTop: 28 }} aria-labelledby="topic-whats-now">
        <h2
          id="topic-whats-now"
          className="eyebrow"
          style={{ marginBottom: 10 }}
        >
          {t('hub_whats_now_eyebrow')}
        </h2>
        <div
          className="topic-whats-now"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          <TopicLastVoteCard
            vote={lastVote}
            locale={locale}
            label={t('hub_last_vote_label')}
            emptyLabel={t('hub_no_recent_votes')}
          />
          <TopicNextAgendaCard
            item={nextAgendaItem}
            label={t('hub_next_vote_label')}
            emptyLabel={t('hub_no_upcoming')}
          />
        </div>
        <style>{`
          @media (max-width: 720px) {
            .topic-whats-now { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* Stats widget for this topic */}
      <section style={{ paddingTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {t('topic_stats_eyebrow')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 18,
            padding: 20,
            border: '1px solid var(--rule-strong)',
            borderRadius: 14,
            background: 'var(--paper-2)',
          }}
          className="topic-stats-widget"
        >
          {/* Approval rate + status counts */}
          <div>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
              <Tooltip
                term={t('approval_rate_label')}
                explanation={glossaryShort('approval_rate')}
              />
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 44,
                fontWeight: 600,
                color: 'var(--aye)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {approvalRate == null ? '—' : `${approvalRate}%`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              {t('approved_rejected_pending', {
                approved,
                rejected,
                pending: pendingAll.length,
              })}
            </div>

            {decided > 0 && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 2,
                    overflow: 'hidden',
                    background: 'var(--paper-3)',
                  }}
                >
                  <div
                    style={{
                      width: `${(approved / decided) * 100}%`,
                      background: 'var(--aye)',
                    }}
                  />
                  <div
                    style={{
                      width: `${(rejected / decided) * 100}%`,
                      background: 'var(--no)',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: 'var(--aye)', fontWeight: 600 }}>
                    {t('aye_short')} {approved}
                  </span>
                  <span style={{ color: 'var(--no)', fontWeight: 600 }}>
                    {t('no_short')} {rejected}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Top proposers */}
          <div>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
              {t('who_proposes_in_topic')}
            </div>
            {topProposers.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
                {t('no_initiative_registered')}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {topProposers.map(([who, count]) => (
                  <li
                    key={who}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 60px 30px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 0',
                      borderBottom: '1px solid var(--rule)',
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--ink-2)',
                        minWidth: 0,
                      }}
                      title={who}
                    >
                      {who}
                    </span>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--paper-3)',
                        borderRadius: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(count / proposerMax) * 100}%`,
                          height: '100%',
                          background: 'var(--accent)',
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span
                      className="tabular"
                      style={{ fontWeight: 600, textAlign: 'right' }}
                    >
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 8 }}>
              <Tooltip
                term={t('data_source_term')}
                explanation={glossaryShort('data_source')}
              />
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 720px) {
            .topic-stats-widget { grid-template-columns: 1fr !important; gap: 22px !important; }
          }
        `}</style>
      </section>

      {/* Initiatives — unified section with a subset segmented control and
          a group-proposer filter. Replaces the two static lists. */}
      <section style={{ paddingTop: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 24 }}>
          {t('initiatives_section_title')}
        </div>

        {/* Segmented buttons: per votar / votades. URL-driven so it works
            without client JS and is shareable. The extra top margin sits
            below the section eyebrow so the segmented control reads as a
            distinct affordance, not a sub-title glued to the heading. */}
        <div
          role="tablist"
          aria-label={t('subset_tablist_aria')}
          style={{
            display: 'inline-flex',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            padding: 2,
            background: 'var(--paper-2)',
            marginTop: 0,
            marginBottom: 14,
          }}
        >
          {(
            [
              { key: 'pending' as const, label: t('subset_pending'), count: pendingAll.length },
              { key: 'voted' as const, label: t('subset_voted'), count: votedAll.length },
              // "Altres" — withdrawn / expired. Only surface the segment
              // when there's at least one record so the control doesn't
              // grow a permanently-zero tab on quiet topics.
              ...(otherAll.length > 0
                ? [{ key: 'other' as const, label: t('subset_other'), count: otherAll.length }]
                : []),
            ]
          ).map((opt) => {
            const isActive = subset === opt.key;
            return (
              <Link
                key={opt.key}
                href={buildSubsetHref(opt.key)}
                role="tab"
                aria-selected={isActive}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 11px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? 'var(--ink)' : 'transparent',
                  color: isActive ? 'var(--paper)' : 'var(--ink-2)',
                  transition: 'background-color .12s ease, color .12s ease',
                }}
              >
                <span>{opt.label}</span>
                <span
                  className="tabular"
                  style={{
                    fontSize: 10,
                    opacity: isActive ? 0.85 : 0.6,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {opt.count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Group filter row — combobox + active-filter feedback. The
            combobox writes to a hidden input named ``group``; the form
            preserves the current subset so submitting doesn't reset it.
            Client-side filtering happens above (we just re-read the URL on
            submit). */}
        <TopicGroupFilter
          slug={slug}
          subset={subset}
          groups={groups}
          value={groupFilter}
          query={rawQuery}
          labels={{
            label: t('filter_group_label'),
            labelShort: t('filter_group_label_short'),
            placeholder: t('filter_group_placeholder'),
            clearLabel: t('filter_group_clear'),
            ariaLabel: t('filter_group_label'),
            governmentLabel: t('proposer_government_label'),
            countLabel: t('filter_results_count', { count: activeList.length }),
            totalLabel: t('filter_results_count', { count: totalForSubset }),
            clearCta: t('clear_filter_cta'),
            queryLabel: t('filter_query_label'),
            queryLabelShort: t('filter_query_label_short'),
            queryPlaceholder: t('filter_query_placeholder'),
            queryClearAria: t('filter_query_clear_aria'),
          }}
          clearHref={clearGroupHref}
        />

        {/* Agenda banner only meaningful while looking at pending */}
        {subset === 'pending' && upcomingAgenda.length > 0 && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: 10,
              marginBottom: 14,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            {t.rich('agenda_banner', {
              count: upcomingAgenda.length,
              b: (chunks) => <b>{chunks}</b>,
            })}
          </div>
        )}

        {activeList.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {anyFilterActive ? emptyWithFilter : emptyNoFilter}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {activeList.slice(0, 30).map((i) => (
              <InitiativeRow
                key={i.id}
                initiative={i}
                parsed={parsedByInitiative.get(i.id) ?? { isGovernment: false, groups: [], raw: (i.submitted_by ?? '').trim() }}
                locale={locale}
                tStats={tStats}
                governmentLabel={t('proposer_government_label')}
                moreGroupsLabel={(n: number) => t('proposer_more_groups', { count: n })}
              />
            ))}
            {activeList.length > 30 && (
              <li style={{ padding: '12px 0', fontSize: 12, color: 'var(--ink-3)' }}>
                {/* Pending and "altres" point at the same overflow copy
                    (they're both lists of records we don't expand inline
                    past 30); voted uses the slightly different
                    ``more_initiatives`` phrasing. */}
                {subset === 'voted'
                  ? t('more_initiatives', { count: activeList.length - 30 })
                  : t('more_via_api', { count: activeList.length - 30 })}
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Press-mentions feed — Google News RSS aggregator, pass-through
          (no curation). The section only renders when the upstream
          returned at least one item; an empty feed means either Google
          had no recent results or the request failed, and either way the
          hub reads cleaner without an empty section. */}
      <section style={{ paddingTop: 36 }} aria-labelledby="topic-news-title">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          <h2 id="topic-news-title" className="eyebrow" style={{ margin: 0 }}>
            {t('hub_news_eyebrow')}
          </h2>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {t('hub_news_attribution')}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            margin: '0 0 12px',
            maxWidth: 640,
            lineHeight: 1.5,
          }}
        >
          {t('hub_news_intro')}
        </p>
        {news.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
            {t('hub_news_empty')}
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: '1px solid var(--rule)',
              borderRadius: 12,
              background: 'var(--paper-2)',
              overflow: 'hidden',
            }}
          >
            {news.map((n, i) => (
              <NewsRow key={`${n.url}-${i}`} item={n} locale={locale} isFirst={i === 0} />
            ))}
          </ul>
        )}
      </section>

      {/* Subscribe CTA — the "you've read about this topic, now follow it"
          payoff at the bottom of the hub. Links to /notifications, which
          is the central preferences surface for both newsletter and push.
          Phrased around the topic name so the user sees what they're
          subscribing to in their own language. */}
      <section
        style={{ paddingTop: 36, paddingBottom: 16 }}
        aria-labelledby="topic-subscribe-title"
      >
        <div
          className="topic-subscribe-cta"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            gap: 18,
            alignItems: 'center',
            padding: '20px 22px',
            borderRadius: 16,
            background: `color-mix(in oklch, ${topic.color_hex ?? 'var(--accent)'} 10%, var(--paper-2))`,
            border: `1px solid color-mix(in oklch, ${topic.color_hex ?? 'var(--accent)'} 30%, var(--rule-strong))`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 14,
              background: `color-mix(in oklch, ${topic.color_hex ?? 'var(--accent)'} 22%, var(--paper))`,
              color: topic.color_hex ?? 'var(--accent)',
              flex: 'none',
            }}
          >
            <Bell size={24} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {t('hub_subscribe_eyebrow')}
            </div>
            <h2
              id="topic-subscribe-title"
              className="serif"
              style={{
                margin: 0,
                fontSize: 'clamp(17px, 2vw, 20px)',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--ink)',
                lineHeight: 1.2,
              }}
            >
              {t('hub_subscribe_title', { topic: topicLabel })}
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'var(--ink-2)',
                lineHeight: 1.5,
                maxWidth: 580,
              }}
            >
              {t('hub_subscribe_body', { topic: topicLabel })}
            </p>
          </div>
          <Link
            href="/notifications"
            className="btn-ink"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flex: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {t('hub_subscribe_cta')} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <style>{`
          @media (max-width: 720px) {
            .topic-subscribe-cta {
              grid-template-columns: minmax(0, 1fr) !important;
              gap: 12px !important;
              padding: 18px !important;
            }
            .topic-subscribe-cta > a {
              justify-content: center;
            }
          }
        `}</style>
      </section>

    </article>
  );
}

// ---------------------------------------------------------------------------
// Topic Hub helper cards
// ---------------------------------------------------------------------------

function TopicLastVoteCard({
  vote,
  locale,
  label,
  emptyLabel,
}: {
  vote: Vote | null;
  locale: string;
  label: string;
  emptyLabel: string;
}) {
  if (!vote) {
    return (
      <div
        style={{
          padding: '16px 18px',
          borderRadius: 12,
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
          fontSize: 13,
          color: 'var(--ink-3)',
          minHeight: 130,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div className="eyebrow">{label}</div>
        <p style={{ margin: 0 }}>{emptyLabel}</p>
      </div>
    );
  }
  const subject = vote.description?.trim() || vote.title;
  const voteDate = new Date(vote.voted_at);
  const dateLabel = voteDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });
  const resultLabel =
    vote.result === 'approved'
      ? locale === 'es'
        ? 'Aprobada'
        : locale === 'en'
          ? 'Approved'
          : 'Aprovada'
      : vote.result === 'rejected'
        ? locale === 'es'
          ? 'Rechazada'
          : locale === 'en'
            ? 'Rejected'
            : 'Rebutjada'
        : locale === 'es'
          ? 'Empate'
          : locale === 'en'
            ? 'Tie'
            : 'Empat';
  return (
    <Link
      href={`/votes/${vote.id}`}
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper)',
        minHeight: 130,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span className="eyebrow">{label}</span>
        <span
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-3)' }}
        >
          {dateLabel}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.4,
          color: 'var(--ink)',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 3,
          overflow: 'hidden',
        }}
      >
        {subject}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ResultPill result={vote.result} label={resultLabel} />
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {vote.ayes} · {vote.noes} · {vote.abstentions}
        </span>
      </div>
    </Link>
  );
}

function TopicNextAgendaCard({
  item,
  label,
  emptyLabel,
}: {
  item: ScheduledAgendaItem | null;
  label: string;
  emptyLabel: string;
}) {
  if (!item) {
    return (
      <div
        style={{
          padding: '16px 18px',
          borderRadius: 12,
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
          fontSize: 13,
          color: 'var(--ink-3)',
          minHeight: 130,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div className="eyebrow">{label}</div>
        <p style={{ margin: 0 }}>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper)',
        minHeight: 130,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div className="eyebrow">{label}</div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.4,
          color: 'var(--ink)',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 3,
          overflow: 'hidden',
        }}
      >
        {item.subject}
      </div>
      {(item.kind || item.proposing_group) && (
        <div
          style={{
            marginTop: 'auto',
            fontSize: 11,
            color: 'var(--ink-3)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {item.kind && <span>{item.kind}</span>}
          {item.kind && item.proposing_group && <span aria-hidden="true">·</span>}
          {item.proposing_group && <span>{item.proposing_group}</span>}
        </div>
      )}
    </div>
  );
}

function NewsRow({
  item,
  locale,
  isFirst,
}: {
  item: TopicNewsItem;
  locale: string;
  isFirst: boolean;
}) {
  // Format the publication timestamp as "12 may" (or "12 May" / "12 may.")
  // — short enough to sit on the same row as the title without truncating
  // it. Falls back to "" when the source omitted the field.
  let dateLabel = '';
  if (item.published_at) {
    const d = new Date(item.published_at);
    if (!Number.isNaN(d.getTime())) {
      dateLabel = d
        .toLocaleDateString(locale, { day: 'numeric', month: 'short' })
        .replace(/\.$/, '');
    }
  }
  return (
    <li
      style={{
        borderTop: isFirst ? 'none' : '1px solid var(--rule)',
        minWidth: 0,
      }}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 12,
          padding: '12px 14px',
          textDecoration: 'none',
          color: 'inherit',
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-3)',
            flex: 'none',
          }}
        >
          <Newspaper size={14} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              color: 'var(--ink)',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {item.title}
          </div>
          {(item.source || dateLabel) && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 3,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {item.source && <span>{item.source}</span>}
              {item.source && dateLabel && <span aria-hidden="true">·</span>}
              {dateLabel && (
                <span className="tabular">{dateLabel}</span>
              )}
            </div>
          )}
        </div>
        <ExternalLink
          size={14}
          aria-hidden="true"
          style={{ color: 'var(--ink-3)', flex: 'none' }}
        />
      </a>
    </li>
  );
}

function InitiativeRow({
  initiative,
  parsed,
  locale,
  tStats,
  governmentLabel,
  moreGroupsLabel,
}: {
  initiative: Initiative;
  parsed: ParsedProposer;
  locale: string;
  tStats: Awaited<ReturnType<typeof getTranslations<'stats'>>>;
  governmentLabel: string;
  moreGroupsLabel: (n: number) => string;
}) {
  const submittedDate = initiative.submitted_at
    ? new Date(initiative.submitted_at)
    : null;
  const isCurrentYear = submittedDate
    ? submittedDate.getFullYear() === new Date().getFullYear()
    : false;
  const shortDate = submittedDate
    ? submittedDate
        .toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          ...(isCurrentYear ? {} : { year: '2-digit' }),
        })
        .replace(/\.$/, '')
    : '—';
  const longDate = submittedDate
    ? submittedDate.toLocaleDateString(locale, { dateStyle: 'medium' })
    : '—';
  const plainSummary = pickPlainSummary(initiative, locale);
  const statusKey = STATUS_KEY[initiative.status];
  const statusLabel = statusKey ? tStats(statusKey) : initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';
  const linkHref = `/initiatives/${initiative.id}`;
  return (
    <li style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
      <a
        href={linkHref}
        className="initiative-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          padding: '14px 0 0',
          display: 'grid',
          gap: 14,
          // Mobile default: 2 cols [subject | right-stack(date+status)].
          // Desktop swaps to [date | subject] via the `.initiative-row`
          // override in globals.css — the left date span unhides via
          // `hidden sm:inline-block` and the right stack hides via
          // `sm:hidden`.
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'baseline',
        }}
      >
        <span
          className="hidden sm:inline-block tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {longDate}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            {/* Wrap Senate / lectura única / convalidación in tooltips
                inline so users get the definition where the jargon sits. */}
            <AnnotatedText text={initiative.title_original} />
          </div>
          {/* Meta line — ``[proposer-badges] · type · status``. Status is
              hidden on mobile (it lives in the right-stack instead) and
              shown on desktop. The desktop status badge column was merged
              into this line previously; mobile pulls it back out so the
              title gets the full row width. */}
          <div
            className="initiative-row__meta"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {(parsed.isGovernment || parsed.groups.length > 0 || parsed.raw !== '') && (
              <>
                <ProposerBadges
                  parsed={parsed}
                  governmentLabel={governmentLabel}
                  moreGroupsLabel={moreGroupsLabel}
                  rawFallback={initiative.submitted_by ?? ''}
                />
                <span aria-hidden="true">·</span>
              </>
            )}
            <LawTypeChip type={initiative.type} />
            {/* Inline "explain" icon; panel drops full-width beneath. */}
            {plainSummary && (
              <LawSummaryPanel summary={plainSummary} provider={initiative.plain_summary_provider} />
            )}
          </div>
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, display: 'inline-block' }}
          >
            {initiative.official_id}
          </span>
        </div>
        {/* Right column — status badge (its own cell so it never wraps
            the meta line). On mobile it also carries the compressed date
            on top; on desktop the date lives in the left column, so that
            part is hidden. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 6,
            textAlign: 'right',
            flex: 'none',
          }}
        >
          <span
            className="tabular sm:hidden"
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            XV · {shortDate}
          </span>
          <span
            className="badge"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: statusColor,
              borderColor: 'color-mix(in oklch, currentColor 35%, var(--paper))',
              whiteSpace: 'nowrap',
            }}
          >
            {statusLabel}
          </span>
        </div>
      </a>
    </li>
  );
}

const MAX_BADGES = 3;

/**
 * Render the proposer of an initiative as one or more :file:`GroupBadge`s
 * plus the group's short name (no "GP " prefix). Government-sponsored
 * initiatives render as a neutral grey disc labelled "Govern" / "Gobierno"
 * / "Government" depending on the active locale.
 *
 * When the parser couldn't resolve any known group (rare — usually
 * truly-novel free-text), we fall back to the raw string passed through
 * :file:`ProposerEllipsis` so we never silently drop a non-empty value.
 */
function ProposerBadges({
  parsed,
  governmentLabel,
  moreGroupsLabel,
  rawFallback,
}: {
  parsed: ParsedProposer;
  governmentLabel: string;
  moreGroupsLabel: (n: number) => string;
  rawFallback: string;
}) {
  if (parsed.isGovernment) {
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 600,
          color: 'var(--ink-2)',
          background: 'var(--paper-2)',
          borderColor: 'var(--rule-strong)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#9ca3af',
          }}
        />
        {governmentLabel}
      </span>
    );
  }

  if (parsed.groups.length === 0) {
    // Unknown / unparseable. Surface the raw text rather than nothing.
    if (rawFallback.trim() === '') return null;
    return <ProposerEllipsis text={rawFallback} />;
  }

  const visible = parsed.groups.slice(0, MAX_BADGES);
  const overflow = parsed.groups.length - visible.length;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      {visible.map((g, i) => (
        <span
          key={g.slug}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
          }}
        >
          <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} />
          {/* Only show the readable name for the first 1-2 badges to keep
              co-signed proposals visually compact. The badge's letters
              already convey identity for the rest. */}
          {i < 2 && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink-2)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 110,
              }}
            >
              {displayGroupShort(g.name_short)}
            </span>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="badge"
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--ink-2)',
            background: 'var(--paper-2)',
          }}
        >
          {moreGroupsLabel(overflow)}
        </span>
      )}
    </span>
  );
}
