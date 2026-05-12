import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { ProposerEllipsis } from '@/components/ProposerEllipsis';
import { SummaryHover } from '@/components/SummaryHover';
import { TopicGroupFilter } from '@/components/TopicGroupFilter';
import { Tooltip } from '@/components/Tooltip';
import {
  api,
  ApiError,
  type Initiative,
  type ParliamentaryGroupSummary,
  type ScheduledAgendaItem,
  type Topic,
} from '@/lib/api';
import { glossaryShort, pickPlainSummary, typeLabelCa } from '@/lib/glossary';
import { displayGroupShort, parseProposer, type ParsedProposer } from '@/lib/groups';

interface Params {
  slug: string;
}

interface SearchParams {
  subset?: string;
  group?: string;
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

type Subset = 'pending' | 'voted';

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

  // URL-bound UI state. Both default to safe values so a bare URL still
  // renders sensibly, and bookmarks / shareable links round-trip cleanly.
  const subset: Subset = sp.subset === 'voted' ? 'voted' : 'pending';
  const groupFilter = (sp.group ?? '').trim();

  let topic: Topic;
  try {
    topic = await api.topics.get(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [initiatives, upcomingAgenda, topicGlobals, groups] = await Promise.all([
    api.topics.initiatives(slug, { legislature_id: 1 }),
    api.agenda.itemsByTopic(slug).catch(() => [] as ScheduledAgendaItem[]),
    api.stats.topicsGlobal().catch(() => []),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
  ]);

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

  const pendingAll = initiatives.filter((i) => PENDING_STATUSES.has(i.status));
  const votedAll = initiatives.filter((i) => VOTED_STATUSES.has(i.status));
  const otherTerminal = initiatives.filter(
    (i) => !PENDING_STATUSES.has(i.status) && !VOTED_STATUSES.has(i.status),
  );
  const pending = pendingAll.filter(matchesGroupFilter);
  const voted = votedAll.filter(matchesGroupFilter);

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
  const activeList = subset === 'voted' ? voted : pending;
  const totalForSubset = subset === 'voted' ? votedAll.length : pendingAll.length;
  const emptyNoFilter = subset === 'voted' ? t('no_votes_yet') : t('no_pending_in_topic');
  const emptyWithFilter =
    subset === 'voted' ? t('no_voted_with_filter') : t('no_pending_with_filter');

  // Build a URL-builder for the subset segmented control. Preserves the
  // current `?group=` so flipping subset doesn't drop the filter.
  const buildSubsetHref = (s: Subset): Route => {
    const qs = new URLSearchParams();
    qs.set('subset', s);
    if (groupFilter) qs.set('group', groupFilter);
    return `/topics/${slug}?${qs.toString()}` as Route;
  };
  const clearGroupHref: Route =
    (subset === 'voted'
      ? `/topics/${slug}?subset=voted`
      : `/topics/${slug}`) as Route;

  return (
    <article>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/topics" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_topics')}
        </Link>
        {' / '}
        <span style={{ color: 'var(--ink)' }}>{topic.name_ca}</span>
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
        <div className="eyebrow">{t('topic_eyebrow')}</div>
        <h1
          className="h-display"
          style={{ margin: '6px 0 4px', fontSize: 'clamp(32px, 4.4vw, 48px)' }}
        >
          {topic.name_ca}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
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
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t('initiatives_section_title')}
        </div>

        {/* Segmented buttons: per votar / votades. URL-driven so it works
            without client JS and is shareable. */}
        <div
          role="tablist"
          aria-label={t('subset_tablist_aria')}
          style={{
            display: 'inline-flex',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            padding: 2,
            background: 'var(--paper-2)',
            marginTop: 4,
            marginBottom: 14,
          }}
        >
          {(
            [
              { key: 'pending' as const, label: t('subset_pending'), count: pendingAll.length },
              { key: 'voted' as const, label: t('subset_voted'), count: votedAll.length },
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
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  fontSize: 13,
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
                    fontSize: 11,
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
          labels={{
            label: t('filter_group_label'),
            placeholder: t('filter_group_placeholder'),
            clearLabel: t('filter_group_clear'),
            ariaLabel: t('filter_group_label'),
            governmentLabel: t('proposer_government_label'),
            countLabel: t('filter_results_count', { count: activeList.length }),
            totalLabel: t('filter_results_count', { count: totalForSubset }),
            clearCta: t('clear_filter_cta'),
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
            {groupFilter ? emptyWithFilter : emptyNoFilter}
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
                {subset === 'pending'
                  ? t('more_via_api', { count: activeList.length - 30 })
                  : t('more_initiatives', { count: activeList.length - 30 })}
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Terminal but not voted: withdrawn / expired — group filter still
          applies, hidden entirely if there's nothing to show. */}
      {otherTerminal.length > 0 && (() => {
        const filteredTerminal = otherTerminal.filter(matchesGroupFilter);
        if (filteredTerminal.length === 0) return null;
        return (
          <section style={{ paddingTop: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {t('withdrawn_expired_title')}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {filteredTerminal.slice(0, 20).map((i) => (
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
            </ul>
          </section>
        );
      })()}
    </article>
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
  const typeLabel = typeLabelCa(initiative.type);
  const plainSummary = pickPlainSummary(initiative, locale);
  const statusKey = STATUS_KEY[initiative.status];
  const statusLabel = statusKey ? tStats(statusKey) : initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';
  const linkHref = initiative.source_url ?? '#';
  const isExternal = !!initiative.source_url;
  return (
    <li>
      <a
        href={linkHref}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="initiative-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          borderBottom: '1px solid var(--rule)',
          padding: '14px 0',
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'minmax(56px, max-content) minmax(0, 1fr)',
          alignItems: 'baseline',
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span className="sm:hidden">{shortDate}</span>
          <span className="hidden sm:inline">{longDate}</span>
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            <SummaryHover
              summary={plainSummary}
              fallback={initiative.summary ?? undefined}
              provider={initiative.plain_summary_provider}
              visibleText={initiative.title_original}
            >
              {/* Wrap Senate / lectura única / convalidación in tooltips
                  inline so users get the definition where the jargon sits. */}
              <AnnotatedText text={initiative.title_original} />
            </SummaryHover>
          </div>
          {/* Single attribution line — ``[proposer-badges] · type · status``.
              Lives BELOW the title at every viewport size; the previous
              setup had this row in two places (desktop above, mobile below)
              which read as duplicated metadata. The desktop status badge
              column has been merged into this line so the row reads as one
              factual record per initiative. */}
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
            <span>
              <GlossaryTerm term={typeLabel}>{typeLabel}</GlossaryTerm>
            </span>
            <span aria-hidden="true">·</span>
            <span style={{ color: statusColor, fontWeight: 600 }}>
              {statusLabel}
            </span>
          </div>
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, display: 'inline-block' }}
          >
            {initiative.official_id}
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
