import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, BarChart3, X } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { CoincidenceMatrix } from '@/components/CoincidenceMatrix';
import { CoincidenceProgressive } from '@/components/CoincidenceProgressive';
import { GroupCombobox } from '@/components/GroupCombobox';
import { GroupSummaryCarousel } from '@/components/GroupSummaryCarousel';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { LawSummaryPanel } from '@/components/LawSummaryPanel';
import { LawTypeChip } from '@/components/LawTypeChip';
import { MobileStatsDashboard } from '@/components/MobileStatsDashboard';
import { StatsPie, type StatsPieLabels } from '@/components/StatsPie';
import { SummaryHover } from '@/components/SummaryHover';
import { TopicCombobox } from '@/components/TopicCombobox';
import { Tooltip } from '@/components/Tooltip';
import {
  api,
  type CoincidenceCell,
  type CrossTopicGroup,
  type GroupActivity,
  type GroupProposalCount,
  type GroupSummaryRow,
  type InitiativeMini,
  type InitiativeType,
  type ParliamentaryGroupSummary,
  type ProposerCount,
  type StatsSummary,
  type Topic,
  type TopicCount,
  type TopicGlobalStat,
  type TopicProposers,
  type TopicVoteStat,
} from '@/lib/api';
import { GlossaryTerm } from '@/components/GlossaryTerm';
import { glossaryShort, pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';
import { buildHighlights, type Highlight } from '@/lib/highlights';
import { pickTopicDescription, pickTopicName, resolveTopicName } from '@/lib/topics';

// Status color mapping retained because individual sections / fallback
// labels still reference it; PLURAL_KEY / TYPE_KEY tables were used only
// by the donut panels which the StatsPie now replaces.
const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};
const STATUS_SINGULAR_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

type TabKey = 'overview' | 'filtered';

// ISR window for the /stats route. The Vercel edge caches the rendered
// HTML for this many seconds; subsequent visits get served from the CDN
// without waiting for the backend round-trip. Matches the aggregate
// fetch revalidate so the cache layers refresh in step.
export const revalidate = 300;

interface SearchParams {
  topic?: string;
  group?: string;
  tab?: string;
  /** Mobile-only widget 4 picker state — kept in URL for share/bookmark.
   *  Desktop layout ignores these. */
  pair_a?: string;
  pair_b?: string;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('stats');
  const locale = await getLocale();
  const params = await searchParams;
  const selectedTopic = params.topic ?? 'all';
  const selectedGroup = params.group ?? 'all';
  // Mobile dashboard pair-picker state (widget 4). Stored as URL params so
  // the user can share or bookmark a configured pair. Desktop layout
  // ignores these.
  const pairA = params.pair_a ?? '';
  const pairB = params.pair_b ?? '';
  const hasTopic = selectedTopic !== 'all';
  const hasGroup = selectedGroup !== 'all';
  const bothFilters = hasTopic && hasGroup;
  const anyFilter = hasTopic || hasGroup;

  // Tab resolution:
  //   - explicit ?tab=overview|filtered wins
  //   - otherwise: if any filter is set, default to "filtered"; else "overview"
  // This way a deep link with ?group=X or ?topic=Y lands on the filtered
  // analysis tab, and a bare /stats lands on the overview, per the spec.
  const explicitTab: TabKey | null =
    params.tab === 'overview' || params.tab === 'filtered'
      ? (params.tab as TabKey)
      : null;
  const activeTab: TabKey =
    explicitTab ?? (anyFilter ? 'filtered' : 'overview');

  // Data fetching — every read is kicked off in PARALLEL up front so the
  // page renders as soon as the slowest single response lands. Previously
  // the page had three sequential ``await Promise.all`` blocks, which
  // serialised ~450ms of network time. By chaining the dependent fetches
  // through their own promises (the highlights fan-out needs the resolved
  // ``allGroups`` list, so we chain it via ``.then``), the runtime can
  // overlap every request with every other request.
  //
  // Filter-scoped reads stay conditional: when no filter is set, the
  // ``Promise.resolve(null)`` shorthands cost nothing.
  const allGroupsPromise = api.groups
    .list()
    .catch(() => [] as ParliamentaryGroupSummary[]);
  const topicStatsPerGroupPromise = allGroupsPromise.then((gs) =>
    Promise.all(
      gs.map((g) =>
        api.groups
          .topicStats(g.slug)
          .then((rows) => [g.slug, rows] as const)
          .catch(() => [g.slug, [] as TopicVoteStat[]] as const),
      ),
    ),
  );

  const [
    summary,
    byStatus,
    proposingGroups,
    topics,
    groupSummary,
    allTopics,
    allGroups,
    coincidence,
    groupActivity,
    topicProposers,
    cross,
    topicStatsPerGroup,
  ] = await Promise.all([
    api.stats.summary(),
    api.stats.initiativesByStatus(),
    api.stats.votesByProposingGroup(),
    api.stats.topicsGlobal(),
    api.metrics.groupSummary(1).catch(() => [] as GroupSummaryRow[]),
    api.topics.list(),
    allGroupsPromise,
    api.metrics.coincidence(1).catch(() => [] as CoincidenceCell[]),
    hasGroup && !bothFilters
      ? api.stats
          .byGroup(selectedGroup, 1)
          .catch(() => ({ recent_initiatives: [], topic_distribution: [] } satisfies GroupActivity))
      : Promise.resolve<GroupActivity | null>(null),
    hasTopic && !bothFilters
      ? api.stats
          .byTopicProposers(selectedTopic, 1)
          .catch(() => ({ top_proposers: [], recent_initiatives: [] } satisfies TopicProposers))
      : Promise.resolve<TopicProposers | null>(null),
    bothFilters
      ? api.stats.crossTopicGroup(selectedTopic, selectedGroup, 1).catch(() => null)
      : Promise.resolve<CrossTopicGroup | null>(null),
    topicStatsPerGroupPromise,
  ]);

  // Highlights carousel: ``buildHighlights`` is symmetric across groups;
  // we then filter to the active selection so the carousel only rotates
  // relevant cards (per CLAUDE.md "regla de simetria" we never hide a
  // group from the underlying dataset, just from the carousel).
  const topicStatsByGroup = new Map(topicStatsPerGroup);
  const allHighlights = buildHighlights(allGroups, topicStatsByGroup);
  const highlights: Highlight[] = filterHighlights(allHighlights, {
    topic: hasTopic ? selectedTopic : null,
    group: hasGroup ? selectedGroup : null,
  });

  // Names resolved up-front for translated section titles/captions.
  const focusedTopic = hasTopic
    ? topics.find((tt) => tt.topic_slug === selectedTopic) ?? null
    : null;
  // Prefer the localised name from the full Topic catalogue (which
  // carries name_es / name_en); fall back to the metric row's
  // Catalan-only name and finally the bare slug.
  const focusedFullTopic = allTopics.find((tt) => tt.slug === selectedTopic);
  const focusedTopicName =
    (focusedFullTopic && pickTopicName(focusedFullTopic, locale)) ||
    focusedTopic?.topic_name_ca ||
    selectedTopic;
  const focusedGroup =
    allGroups.find((g) => g.slug === selectedGroup) ?? null;
  const focusedGroupName = focusedGroup
    ? displayGroupShort(focusedGroup.name_short)
    : selectedGroup;
  // Row used by the "group only" cohesion + attendance panel.
  const focusedGroupSummary = hasGroup
    ? groupSummary.find((r) => r.group_slug === selectedGroup) ?? null
    : null;

  // KPI numbers reflect the current filter scope. Cohesion/attendance
  // averages come from groupSummary (cross-group mean when unscoped,
  // single-group value when a group is selected).
  const kpi = computeKpis({
    summary,
    focusedTopic,
    focusedTopicName,
    selectedGroup: hasGroup ? selectedGroup : null,
    groupActivity,
    cross,
    proposingGroups,
    groupSummary,
    t,
  });

  // "Nothing matches" guard — only triggered when BOTH filters set and
  // the cross endpoint returned zero joint initiatives.
  const isEmpty =
    bothFilters &&
    !!cross &&
    cross.joint_initiatives_total === 0;

  // slug → plain-language topic description for the pie's click-to-explain
  // panel. Built from the full topic list (which carries descriptions);
  // the pie itself only receives the lighter TopicGlobalStat rows.
  const topicDescriptions: Record<string, string> = {};
  for (const tp of allTopics) {
    const d = pickTopicDescription(tp, locale);
    if (d) topicDescriptions[tp.slug] = d;
  }

  return (
    <div style={{ maxWidth: 1060, marginInline: 'auto' }}>
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 18,
          borderBottom: '1px solid var(--ink)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1
              className="h-headline"
              style={{ margin: 0, display: 'inline-flex', alignItems: 'baseline', gap: 12 }}
            >
              <span aria-hidden="true" className="page-header-icon-tile">
                <BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span>{t('title')}</span>
            </h1>
            <span
              className="eyebrow"
              style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
            >
              {t('eyebrow')}
            </span>
          </div>
          {/* Page intro paragraph — desktop only. The mobile dashboard
              below this header opens straight onto the KPI grid + filters,
              which is what a phone user came for. Keeping the 2-3 sentence
              setup paragraph on mobile pushes the data below the fold. */}
          <p
            className="hidden sm:block"
            style={{
              fontSize: 13,
              color: 'var(--ink-3)',
              marginTop: 6,
              maxWidth: 760,
            }}
          >
            {t('intro')}
          </p>
        </div>
        {/* Top-right big-number — total votes registered. Hidden on mobile
            (the mobile dashboard already surfaces the same figure inline)
            and only on the overview tab where the legacy KPIs are gone. */}
        {activeTab === 'overview' && (
          <div
            className="hidden sm:flex"
            style={{
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
              minWidth: 0,
            }}
          >
            <span
              className="serif tabular"
              style={{
                fontSize: 44,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {summary.votes_total.toLocaleString(locale)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {t('votes_registered_caption')}
            </span>
          </div>
        )}
      </header>

      {/* Mobile-only dashboard (≤640px). Same data, denser layout — every
          key signal visible without scrolling through paragraphs. Hidden on
          ≥sm so the existing tabbed layout below survives unchanged. */}
      <MobileStatsDashboard
        allTopics={allTopics}
        allGroups={allGroups}
        topics={topics}
        byStatus={byStatus}
        topicProposers={topicProposers}
        groupActivity={groupActivity}
        cross={cross}
        coincidence={coincidence}
        topicStatsByGroup={topicStatsByGroup}
        groupSummary={groupSummary}
        summary={summary}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
        pairA={pairA}
        pairB={pairB}
        locale={locale}
      />

      {/* Desktop tabbed layout — hidden on mobile, identical to before. */}
      <div className="hidden sm:block">
      {/* Tabs — top-level page navigation. Server-rendered Links so the
          tab state survives reloads and can be deep-linked. Switching tab
          preserves the currently selected filters so context isn't lost. */}
      <Tabs
        active={activeTab}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
        labels={{
          overview: t('tab_overview'),
          filtered: t('tab_filtered'),
        }}
        ariaLabel={t('tablist_aria')}
      />

      {activeTab === 'overview' && (
        <>
          {/* Per-party first: each group's cohesion + attendance. This is what
              the page is about — parties, not headline totals. One card per
              group, all shown for symmetry. */}
          {groupSummary.length > 0 && (
            <Section
              title={t('group_summary_title')}
              subtitle={t('group_summary_subtitle')}
            >
              <GroupSummaryCarousel rows={groupSummary} highlightSlug={null} />
            </Section>
          )}

          {/* The party comparator — who votes with whom. */}
          <Section
            title={
              <>
                <GlossaryTerm term="Coincidència">Coincidència</GlossaryTerm>{' '}
                {t('coincidence_between_suffix')}
              </>
            }
            subtitle={t('coincidence_overview_subtitle')}
          >
            <CoincidenceProgressive groups={allGroups} cells={coincidence}>
              <CoincidenceMatrix
                groups={allGroups}
                cells={coincidence}
                highlightSlug={null}
              />
            </CoincidenceProgressive>
          </Section>

          {/* Global breakdown last — the headline totals matter less than the
              per-party and per-topic views above. Interactive: switch between
              status, proposing groups and topics. Desktop only (the mobile
              dashboard owns that view). */}
          <Section title={t('pie_title')} subtitle={t('pie_subtitle')}>
            <div className="hidden sm:block">
              <StatsPie
                byStatus={byStatus}
                proposingGroups={proposingGroups}
                topics={topics}
                labels={statsPieLabels(t)}
                topicDescriptions={topicDescriptions}
                explainHint={t('pie_explain_hint')}
              />
            </div>
          </Section>

          {/* End-of-overview CTA into the filtered analysis. */}
          <section
            style={{
              marginTop: 40,
              padding: '20px 22px',
              borderRadius: 14,
              background: 'var(--paper-2)',
              border: '1px solid var(--rule-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                className="serif"
                style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}
              >
                {t('more_data_title')}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)', maxWidth: 560, lineHeight: 1.5 }}>
                {t('more_data_body')}
              </p>
            </div>
            <Link
              href={'/stats?tab=filtered' as Route}
              style={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 999,
                background: 'var(--ink)',
                color: 'var(--paper)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {t('more_data_cta')}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        </>
      )}

      {activeTab === 'filtered' && (
        <>
          {/* Fused filter bar — Group + Topic in a single GET form at the
              top of this tab. Replaces the two separate filter sections the
              page used to have. */}
          <FilterBar
            topics={allTopics}
            groups={allGroups}
            selectedTopic={selectedTopic}
            selectedGroup={selectedGroup}
          />

          {!anyFilter && (
            <FilteredTabTopicPicker
              topics={topics}
              allTopics={allTopics}
              locale={locale}
              labels={{
                title: t('pick_topic_title'),
                subtitle: t('pick_topic_subtitle', { tab: t('tab_filtered') }),
                initiativesUnit: (count: number) =>
                  t('pick_topic_initiatives_unit', { count }),
                orGroupPrefix: t('pick_topic_or_group_prefix'),
                orGroupLink: t('pick_topic_or_group_link'),
              }}
            />
          )}

          {isEmpty && (
            <div
              role="status"
              style={{
                marginTop: 20,
                padding: '14px 18px',
                border: '1px solid var(--rule)',
                background: 'var(--paper-2)',
                borderRadius: 12,
                fontSize: 13,
                color: 'var(--ink-3)',
              }}
            >
              {t('joint_initiatives_empty', {
                group: focusedGroupName,
                topic: focusedTopicName,
              })}{' '}
              <Link
                href={'/stats?tab=filtered' as Route}
                style={{ color: 'var(--ink)' }}
              >
                {t('try_other_filter')}
              </Link>
            </div>
          )}

          {anyFilter && <KpiStrip kpi={kpi} locale={locale} labels={kpiLabels(t)} />}

          {bothFilters && cross && !isEmpty && (
            <>
              {/* Section 1: big approval rate widget for the focal topic. */}
              <Section
                title={t('approvals_on_topic', { topic: focusedTopicName })}
                subtitle={t('approvals_on_topic_caption')}
                chips={renderChips({
                  topic: selectedTopic,
                  group: selectedGroup,
                  allTopics,
                  allGroups,
                  t,
                  locale,
                })}
                chipRemoveTitle={t('chip_remove_title')}
              >
                <ApprovalRateWidget
                  topic={focusedTopic}
                  fallbackName={focusedTopicName}
                  locale={locale}
                  labels={approvalRateLabels(t)}
                />
              </Section>

              {/* Section 2: two columns of bar charts. */}
              <Section
                title={t('cross_section_title')}
                subtitle={t('cross_section_subtitle', {
                  topic: focusedTopicName,
                  group: focusedGroupName,
                })}
              >
                <div
                  className="stats-twocol"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 24,
                    paddingTop: 4,
                  }}
                >
                  <CrossCard
                    title={t('initiatives_on_topic_by_group', { topic: focusedTopicName })}
                    caption={t('initiatives_on_topic_by_group_caption', {
                      topic: focusedTopicName,
                      group: focusedGroupName,
                    })}
                  >
                    <HorizontalGroupBars
                      rows={cross.initiatives_on_topic_by_group}
                      highlightSlug={selectedGroup}
                      emptyLabel={t('empty_no_data')}
                      governmentLabel={t('government_label')}
                    />
                  </CrossCard>

                  <CrossCard
                    title={t('topics_for_group', { group: focusedGroupName })}
                    caption={t('topics_for_group_caption', {
                      topic: focusedTopicName,
                      group: focusedGroupName,
                    })}
                  >
                    <HorizontalTopicBars
                      rows={cross.topic_distribution_for_group}
                      highlightSlug={selectedTopic}
                      emptyLabel={t('empty_group_no_classified')}
                    />
                  </CrossCard>
                </div>
              </Section>

              {/* Section 3: joint initiatives list (reverse-chrono). */}
              <Section
                title={t('joint_initiatives_title', {
                  group: focusedGroupName,
                  topic: focusedTopicName,
                })}
                subtitle={t('joint_initiatives_caption', {
                  group: focusedGroupName,
                  topic: focusedTopicName,
                })}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    margin: '0 0 12px',
                  }}
                >
                  {t('joint_initiatives_found', { count: cross.joint_initiatives_total })}
                  {cross.joint_initiatives.length < cross.joint_initiatives_total && (
                    <>
                      {' '}
                      {t('joint_initiatives_truncated', {
                        shown: cross.joint_initiatives.length,
                        total: cross.joint_initiatives_total,
                      })}
                    </>
                  )}
                </p>
                <JointInitiativeList
                  items={cross.joint_initiatives}
                  locale={locale}
                  statusLabels={statusSingularLabels(t)}
                  emptyLabel={t('empty_no_initiative')}
                />
              </Section>
            </>
          )}

          {/* Single-filter case: topic only. */}
          {hasTopic && !bothFilters && (
            <>
              <Section
                title={t('approvals_on_topic', { topic: focusedTopicName })}
                subtitle={t('approvals_on_topic_caption')}
                chips={renderChips({
                  topic: selectedTopic,
                  group: null,
                  allTopics,
                  allGroups,
                  t,
                  locale,
                })}
                chipRemoveTitle={t('chip_remove_title')}
              >
                <ApprovalRateWidget
                  topic={focusedTopic}
                  fallbackName={focusedTopicName}
                  locale={locale}
                  labels={approvalRateLabels(t)}
                />
              </Section>

              {topicProposers && (
                <Section
                  title={t('who_proposes_topic')}
                  subtitle={t('who_proposes_topic_caption')}
                >
                  <TopicProposersPanel
                    data={topicProposers}
                    topicSlug={selectedTopic}
                    highlightGroup={null}
                    locale={locale}
                    labels={{
                      empty: t('empty_no_classified_for_topic'),
                      top_proposers: t('panel_top_proposers'),
                      recent_initiatives: t('panel_recent_initiatives'),
                      government: t('government_label'),
                      no_recent: t('empty_no_recent_initiative'),
                      statusLabels: statusSingularLabels(t),
                    }}
                  />
                </Section>
              )}

              {/* Coincidence matrix shown global (not restricted by topic):
                  we don't have a per-topic coincidence endpoint yet. The
                  caption is explicit about scope so the user isn't misled. */}
              <Section
                title={
                  <>
                    <GlossaryTerm term="Coincidència">Coincidència</GlossaryTerm>{' '}
                    {t('coincidence_between_suffix')}
                  </>
                }
                subtitle={t('coincidence_topic_subtitle')}
              >
                <CoincidenceProgressive groups={allGroups} cells={coincidence}>
                  <CoincidenceMatrix
                    groups={allGroups}
                    cells={coincidence}
                    highlightSlug={null}
                  />
                </CoincidenceProgressive>
              </Section>
            </>
          )}

          {/* Single-filter case: group only. */}
          {hasGroup && !bothFilters && (
            <>
              {groupActivity && (
                <Section
                  title={t('group_activity', { group: focusedGroupName })}
                  subtitle={t('group_activity_caption')}
                  chips={renderChips({
                    topic: null,
                    group: selectedGroup,
                    allTopics,
                    allGroups,
                    t,
                    locale,
                  })}
                  chipRemoveTitle={t('chip_remove_title')}
                >
                  <GroupActivityPanel
                    data={groupActivity}
                    groupSlug={selectedGroup}
                    currentTopic={null}
                    locale={locale}
                    labels={{
                      empty: t('empty_no_recent_for_group'),
                      dominant_topics: t('panel_dominant_topics'),
                      recent_initiatives: t('panel_recent_initiatives'),
                      no_recent: t('empty_no_recent_initiative'),
                      statusLabels: statusSingularLabels(t),
                    }}
                  />
                </Section>
              )}

              {focusedGroupSummary && (
                <Section
                  title={t('cohesion_attendance_title', { group: focusedGroupName })}
                  subtitle={t('cohesion_attendance_subtitle')}
                >
                  <GroupOwnMetrics
                    row={focusedGroupSummary}
                    labels={{
                      cohesion_votes_counted: (count: number) =>
                        t('cohesion_votes_counted', { count }),
                      attendance_members_counted: (count: number) =>
                        t('attendance_members_counted', { count }),
                      members_active: t('members_active_label'),
                      at_consultation: t('at_consultation_moment'),
                    }}
                  />
                </Section>
              )}

              <Section
                title={t('group_voting_patterns', { group: focusedGroupName })}
                subtitle={t('group_voting_patterns_caption')}
              >
                <HighlightsCarousel items={highlights} allTopics={allTopics} />
              </Section>
            </>
          )}
        </>
      )}

      </div>

      <style>{`
        @media (max-width: 860px) {
          .stats-twocol { grid-template-columns: 1fr !important; }
        }
        /* Highlights + Cohesion sit side-by-side on desktop. Use display:flex
           so each child can flex evenly; the row wraps below 900px and the
           cohesion column hides under the sm breakpoint (mobile already has
           its own GroupSummaryCarousel in MobileStatsDashboard). */
        .stats-carousel-row {
          display: flex;
          gap: 14px;
          align-items: stretch;
          flex-wrap: wrap;
          /* Cap the height so these two widgets read as secondary
             support material, not the main act. The interactive pie
             below is the page's focal element. */
          max-height: 220px;
        }
        .stats-carousel-row > div {
          max-height: 220px;
          overflow: hidden;
        }
        @media (max-width: 900px) {
          .stats-carousel-row { flex-direction: column; }
        }
        @media (max-width: 640px) {
          .stats-cohesion-col { display: none; }
        }
        /* StatsPie collapses the side-by-side pie + mode toggle into a
           single column below 900px so the legend below the pie remains
           legible at narrow widths. */
        @media (max-width: 900px) {
          .stats-pie-wrap { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

type StatsT = Awaited<ReturnType<typeof getTranslations<'stats'>>>;

/** Translation bundle for the StatsPie segmented-radio + legend. Built
 *  here so the page-level translations stay co-located with their
 *  consumers. */
function statsPieLabels(t: StatsT): StatsPieLabels {
  return {
    title: t('pie_mode_legend'),
    modeTopic: t('pie_mode_topic'),
    modeGroup: t('pie_mode_group'),
    modeTopicAcceptance: t('pie_mode_topic_acceptance'),
    modeStatus: t('pie_mode_status'),
    modeAria: t('pie_mode_aria'),
    statusApproved: t('status_plural_approved'),
    statusRejected: t('status_plural_rejected'),
    statusInDebate: t('status_plural_in_debate'),
    statusSubmitted: t('status_plural_submitted'),
    statusWithdrawn: t('status_plural_withdrawn'),
    statusExpired: t('status_plural_expired'),
    statusOther: t('status_other_short'),
    initiativesUnit: t('initiatives_unit'),
    emptyMode: t('empty_no_data'),
  };
}

function kpiLabels(t: StatsT): KpiLabels {
  return {
    initiatives: t('kpi_initiatives'),
    votes_ingested: t('kpi_votes_ingested'),
    in_plenary: t('kpi_in_plenary'),
    classified: t('kpi_classified'),
    avg_cohesion: t('kpi_avg_cohesion'),
    avg_attendance: t('kpi_avg_attendance'),
    between_groups: t('kpi_between_groups'),
  };
}

function statusSingularLabels(t: StatsT): Record<string, string> {
  return {
    approved: t('status_singular_approved'),
    rejected: t('status_singular_rejected'),
    in_debate: t('status_singular_in_debate'),
    submitted: t('status_singular_submitted'),
    withdrawn: t('status_singular_withdrawn'),
    expired: t('status_singular_expired'),
  };
}

interface Kpi {
  initiatives_total: number;
  votes_total: number;
  initiatives_classified: number;
  avg_cohesion_pct: number | null;
  avg_attendance_pct: number | null;
  scope_label: string;
}

interface KpiLabels {
  initiatives: string;
  votes_ingested: string;
  in_plenary: string;
  classified: string;
  avg_cohesion: string;
  avg_attendance: string;
  between_groups: string;
}

function KpiStrip({
  kpi,
  locale,
  labels,
}: {
  kpi: Kpi;
  locale: string;
  labels: KpiLabels;
}) {
  const classifiedPct =
    kpi.initiatives_total > 0
      ? Math.round((kpi.initiatives_classified / kpi.initiatives_total) * 100)
      : null;
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div className="kpi">
        <span className="label">{labels.initiatives}</span>
        <span className="value tabular">
          {kpi.initiatives_total.toLocaleString(locale)}
        </span>
        <span className="sub">{kpi.scope_label}</span>
      </div>
      <div className="kpi">
        <span className="label">{labels.votes_ingested}</span>
        <span className="value tabular">
          {kpi.votes_total.toLocaleString(locale)}
        </span>
        <span className="sub">{labels.in_plenary}</span>
      </div>
      <div className="kpi">
        <span className="label">{labels.classified}</span>
        <span className="value tabular">
          {classifiedPct == null ? '—' : `${classifiedPct}%`}
        </span>
        <span className="sub">
          {kpi.initiatives_classified.toLocaleString(locale)} /{' '}
          {kpi.initiatives_total.toLocaleString(locale)}
        </span>
      </div>
      <div className="kpi">
        <span className="label">{labels.avg_cohesion}</span>
        <span className="value tabular">
          {kpi.avg_cohesion_pct == null ? '—' : `${kpi.avg_cohesion_pct}%`}
        </span>
        <span className="sub">{labels.between_groups}</span>
      </div>
      <div className="kpi">
        <span className="label">
          <GlossaryTerm term="Vots emesos">{labels.avg_attendance}</GlossaryTerm>
        </span>
        <span className="value tabular">
          {kpi.avg_attendance_pct == null ? '—' : `${kpi.avg_attendance_pct}%`}
        </span>
        <span className="sub">{labels.between_groups}</span>
      </div>
    </section>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

/** Button-styled radio group rendered as <Link>s. No client JS required —
 *  switching tab is a navigation that re-runs the server component, so the
 *  data fetched matches the active tab. Filters in URL are preserved across
 *  the switch so the user doesn't lose context. */
function Tabs({
  active,
  selectedTopic,
  selectedGroup,
  labels,
  ariaLabel,
}: {
  active: TabKey;
  selectedTopic: string;
  selectedGroup: string;
  labels: Record<TabKey, string>;
  ariaLabel: string;
}) {
  const overviewHref = buildTabHref('overview', selectedTopic, selectedGroup);
  const filteredHref = buildTabHref('filtered', selectedTopic, selectedGroup);
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: 4,
        marginTop: 18,
        marginBottom: 4,
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <TabButton href={overviewHref} active={active === 'overview'}>
        {labels.overview}
      </TabButton>
      <TabButton href={filteredHref} active={active === 'filtered'}>
        {labels.filtered}
      </TabButton>
    </nav>
  );
}

function TabButton({
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
      role="tab"
      aria-selected={active}
      style={{
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        textDecoration: 'none',
        borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
        marginBottom: -1,
        cursor: 'pointer',
      }}
    >
      {children}
    </Link>
  );
}

function buildTabHref(tab: TabKey, topic: string, group: string): Route {
  const qs = new URLSearchParams();
  qs.set('tab', tab);
  if (topic !== 'all') qs.set('topic', topic);
  if (group !== 'all') qs.set('group', group);
  return `/stats?${qs.toString()}` as Route;
}

// ─── Filter bar + chips ────────────────────────────────────────────────────

async function FilterBar({
  topics,
  groups,
  selectedTopic,
  selectedGroup,
}: {
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  selectedTopic: string;
  selectedGroup: string;
}) {
  const t = await getTranslations('stats');
  const tStatsFilter = await getTranslations('stats_filter');
  const hasAny = selectedTopic !== 'all' || selectedGroup !== 'all';
  return (
    <form
      method="GET"
      id="stats-filter-bar"
      className="stats-filter"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '12px 14px',
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        borderRadius: 12,
        marginTop: 18,
        marginBottom: 4,
        scrollMarginTop: 80,
      }}
    >
      {/* Stay on this tab when the form submits. */}
      <input type="hidden" name="tab" value="filtered" />
      <label style={selectStyle.label}>
        {t('filter_topic_label')}
        <TopicCombobox
          name="topic"
          value={selectedTopic}
          topics={topics}
          emptyValue="all"
          clearLabel={tStatsFilter('topic_clear')}
          placeholder={tStatsFilter('topic_placeholder')}
          ariaLabel={t('filter_topic_aria')}
        />
      </label>
      <label style={selectStyle.label}>
        {t('filter_group_label')}
        <GroupCombobox
          name="group"
          value={selectedGroup}
          groups={groups}
          emptyValue="all"
          clearLabel={tStatsFilter('group_clear')}
          placeholder={t('filter_group_placeholder')}
          ariaLabel={t('filter_group_aria')}
        />
      </label>
      <button type="submit" className="btn-ink btn-sm">
        {t('filter_apply')}
      </button>
      {hasAny && (
        <Link
          href={'/stats?tab=filtered' as Route}
          style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}
        >
          {t('clear_filters')}
        </Link>
      )}
    </form>
  );
}

const selectStyle = {
  label: {
    fontSize: 12,
    color: 'var(--ink-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as React.CSSProperties,
  input: {
    padding: '6px 10px',
    border: '1px solid var(--ink)',
    background: 'var(--paper)',
    fontSize: 13,
    fontFamily: 'inherit',
    color: 'var(--ink)',
    minWidth: 160,
  } as React.CSSProperties,
};

/**
 * Empty-state topic picker rendered when the user lands on the
 * "Anàlisi filtrada" tab without a topic or group selected.
 *
 * Replaces the previous prose-only empty state. Each card sets
 * ``?topic=<slug>&tab=filtered`` and preserves the user inside the
 * filtered tab so the analysis renders without an extra click. The
 * count below the name is the running ``initiatives_total`` from the
 * already-fetched topicsGlobal endpoint — no extra round trip.
 *
 * Symmetry: every classified topic is shown. Order matches the
 * ``api.stats.topicsGlobal()`` response (alphabetical-ish from the
 * backend, no editorial rank).
 */
function FilteredTabTopicPicker({
  topics,
  allTopics,
  locale,
  labels,
}: {
  topics: TopicGlobalStat[];
  allTopics: Topic[];
  locale: string;
  labels: {
    title: string;
    subtitle: string;
    initiativesUnit: (count: number) => string;
    orGroupPrefix: string;
    orGroupLink: string;
  };
}) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: '18px 22px',
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--ink)',
          lineHeight: 1.3,
        }}
      >
        {labels.title}
      </h2>
      <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {labels.subtitle}
      </p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '18px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
          gap: 10,
        }}
      >
        {topics.map((topic) => {
          const href =
            `/stats?tab=filtered&topic=${encodeURIComponent(topic.topic_slug)}` as Route;
          return (
            <li key={topic.topic_slug}>
              <Link
                href={href}
                className="topic-pick-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: 'inherit',
                  minHeight: 56,
                  transition: 'border-color .12s ease, background-color .12s ease',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: topic.topic_color_hex ?? 'var(--ink-3)',
                    flex: 'none',
                  }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {resolveTopicName(topic.topic_slug, allTopics, locale, topic.topic_name_ca)}
                  </span>
                  <span
                    className="tabular"
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {labels.initiativesUnit(topic.initiatives_total)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-3)' }}>
        {labels.orGroupPrefix}{' '}
        {/* Group selection lives in the FilterBar above, but a chevron link
            here scrolls the user back to it for discoverability. */}
        <a
          href="#stats-filter-bar"
          style={{ color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {labels.orGroupLink}
        </a>
      </p>
      <style>{`
        .topic-pick-card:hover,
        .topic-pick-card:focus-visible {
          border-color: var(--rule-strong) !important;
          background: var(--paper-2) !important;
          outline: none;
        }
      `}</style>
    </div>
  );
}

interface ChipDescriptor {
  label: string;
  href: string;
}

function renderChips({
  topic,
  group,
  allTopics,
  allGroups,
  t,
  locale,
}: {
  topic: string | null;
  group: string | null;
  allTopics: Topic[];
  allGroups: ParliamentaryGroupSummary[];
  t: StatsT;
  locale: string;
}): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  if (topic) {
    const tt = allTopics.find((x) => x.slug === topic);
    chips.push({
      label: t('chip_topic', { name: tt ? pickTopicName(tt, locale) : topic }),
      href: group
        ? `/stats?tab=filtered&group=${encodeURIComponent(group)}`
        : '/stats?tab=filtered',
    });
  }
  if (group) {
    const g = allGroups.find((gg) => gg.slug === group);
    chips.push({
      label: t('chip_group', { name: g ? displayGroupShort(g.name_short) : group }),
      href: topic
        ? `/stats?tab=filtered&topic=${encodeURIComponent(topic)}`
        : '/stats?tab=filtered',
    });
  }
  return chips;
}

function Chips({
  chips,
  removeTitle,
}: {
  chips: ChipDescriptor[];
  removeTitle: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {chips.map((c) => (
        <Link
          key={c.label}
          href={c.href as Route}
          style={{
            fontSize: 11,
            padding: '3px 8px',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            color: 'var(--ink-2)',
            background: 'var(--paper)',
            textDecoration: 'none',
            lineHeight: 1.4,
          }}
          title={removeTitle}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={12} aria-hidden="true" /> {c.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ─── Filter helpers ────────────────────────────────────────────────────────

function filterHighlights(
  items: Highlight[],
  filters: { topic: string | null; group: string | null },
): Highlight[] {
  if (!filters.topic && !filters.group) return items;
  return items.filter((h) => {
    if (filters.topic && h.topic_slug !== filters.topic) return false;
    if (filters.group && h.group_slug !== filters.group) return false;
    return true;
  });
}

/** Compute the KPI numbers for the current filter scope.
 *
 *  When BOTH filters are active we prefer the cross endpoint's joint
 *  count for the "Iniciatives" figure (precise intersection). Single
 *  filter falls back to the existing approximations. Cohesion and
 *  attendance averages are computed from `groupSummary`: cross-group
 *  mean when unscoped, single-group value when a group is selected.
 */
function computeKpis({
  summary,
  focusedTopic,
  focusedTopicName,
  selectedGroup,
  groupActivity,
  cross,
  proposingGroups,
  groupSummary,
  t,
}: {
  summary: StatsSummary;
  focusedTopic: TopicGlobalStat | null;
  /** Pre-resolved localised name for the focused topic; computed up
   *  the call site where allTopics + locale are in scope. */
  focusedTopicName: string;
  selectedGroup: string | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  proposingGroups: GroupProposalCount[];
  groupSummary: GroupSummaryRow[];
  t: StatsT;
}): Kpi {
  let initiatives = summary.initiatives_total;
  let votes = summary.votes_total;
  let classified = summary.initiatives_classified;
  const scopeBits: string[] = [];

  if (cross) {
    // Both filters: precise joint count.
    initiatives = cross.joint_initiatives_total;
    classified = cross.joint_initiatives_total;
    scopeBits.push(t('scope_topic', { name: focusedTopicName }));
    scopeBits.push(
      t('scope_group', { name: displayGroupShort(cross.group.name_short) }),
    );
  } else {
    if (focusedTopic) {
      initiatives = focusedTopic.initiatives_total;
      classified = focusedTopic.initiatives_total;
      scopeBits.push(t('scope_topic', { name: focusedTopicName }));
    }
    if (selectedGroup) {
      if (groupActivity) {
        const sum = groupActivity.topic_distribution.reduce((a, r) => a + r.count, 0);
        if (sum > 0) initiatives = sum;
      }
      const proposing = proposingGroups.find((p) => p.slug === selectedGroup);
      if (proposing) votes = proposing.count;
      scopeBits.push(t('scope_group', { name: selectedGroup }));
    }
  }
  if (scopeBits.length === 0) scopeBits.push(t('scope_xv_legislature'));

  // Cohesion / attendance averages — single-group when a group is set,
  // else mean across all groups with data.
  let avgCohesionPct: number | null = null;
  let avgAttendancePct: number | null = null;
  if (selectedGroup) {
    const row = groupSummary.find((r) => r.group_slug === selectedGroup);
    if (row) {
      avgCohesionPct =
        row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
      avgAttendancePct =
        row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
    }
  } else {
    avgCohesionPct = meanPct(groupSummary.map((r) => r.avg_cohesion));
    avgAttendancePct = meanPct(groupSummary.map((r) => r.avg_attendance));
  }

  return {
    initiatives_total: initiatives,
    votes_total: votes,
    initiatives_classified: classified,
    avg_cohesion_pct: avgCohesionPct,
    avg_attendance_pct: avgAttendancePct,
    scope_label: scopeBits.join(' · '),
  };
}

function meanPct(values: (number | null)[]): number | null {
  const numbers = values.filter((v): v is number => v != null);
  if (numbers.length === 0) return null;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return Math.round(mean * 100);
}

function Section({
  title,
  subtitle,
  chips,
  chipRemoveTitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: ChipDescriptor[];
  chipRemoveTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ paddingTop: 32, borderTop: '1px solid var(--rule)', marginTop: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {chips && chips.length > 0 && (
        <Chips chips={chips} removeTitle={chipRemoveTitle ?? ''} />
      )}
      {subtitle && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 0, marginBottom: 12, maxWidth: 760 }}>
          {subtitle}
        </p>
      )}
      {children}
    </section>
  );
}

// ─── Approval rate widget — extracted from TopicExplorer ───────────────────

/** Big approval-rate panel for a single topic (or "all topics" when null).
 *  Reused both inside TopicExplorer (no-filter case) and as a standalone
 *  hero block when a topic filter is active. */
interface ApprovalRateLabels {
  topic_selected: string;
  global_view: string;
  initiatives: string;
  approval_rate: string;
  of_decided: (denom: number) => string;
  count_approved: (n: number) => string;
  count_rejected: (n: number) => string;
  status_approved: string;
  status_rejected: string;
  status_in_debate: string;
  status_other: string;
}

function approvalRateLabels(t: StatsT): ApprovalRateLabels {
  return {
    topic_selected: t('topic_selected'),
    global_view: t('global_view'),
    initiatives: t('initiatives_unit'),
    approval_rate: t('approval_rate_label'),
    of_decided: (denom: number) => t('approval_of_decided', { denom }),
    count_approved: (n: number) => t('approval_count_approved', { n }),
    count_rejected: (n: number) => t('approval_count_rejected', { n }),
    status_approved: t('status_plural_approved'),
    status_rejected: t('status_plural_rejected'),
    status_in_debate: t('status_plural_in_debate'),
    status_other: t('status_other_short'),
  };
}

function ApprovalRateWidget({
  topic,
  fallbackName,
  locale,
  scopeLabel,
  labels,
}: {
  topic: TopicGlobalStat | null;
  fallbackName: string;
  locale: string;
  scopeLabel?: string;
  labels: ApprovalRateLabels;
}) {
  const summed = topic
    ? {
        approved: topic.initiatives_approved,
        rejected: topic.initiatives_rejected,
        in_debate: topic.initiatives_in_debate,
        other: topic.initiatives_other,
        total: topic.initiatives_total,
      }
    : {
        approved: 0,
        rejected: 0,
        in_debate: 0,
        other: 0,
        total: 0,
      };
  const denom = summed.approved + summed.rejected;
  const approvalRate = denom > 0 ? Math.round((summed.approved / denom) * 100) : null;
  return (
    <div
      style={{
        padding: '20px 22px',
        borderRadius: 14,
        border: '1px solid var(--ink)',
        background: 'var(--paper-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>
            {scopeLabel ?? (topic ? labels.topic_selected : labels.global_view)}
          </div>
          <h3
            className="serif"
            style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}
          >
            {topic?.topic_name_ca ?? fallbackName}
          </h3>
        </div>
        <div className="tabular" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {summed.total.toLocaleString(locale)}{' '}
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 400 }}>{labels.initiatives}</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          alignItems: 'center',
          gap: 18,
          padding: '14px 0',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
          marginBottom: 14,
        }}
        className="approval-grid"
      >
        <div>
          <div className="eyebrow" style={{ fontSize: 9 }}>
            <Tooltip
              term={labels.approval_rate}
              explanation={glossaryShort('approval_rate')}
            />
          </div>
          <div
            className="tabular"
            style={{ fontSize: 36, fontWeight: 600, color: 'var(--aye)', letterSpacing: '-0.02em' }}
          >
            {approvalRate == null ? '—' : `${approvalRate}%`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
            {labels.of_decided(denom)}
          </div>
        </div>
        <ApprovalBar
          approved={summed.approved}
          rejected={summed.rejected}
          approvedLabel={labels.count_approved(summed.approved)}
          rejectedLabel={labels.count_rejected(summed.rejected)}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}
        className="topic-explorer-status"
      >
        {[
          { label: labels.status_approved, n: summed.approved, color: 'var(--aye)' },
          { label: labels.status_rejected, n: summed.rejected, color: 'var(--no)' },
          { label: labels.status_in_debate, n: summed.in_debate, color: 'var(--accent)' },
          { label: labels.status_other, n: summed.other, color: 'var(--nv)' },
        ].map((c) => (
          <div key={c.label}>
            <div className="eyebrow" style={{ fontSize: 9 }}>
              {c.label}
            </div>
            <div
              className="tabular"
              style={{ fontSize: 22, fontWeight: 600, color: c.color, letterSpacing: '-0.02em' }}
            >
              {c.n}
            </div>
            <div
              style={{
                height: 4,
                background: c.color,
                width: `${summed.total > 0 ? (c.n / summed.total) * 100 : 0}%`,
                marginTop: 4,
                opacity: 0.85,
              }}
            />
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 720px) {
          .topic-explorer-status { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function ApprovalBar({
  approved,
  rejected,
  approvedLabel,
  rejectedLabel,
}: {
  approved: number;
  rejected: number;
  approvedLabel: string;
  rejectedLabel: string;
}) {
  const total = approved + rejected;
  if (total === 0) {
    return <div style={{ height: 14, background: 'var(--paper-3)', borderRadius: 2 }} />;
  }
  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 14,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'var(--paper-3)',
        }}
      >
        <div style={{ width: `${(approved / total) * 100}%`, background: 'var(--aye)' }} />
        <div style={{ width: `${(rejected / total) * 100}%`, background: 'var(--no)' }} />
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
        <span style={{ color: 'var(--aye)' }}>{approvedLabel}</span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--no)' }}>{rejectedLabel}</span>
      </div>
    </div>
  );
}

// ─── 3. Donut panel ────────────────────────────────────────────────────────

function DonutPanel({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: React.ReactNode; count: number; color: string }[];
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        <Donut items={items} />
        <div style={{ flex: 1, minWidth: 180 }}>
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '12px 1fr auto',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                borderBottom: '1px solid var(--rule)',
                fontSize: 12,
              }}
            >
              <span style={{ width: 10, height: 10, background: item.color, borderRadius: 1 }} />
              <span>{item.label}</span>
              <span className="tabular" style={{ fontWeight: 600 }}>
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Donut({ items }: { items: { count: number; color: string }[] }) {
  const total = items.reduce((acc, b) => acc + b.count, 0);
  if (total === 0) return null;
  let acc = 0;
  const r = 60;
  const c = 70;
  const sw = 20;
  const C = 2 * Math.PI * r;
  return (
    <svg width={2 * c} height={2 * c} viewBox={`0 0 ${2 * c} ${2 * c}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--paper-3)" strokeWidth={sw} />
      {items.map((item, i) => {
        const start = acc / total;
        acc += item.count;
        const len = (item.count / total) * C;
        const off = -start * C;
        return (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={item.color}
            strokeWidth={sw}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={off}
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
      })}
      <text
        x={c}
        y={c - 2}
        textAnchor="middle"
        fontSize="20"
        fontWeight="600"
        fill="var(--ink)"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {total}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" fontSize="9" fill="var(--ink-3)" letterSpacing="0.1em">
        TOTAL
      </text>
    </svg>
  );
}

// ─── 4. Vertical bars ──────────────────────────────────────────────────────

/**
 * Per-group "proposing" bar chart used on /stats Mode A overview.
 *
 * Scale rationale: the distribution is extremely skewed — some groups have
 * 300+ initiatives, others have fewer than 10. On a linear scale, the small
 * groups collapse to invisible 1-pixel stubs that look like data omissions
 * even though they're factual. We therefore size each bar by
 * ``log10(count + 1)`` so small groups remain readable while the larger
 * groups still visibly dominate. The number printed above each bar is the
 * RAW count, never the log — users see the actual figure.
 *
 * The y-axis is intentionally NOT labelled with log ticks: this is a
 * scannable comparator, not an inferential chart, and a numeric label on
 * every bar makes the absolute value unambiguous. The bottom caption tells
 * the user how the heights are scaled.
 *
 * Symmetry: every group with any proposing activity is shown, sorted by
 * count desc. We don't trim, group as "other", or hide anyone.
 */
function VerticalBars({
  rows,
  highlightSlug,
  emptyLabel,
  logScaleCaption,
  countShort,
  countAria,
}: {
  rows: GroupProposalCount[];
  highlightSlug?: string | null;
  emptyLabel: string;
  logScaleCaption: string;
  countShort: (count: number) => string;
  countAria: (name: string, count: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {emptyLabel}
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  // log10(count + 1) — the +1 keeps zero counts at zero height instead of
  // -Infinity, and avoids a log(1)=0 collapse for single-initiative groups.
  const logValues = sorted.map((r) => Math.log10(r.count + 1));
  const maxLog = Math.max(...logValues, Math.log10(2));
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${sorted.length}, 1fr)`,
          gap: 10,
          alignItems: 'end',
          height: 200,
          paddingTop: 30,
          borderBottom: '1px solid var(--ink)',
        }}
        className="vertical-bars"
      >
        {sorted.map((r, i) => {
          const heightPct = (logValues[i]! / maxLog) * 100;
          const isHighlight = highlightSlug != null && r.slug === highlightSlug;
          const dim = highlightSlug != null && !isHighlight;
          return (
            <div
              key={r.slug}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                minWidth: 0,
                position: 'relative',
              }}
            >
              <span
                className="tabular"
                style={{
                  fontSize: 12,
                  fontWeight: isHighlight ? 700 : 600,
                  marginBottom: 4,
                  color: dim ? 'var(--ink-3)' : 'var(--ink)',
                }}
              >
                {r.count}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 60,
                  height: `${heightPct}%`,
                  minHeight: 2,
                  background: r.color_hex ?? 'var(--ink-3)',
                  opacity: dim ? 0.25 : isHighlight ? 1 : 0.9,
                  outline: isHighlight ? '2px solid var(--ink)' : 'none',
                  outlineOffset: 1,
                }}
                title={countShort(r.count)}
                aria-label={countAria(r.name_short, r.count)}
              />
            </div>
          );
        })}
        {sorted.map((r) => (
          <div
            key={`${r.slug}-label`}
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              textAlign: 'center',
              paddingTop: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayGroupShort(r.name_short)}
          </div>
        ))}
      </div>
      <p
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          marginTop: 8,
          marginBottom: 0,
          fontStyle: 'italic',
        }}
      >
        {logScaleCaption}
      </p>
    </>
  );
}

// ─── Single group's own cohesion + attendance card ─────────────────────────

interface GroupOwnLabels {
  cohesion_votes_counted: (count: number) => string;
  attendance_members_counted: (count: number) => string;
  members_active: string;
  at_consultation: string;
}

function GroupOwnMetrics({
  row,
  labels,
}: {
  row: GroupSummaryRow;
  labels: GroupOwnLabels;
}) {
  const cohesionPct = row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
  const attendancePct =
    row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
        gap: 16,
      }}
    >
      <MetricCard
        label={<Tooltip term="Cohesió" explanation={glossaryShort('cohesion')} />}
        value={cohesionPct}
        sub={labels.cohesion_votes_counted(row.cohesion_votes_counted)}
        color={row.group_color_hex ?? 'var(--ink)'}
      />
      <MetricCard
        label={<GlossaryTerm term="Vots emesos">Vots emesos</GlossaryTerm>}
        value={attendancePct}
        sub={labels.attendance_members_counted(row.attendance_member_count)}
        color="var(--accent)"
      />
      <MetricCard
        label={labels.members_active}
        value={row.members_active}
        sub={labels.at_consultation}
        color="var(--ink)"
        isRaw
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
  isRaw = false,
}: {
  label: React.ReactNode;
  value: number | null;
  sub: string;
  color: string;
  isRaw?: boolean;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>{label}</div>
      <div
        className="tabular"
        style={{ fontSize: 28, fontWeight: 600, color, letterSpacing: '-0.02em' }}
      >
        {value == null ? '—' : isRaw ? value : `${value}%`}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ─── Horizontal bar charts for the cross-filter view ───────────────────────

/** Card wrapper used for the two-column cross-filter charts. Keeps title +
 *  caption styling consistent and provides the inner padding. */
function CrossCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: '18px 18px 20px',
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h4
        className="serif"
        style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}
      >
        {title}
      </h4>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>
        {caption}
      </p>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

/** Horizontal bar chart per parliamentary group. Always renders every row
 *  passed in — never hide groups, just dim non-highlighted ones (CLAUDE.md
 *  symmetry rule). Counts appear at the end of each bar. */
function HorizontalGroupBars({
  rows,
  highlightSlug,
  emptyLabel,
  governmentLabel,
}: {
  rows: ProposerCount[];
  highlightSlug: string;
  emptyLabel: string;
  governmentLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul style={listReset}>
      {rows.map((r) => {
        const isHighlight = r.slug === highlightSlug;
        const dim = !isHighlight;
        const widthPct = max === 0 ? 0 : (r.count / max) * 100;
        return (
          <li
            key={r.slug}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 36px',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: dim ? 'var(--ink-3)' : 'var(--ink)',
                fontWeight: isHighlight ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.name_short}
            >
              {r.slug === 'government' ? governmentLabel : displayGroupShort(r.name_short)}
            </span>
            <div
              style={{
                position: 'relative',
                height: 14,
                background: 'var(--paper-3)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: r.color_hex ?? 'var(--ink-3)',
                  opacity: dim ? 0.3 : 1,
                  outline: isHighlight ? '1px solid var(--ink)' : 'none',
                }}
              />
            </div>
            <span
              className="tabular"
              style={{
                textAlign: 'right',
                fontWeight: isHighlight ? 700 : 500,
                color: dim ? 'var(--ink-3)' : 'var(--ink)',
              }}
            >
              {r.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Same shape as HorizontalGroupBars but over topics. We sort desc by count
 *  before rendering so the focal topic appears wherever its true rank is. */
function HorizontalTopicBars({
  rows,
  highlightSlug,
  emptyLabel,
}: {
  rows: TopicCount[];
  highlightSlug: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {emptyLabel}
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  return (
    <ul style={listReset}>
      {sorted.map((r) => {
        const isHighlight = r.topic_slug === highlightSlug;
        const dim = !isHighlight;
        const widthPct = max === 0 ? 0 : (r.count / max) * 100;
        return (
          <li
            key={r.topic_slug}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 36px',
              alignItems: 'center',
              gap: 8,
              padding: '5px 0',
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: dim ? 'var(--ink-3)' : 'var(--ink)',
                fontWeight: isHighlight ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={r.topic_name_ca}
            >
              {r.topic_name_ca}
            </span>
            <div
              style={{
                position: 'relative',
                height: 14,
                background: 'var(--paper-3)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: r.topic_color_hex ?? 'var(--ink-3)',
                  opacity: dim ? 0.3 : 1,
                  outline: isHighlight ? '1px solid var(--ink)' : 'none',
                }}
              />
            </div>
            <span
              className="tabular"
              style={{
                textAlign: 'right',
                fontWeight: isHighlight ? 700 : 500,
                color: dim ? 'var(--ink-3)' : 'var(--ink)',
              }}
            >
              {r.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Per-topic proposers and per-group activity panels ─────────────────────

const STATUS_BADGE_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

interface TopicProposersLabels {
  empty: string;
  top_proposers: string;
  recent_initiatives: string;
  government: string;
  no_recent: string;
  statusLabels: Record<string, string>;
}

function TopicProposersPanel({
  data,
  topicSlug,
  highlightGroup,
  locale,
  labels,
}: {
  data: TopicProposers;
  topicSlug: string;
  highlightGroup: string | null;
  locale: string;
  labels: TopicProposersLabels;
}) {
  if (data.top_proposers.length === 0 && data.recent_initiatives.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {labels.empty}
      </p>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: 24,
      }}
      className="stats-twocol"
    >
      <div>
        <h4 style={panelTitle}>{labels.top_proposers}</h4>
        <ul style={listReset}>
          {data.top_proposers.map((p) => {
            const isMe = highlightGroup === p.slug;
            return (
              <li
                key={p.slug}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '12px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--rule)',
                  fontSize: 13,
                  fontWeight: isMe ? 700 : 500,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: p.color_hex ?? 'var(--ink-3)',
                    borderRadius: 1,
                  }}
                />
                <span>
                  {p.slug === 'government' ? (
                    labels.government
                  ) : (
                    <Link
                      href={`/stats?tab=filtered&topic=${encodeURIComponent(topicSlug)}&group=${encodeURIComponent(p.slug)}` as Route}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {displayGroupShort(p.name_short)}
                    </Link>
                  )}
                </span>
                <span className="tabular">{p.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h4 style={panelTitle}>{labels.recent_initiatives}</h4>
        <InitiativeList
          items={data.recent_initiatives}
          locale={locale}
          emptyLabel={labels.no_recent}
          statusLabels={labels.statusLabels}
        />
      </div>
    </div>
  );
}

interface GroupActivityLabels {
  empty: string;
  dominant_topics: string;
  recent_initiatives: string;
  no_recent: string;
  statusLabels: Record<string, string>;
}

function GroupActivityPanel({
  data,
  groupSlug,
  currentTopic,
  locale,
  labels,
}: {
  data: GroupActivity;
  groupSlug: string;
  currentTopic: string | null;
  locale: string;
  labels: GroupActivityLabels;
}) {
  if (data.recent_initiatives.length === 0 && data.topic_distribution.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {labels.empty}
      </p>
    );
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: 24,
      }}
      className="stats-twocol"
    >
      <div>
        <h4 style={panelTitle}>{labels.dominant_topics}</h4>
        <ul style={listReset}>
          {data.topic_distribution.map((tt) => {
            const isCurrent = currentTopic === tt.topic_slug;
            return (
              <li
                key={tt.topic_slug}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '12px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--rule)',
                  fontSize: 13,
                  fontWeight: isCurrent ? 700 : 500,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: tt.topic_color_hex ?? 'var(--ink-3)',
                    borderRadius: 1,
                  }}
                />
                <Link
                  href={`/stats?tab=filtered&topic=${encodeURIComponent(tt.topic_slug)}&group=${encodeURIComponent(groupSlug)}` as Route}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {tt.topic_name_ca}
                </Link>
                <span className="tabular">{tt.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <h4 style={panelTitle}>{labels.recent_initiatives}</h4>
        <InitiativeList
          items={data.recent_initiatives}
          locale={locale}
          emptyLabel={labels.no_recent}
          statusLabels={labels.statusLabels}
        />
      </div>
    </div>
  );
}

function InitiativeList({
  items,
  locale,
  emptyLabel,
  statusLabels,
}: {
  items: InitiativeMini[];
  locale: string;
  emptyLabel: string;
  statusLabels: Record<string, string>;
}) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</p>;
  }
  return (
    <ul style={listReset}>
      {items.map((ini) => {
        const badge = {
          label: statusLabels[ini.status] ?? ini.status,
          color: STATUS_BADGE_COLOR[ini.status] ?? 'var(--ink-3)',
        };
        const plainSummary = pickPlainSummary(ini, locale);
        return (
          <li
            key={ini.id}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid var(--rule)',
              fontSize: 13,
              display: 'flex',
              gap: 10,
              alignItems: 'baseline',
            }}
          >
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 999,
                background: badge.color,
                color: 'white',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {badge.label}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {/* SummaryHover sits between the visible text and the Link
                  click target — the wrapper renders a span around the
                  children, so wrapping the Link is fine (no nested <a>).
                  When no summary is available it returns the children
                  unchanged, so the link still works without a tooltip. */}
              <SummaryHover
                summary={plainSummary}
                provider={ini.plain_summary_provider}
                visibleText={ini.title_ca ?? ini.title_original}
              >
                <Link
                  href={`/initiatives/${ini.id}` as Route}
                  style={{ color: 'var(--ink)', textDecoration: 'none' }}
                >
                  {/* Inline-annotate Senate / lectura única / convalidación
                      terms in the visible title. AnnotatedText returns the
                      bare string when nothing matches. */}
                  <AnnotatedText text={ini.title_ca ?? ini.title_original} />
                </Link>
              </SummaryHover>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                {ini.official_id}
                {ini.submitted_at && ` · ${ini.submitted_at}`}
              </div>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Cross-filter joint list — same shape as InitiativeList but uses the
// SummaryHover affordance now that the backend returns plain summaries.
function JointInitiativeList({
  items,
  locale,
  statusLabels,
  emptyLabel,
}: {
  items: InitiativeMini[];
  locale: string;
  statusLabels: Record<string, string>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</p>;
  }
  return (
    <ul style={listReset}>
      {items.map((ini) => {
        const badge = {
          label: statusLabels[ini.status] ?? ini.status,
          color: STATUS_BADGE_COLOR[ini.status] ?? 'var(--ink-3)',
        };
        const plainSummary = pickPlainSummary(ini, locale);
        return (
          <li
            key={ini.id}
            style={{ padding: '10px 0 12px', borderBottom: '1px solid var(--rule)' }}
          >
            <div
              className="joint-row"
              style={{
                fontSize: 13,
                display: 'grid',
                gridTemplateColumns: '84px auto minmax(0, 1fr) auto',
                gap: 10,
                alignItems: 'baseline',
              }}
            >
              <span
                className="tabular"
                style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
              >
                {ini.submitted_at ?? '—'}
              </span>
              <span style={{ alignSelf: 'center' }}>
                <LawTypeChip type={ini.type as InitiativeType} />
              </span>
              <span style={{ minWidth: 0 }}>
                <Link
                  href={`/initiatives/${ini.id}` as Route}
                  style={{ color: 'var(--ink)', textDecoration: 'none' }}
                >
                  <AnnotatedText text={ini.title_ca ?? ini.title_original} />
                </Link>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                  {ini.official_id}
                </div>
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: badge.color,
                  color: 'white',
                  whiteSpace: 'nowrap',
                  alignSelf: 'center',
                }}
              >
                {badge.label}
              </span>
            </div>
            {plainSummary && (
              <div style={{ marginTop: 8 }}>
                <LawSummaryPanel summary={plainSummary} provider={ini.plain_summary_provider} />
              </div>
            )}
          </li>
        );
      })}
      <style>{`
        @media (max-width: 720px) {
          .joint-row {
            grid-template-columns: 1fr auto !important;
            gap: 6px !important;
          }
          .joint-row > :nth-child(1),
          .joint-row > :nth-child(2) { grid-column: 1 / -1; }
        }
      `}</style>
    </ul>
  );
}

const panelTitle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  margin: '0 0 8px',
  fontWeight: 600,
};

const listReset: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};
