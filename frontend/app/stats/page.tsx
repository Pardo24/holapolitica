import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { CoincidenceMatrix } from '@/components/CoincidenceMatrix';
import { GroupBadge } from '@/components/GroupBadge';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { ShareButton } from '@/components/ShareButton';
import { SummaryHover } from '@/components/SummaryHover';
import { Tooltip } from '@/components/Tooltip';
import {
  api,
  type CoincidenceCell,
  type CrossTopicGroup,
  type GroupActivity,
  type GroupProposalCount,
  type GroupSummaryRow,
  type InitiativeMini,
  type ParliamentaryGroupSummary,
  type ProposerCount,
  type StatsSummary,
  type TopicCount,
  type TopicGlobalStat,
  type TopicProposers,
  type TopicVoteStat,
} from '@/lib/api';
import { glossaryShort } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';
import { buildHighlights, type Highlight } from '@/lib/highlights';

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};
const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovades',
  rejected: 'Rebutjades',
  in_debate: 'En tràmit',
  submitted: 'Presentades',
  withdrawn: 'Retirades',
  expired: 'Caducades',
};
const TYPE_LABEL: Record<string, string> = {
  proyecto_ley: 'Projecte de Llei',
  proposicion_ley: 'Proposició de Llei',
  proposicion_no_ley: 'Proposició no de Llei',
  real_decreto_ley: 'Reial Decret-llei',
  reforma_estatuto: 'Reforma d\'Estatut',
  mocion: 'Moció',
  interpelacion: 'Interpel·lació',
  other: 'Altra',
};

interface SearchParams {
  topic?: string;
  group?: string;
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
  const hasTopic = selectedTopic !== 'all';
  const hasGroup = selectedGroup !== 'all';
  const bothFilters = hasTopic && hasGroup;
  const anyFilter = hasTopic || hasGroup;

  // Data fetching — global stats are always loaded since the collapsible
  // section needs them on demand without a second round trip. The
  // filter-scoped fetches stay conditional so unused branches don't pay.
  const [summary, byType, byStatus, , proposingGroups, topics, groupSummary, allTopics, allGroups, coincidence] =
    await Promise.all([
      api.stats.summary(),
      api.stats.initiativesByType(),
      api.stats.initiativesByStatus(),
      api.stats.votesByResult(),
      api.stats.votesByProposingGroup(),
      api.stats.topicsGlobal(),
      api.metrics.groupSummary(1).catch(() => [] as GroupSummaryRow[]),
      api.topics.list(),
      api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
      api.metrics.coincidence(1).catch(() => [] as CoincidenceCell[]),
    ]);

  // Filter-scoped fetches. When BOTH filters are set we use the single
  // cross endpoint instead of calling the two narrower endpoints (one
  // round trip, all-groups symmetry, joint initiative list included).
  const [groupActivity, topicProposers, cross] = await Promise.all([
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
  ]);

  // Highlights carousel: same as before — buildHighlights is symmetric
  // across groups; we then filter to the active selection so the carousel
  // only rotates relevant cards (per CLAUDE.md "regla de simetria" we
  // never hide a group from the underlying dataset, just from the carousel).
  const topicStatsPerGroup = await Promise.all(
    allGroups.map((g) =>
      api.groups
        .topicStats(g.slug)
        .then((rows) => [g.slug, rows] as const)
        .catch(() => [g.slug, [] as TopicVoteStat[]] as const),
    ),
  );
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
  const focusedTopicName =
    focusedTopic?.topic_name_ca ??
    allTopics.find((tt) => tt.slug === selectedTopic)?.name_ca ??
    selectedTopic;
  const focusedGroup =
    allGroups.find((g) => g.slug === selectedGroup) ?? null;
  const focusedGroupName = focusedGroup
    ? displayGroupShort(focusedGroup.name_short)
    : selectedGroup;

  // KPI numbers reflect the current filter scope. We always show the strip
  // because the numbers are the page's anchor regardless of mode.
  const kpi = computeKpis({
    summary,
    focusedTopic,
    selectedGroup: hasGroup ? selectedGroup : null,
    groupActivity,
    cross,
    proposingGroups,
  });

  // "Nothing matches" guard — only triggered when BOTH filters set and
  // the cross endpoint returned zero joint initiatives.
  const isEmpty =
    bothFilters &&
    !!cross &&
    cross.joint_initiatives_total === 0;

  return (
    <div>
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
          <div className="eyebrow">{t('eyebrow')}</div>
          <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
            {t('title')}
          </h1>
          <p
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
        <ShareButton
          url={buildShareUrl(selectedTopic, selectedGroup)}
          title="Estadístiques · Hola Política"
          text="Estadístiques agregades del Congrés dels Diputats."
          size="sm"
        />
      </header>

      {/* Global filter bar — server-side GET form. Always visible right
          below the header so users can adjust scope at any time. */}
      <FilterBar
        topics={allTopics.map((tt) => ({ slug: tt.slug, name: tt.name_ca }))}
        groups={allGroups}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
      />

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
          <Link href="/stats" style={{ color: 'var(--ink)' }}>
            ← torna a la vista global
          </Link>
        </div>
      )}

      {/* KPI strip — scoped by topic/group when filters are set */}
      <KpiStrip kpi={kpi} locale={locale} />

      {/*
       * ─── Filtered insights come FIRST when any filter is active so they
       * are the top thing the user sees. The collapsible global view ships
       * just below (collapsed by default in that case). With no filter we
       * skip the filtered branch entirely and show the global view open.
       */}

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
            })}
          >
            <ApprovalRateWidget
              topic={focusedTopic}
              fallbackName={focusedTopicName}
              locale={locale}
            />
          </Section>

          {/* Section 2: two columns of bar charts. */}
          <Section
            title="Encreuament tema × grup"
            subtitle={`Com es distribueixen les iniciatives quan creuem ${focusedTopicName} amb ${focusedGroupName}. Mantenim tots els grups visibles per simetria.`}
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
            <JointInitiativeList items={cross.joint_initiatives} />
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
            })}
          >
            <ApprovalRateWidget
              topic={focusedTopic}
              fallbackName={focusedTopicName}
              locale={locale}
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
              />
            </Section>
          )}
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
              })}
            >
              <GroupActivityPanel
                data={groupActivity}
                groupSlug={selectedGroup}
                currentTopic={null}
              />
            </Section>
          )}

          <Section
            title={t('group_voting_patterns', { group: focusedGroupName })}
            subtitle={t('group_voting_patterns_caption')}
          >
            <HighlightsCarousel items={highlights} />
          </Section>
        </>
      )}

      {/*
       * Collapsible global atlas. Always present; open by default when no
       * filter is set so it acts as the page's main view, closed when any
       * filter is active so the filtered insights above are the focus.
       */}
      <CollapsibleGlobalView
        open={!anyFilter}
        labelOpen={t('global_view_open_hint')}
        labelClosed={t('global_view_closed_hint')}
        title={t('global_view')}
      >
        {/* Highlights live inside the global view so they don't crowd the
            filtered insights above. With a filter the highlights are
            already echoed in the per-group "Patrons de vot" section. */}
        {!anyFilter && (
          <Section
            title="Destacats per grup parlamentari"
            subtitle="Per cada grup, el tema on dóna més suport i el tema on rebutja més. Rotem entre tots els grups per igual — sense rànquing global. Mínim 5 vots emesos per tema."
          >
            <HighlightsCarousel items={highlights} />
          </Section>
        )}

        {!hasTopic && (
          <Section
            title="Iniciatives · explorador per tema"
            chips={renderChips({
              topic: hasTopic ? selectedTopic : null,
              group: hasGroup ? selectedGroup : null,
              allTopics,
              allGroups,
            })}
          >
            <TopicExplorer
              topics={topics}
              allTopics={allTopics.map((tt) => ({ slug: tt.slug, name: tt.name_ca }))}
              selectedTopic={selectedTopic}
              selectedGroup={selectedGroup}
              focusedTopic={focusedTopic}
              locale={locale}
            />
          </Section>
        )}

        <Section title="Distribució global">
          <div
            className="stats-twocol"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 32,
              paddingTop: 12,
            }}
          >
            <DonutPanel
              label="Iniciatives per estat"
              items={byStatus.map((r) => ({
                label: STATUS_LABEL[r.status] ?? r.status,
                count: r.count,
                color: STATUS_COLOR[r.status] ?? 'var(--nv)',
              }))}
            />
            <DonutPanel
              label="Iniciatives per tipus"
              items={byType.map((r, i) => ({
                label: TYPE_LABEL[r.type] ?? r.type,
                count: r.count,
                color: TYPE_COLORS[i % TYPE_COLORS.length] ?? 'var(--accent)',
              }))}
            />
          </div>
        </Section>

        <Section
          title="Votacions per grup proposant"
          subtitle="Quantes votacions sortides al ple ha proposat cada grup parlamentari (PNL, Mocions). No s'inclouen els projectes de llei del Govern."
        >
          <VerticalBars
            rows={proposingGroups}
            highlightSlug={hasGroup ? selectedGroup : null}
          />
        </Section>

        <Section
          title="Coincidència entre grups"
          subtitle="% de votacions on cada parella de grups ha votat el mateix sentit (Sí, No o Abstenció). Mostra els patrons de bloc naturals — sense judici."
        >
          <CoincidenceMatrix
            groups={allGroups}
            cells={coincidence}
            highlightSlug={hasGroup ? selectedGroup : null}
          />
        </Section>

        <Section title="Resum per grup parlamentari">
          <GroupSummaryGrid
            rows={groupSummary}
            highlightSlug={hasGroup ? selectedGroup : null}
          />
        </Section>
      </CollapsibleGlobalView>

      <style>{`
        @media (max-width: 860px) {
          .stats-twocol { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const TYPE_COLORS = [
  'var(--accent)',
  'var(--aye)',
  'var(--no)',
  'var(--abst)',
  'var(--gp-junts)',
  'var(--gp-pnv)',
  'var(--nv)',
];

interface Kpi {
  initiatives_total: number;
  votes_total: number;
  initiatives_classified: number;
  scope_label: string;
}

function KpiStrip({ kpi, locale }: { kpi: Kpi; locale: string }) {
  const classifiedPct =
    kpi.initiatives_total > 0
      ? Math.round((kpi.initiatives_classified / kpi.initiatives_total) * 100)
      : null;
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div className="kpi">
        <span className="label">Iniciatives</span>
        <span className="value tabular">
          {kpi.initiatives_total.toLocaleString(locale)}
        </span>
        <span className="sub">{kpi.scope_label}</span>
      </div>
      <div className="kpi">
        <span className="label">Votacions ingerides</span>
        <span className="value tabular">
          {kpi.votes_total.toLocaleString(locale)}
        </span>
        <span className="sub">al ple</span>
      </div>
      <div className="kpi">
        <span className="label">Classificades</span>
        <span className="value tabular">
          {classifiedPct == null ? '—' : `${classifiedPct}%`}
        </span>
        <span className="sub">
          {kpi.initiatives_classified.toLocaleString(locale)} /{' '}
          {kpi.initiatives_total.toLocaleString(locale)}
        </span>
      </div>
    </section>
  );
}

// ─── Collapsible "Visió global" wrapper ────────────────────────────────────

/** A <details> wrapper that exposes the global atlas without forcing scroll
 *  when filtered insights are present above. ``open`` only sets the initial
 *  state; the user can toggle freely once the page loads. */
function CollapsibleGlobalView({
  open,
  title,
  labelOpen,
  labelClosed,
  children,
}: {
  open: boolean;
  title: string;
  labelOpen: string;
  labelClosed: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      style={{
        marginTop: 28,
        borderTop: '1px solid var(--ink)',
        paddingTop: 18,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '4px 0 8px',
        }}
      >
        <span className="eyebrow">{title}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {open ? labelOpen : labelClosed}
        </span>
      </summary>
      <div>{children}</div>
    </details>
  );
}

// ─── Filter bar + chips ────────────────────────────────────────────────────

function FilterBar({
  topics,
  groups,
  selectedTopic,
  selectedGroup,
}: {
  topics: { slug: string; name: string }[];
  groups: ParliamentaryGroupSummary[];
  selectedTopic: string;
  selectedGroup: string;
}) {
  const hasAny = selectedTopic !== 'all' || selectedGroup !== 'all';
  return (
    <details
      open
      className="stats-filter"
      style={{
        marginTop: 18,
        marginBottom: 4,
      }}
    >
      <summary
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          cursor: 'pointer',
          padding: '6px 0',
          listStyle: 'none',
        }}
      >
        Filtres {hasAny ? '· actius' : ''}
      </summary>
      <form
        method="GET"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '10px 14px',
          border: '1px solid var(--rule)',
          background: 'var(--paper-2)',
          borderRadius: 12,
        }}
      >
        <label style={selectStyle.label}>
          Tema:
          <select name="topic" defaultValue={selectedTopic} style={selectStyle.input}>
            <option value="all">Tots els temes</option>
            {topics.map((tt) => (
              <option key={tt.slug} value={tt.slug}>
                {tt.name}
              </option>
            ))}
          </select>
        </label>
        <label style={selectStyle.label}>
          Grup:
          <select name="group" defaultValue={selectedGroup} style={selectStyle.input}>
            <option value="all">Tots els grups</option>
            {groups.map((g) => (
              <option key={g.slug} value={g.slug}>
                {displayGroupShort(g.name_short)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-ink btn-sm">
          Aplica
        </button>
        {hasAny && (
          <Link
            href="/stats"
            style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}
          >
            × Neteja filtres
          </Link>
        )}
      </form>
    </details>
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

interface ChipDescriptor {
  label: string;
  href: string;
}

function renderChips({
  topic,
  group,
  allTopics,
  allGroups,
}: {
  topic: string | null;
  group: string | null;
  allTopics: { slug: string; name_ca: string }[];
  allGroups: ParliamentaryGroupSummary[];
}): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  if (topic) {
    const tt = allTopics.find((x) => x.slug === topic);
    chips.push({
      label: `Tema: ${tt?.name_ca ?? topic}`,
      href: group ? `/stats?group=${encodeURIComponent(group)}` : '/stats',
    });
  }
  if (group) {
    const g = allGroups.find((gg) => gg.slug === group);
    chips.push({
      label: `Grup: ${g ? displayGroupShort(g.name_short) : group}`,
      href: topic ? `/stats?topic=${encodeURIComponent(topic)}` : '/stats',
    });
  }
  return chips;
}

function Chips({ chips }: { chips: ChipDescriptor[] }) {
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
          title="Treu aquest filtre"
        >
          × {c.label}
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

function buildShareUrl(topic: string, group: string): string {
  const qs = new URLSearchParams();
  if (topic !== 'all') qs.set('topic', topic);
  if (group !== 'all') qs.set('group', group);
  return qs.toString() ? `/stats?${qs.toString()}` : '/stats';
}

/** Compute the KPI numbers for the current filter scope.
 *
 *  When BOTH filters are active we prefer the cross endpoint's joint
 *  count for the "Iniciatives" figure (precise intersection). Single
 *  filter falls back to the existing approximations.
 */
function computeKpis({
  summary,
  focusedTopic,
  selectedGroup,
  groupActivity,
  cross,
  proposingGroups,
}: {
  summary: StatsSummary;
  focusedTopic: TopicGlobalStat | null;
  selectedGroup: string | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  proposingGroups: GroupProposalCount[];
}): Kpi {
  let initiatives = summary.initiatives_total;
  let votes = summary.votes_total;
  let classified = summary.initiatives_classified;
  const scopeBits: string[] = [];

  if (cross) {
    // Both filters: precise joint count.
    initiatives = cross.joint_initiatives_total;
    classified = cross.joint_initiatives_total;
    scopeBits.push(`Tema · ${cross.topic.name_ca}`);
    scopeBits.push(`Grup · ${displayGroupShort(cross.group.name_short)}`);
  } else {
    if (focusedTopic) {
      initiatives = focusedTopic.initiatives_total;
      classified = focusedTopic.initiatives_total;
      scopeBits.push(`Tema · ${focusedTopic.topic_name_ca}`);
    }
    if (selectedGroup) {
      if (groupActivity) {
        const sum = groupActivity.topic_distribution.reduce((a, r) => a + r.count, 0);
        if (sum > 0) initiatives = sum;
      }
      const proposing = proposingGroups.find((p) => p.slug === selectedGroup);
      if (proposing) votes = proposing.count;
      scopeBits.push(`Grup · ${selectedGroup}`);
    }
  }
  if (scopeBits.length === 0) scopeBits.push('XV legislatura');

  return {
    initiatives_total: initiatives,
    votes_total: votes,
    initiatives_classified: classified,
    scope_label: scopeBits.join(' · '),
  };
}

function Section({
  title,
  subtitle,
  chips,
  children,
}: {
  title: string;
  subtitle?: string;
  chips?: ChipDescriptor[];
  children: React.ReactNode;
}) {
  return (
    <section style={{ paddingTop: 32, borderTop: '1px solid var(--rule)', marginTop: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {chips && chips.length > 0 && <Chips chips={chips} />}
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
function ApprovalRateWidget({
  topic,
  fallbackName,
  locale,
  scopeLabel,
}: {
  topic: TopicGlobalStat | null;
  fallbackName: string;
  locale: string;
  scopeLabel?: string;
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
            {scopeLabel ?? (topic ? 'Tema seleccionat' : 'Visió global')}
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
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 400 }}>iniciatives</span>
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
              term="Índex d'aprovació"
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
            de {denom} amb resultat
          </div>
        </div>
        <ApprovalBar approved={summed.approved} rejected={summed.rejected} />
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
          { label: STATUS_LABEL.approved, n: summed.approved, color: 'var(--aye)' },
          { label: STATUS_LABEL.rejected, n: summed.rejected, color: 'var(--no)' },
          { label: STATUS_LABEL.in_debate, n: summed.in_debate, color: 'var(--accent)' },
          { label: 'Altres', n: summed.other, color: 'var(--nv)' },
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

// ─── 2. Interactive topic explorer (no-filter view only) ───────────────────

function TopicExplorer({
  topics,
  allTopics,
  selectedTopic,
  selectedGroup,
  focusedTopic,
  locale,
}: {
  topics: TopicGlobalStat[];
  allTopics: { slug: string; name: string }[];
  selectedTopic: string;
  selectedGroup: string;
  focusedTopic: TopicGlobalStat | null;
  locale: string;
}) {
  // When called from the no-filter branch we always show the aggregate
  // ("Visió global"). The form lets users jump into a topic which then
  // triggers the filtered layout above.
  const total = topics.reduce((acc, r) => acc + r.initiatives_total, 0);
  const aggregate: TopicGlobalStat = focusedTopic ?? {
    topic_slug: 'all',
    topic_name_ca: 'Visió global',
    topic_color_hex: null,
    initiatives_total: total,
    initiatives_approved: topics.reduce((a, r) => a + r.initiatives_approved, 0),
    initiatives_rejected: topics.reduce((a, r) => a + r.initiatives_rejected, 0),
    initiatives_in_debate: topics.reduce((a, r) => a + r.initiatives_in_debate, 0),
    initiatives_other: topics.reduce((a, r) => a + r.initiatives_other, 0),
  };

  return (
    <div>
      <form
        method="GET"
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        {selectedGroup !== 'all' && (
          <input type="hidden" name="group" value={selectedGroup} />
        )}
        <label
          style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          Tema:
          <select
            name="topic"
            defaultValue={selectedTopic}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--ink)',
              background: 'var(--paper)',
              fontSize: 13,
              fontFamily: 'inherit',
              color: 'var(--ink)',
              minWidth: 180,
            }}
          >
            <option value="all">Tots els temes</option>
            {allTopics.map((tt) => (
              <option key={tt.slug} value={tt.slug}>
                {tt.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-ink btn-sm">
          Filtra
        </button>
        {selectedTopic !== 'all' && (
          <Link
            href={`/topics/${selectedTopic}`}
            style={{ fontSize: 12, color: 'var(--ink)', marginLeft: 'auto' }}
          >
            Detall del tema →
          </Link>
        )}
      </form>

      <ApprovalRateWidget
        topic={focusedTopic ?? aggregate}
        fallbackName="Visió global"
        locale={locale}
        scopeLabel={focusedTopic ? 'Tema seleccionat' : 'Tots els temes'}
      />

      <div
        style={{
          marginTop: 18,
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <span>
          Pots veure el detall complet de cada tema a{' '}
          <Link href="/topics" style={{ color: 'var(--ink)' }}>
            /temes
          </Link>
          .
        </span>
        <Tooltip
          term="d'on vénen les dades"
          explanation={glossaryShort('data_source')}
        />
      </div>
    </div>
  );
}

function ApprovalBar({ approved, rejected }: { approved: number; rejected: number }) {
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
        <span style={{ color: 'var(--aye)' }}>✓ {approved} aprovades</span>
        <span style={{ color: 'var(--no)' }}>✗ {rejected} rebutjades</span>
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
  items: { label: string; count: number; color: string }[];
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
              key={item.label}
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

function VerticalBars({
  rows,
  highlightSlug,
}: {
  rows: GroupProposalCount[];
  highlightSlug?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Cap proposta enregistrada amb grup proposant.
      </p>
    );
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  return (
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
      {sorted.map((r) => {
        const heightPct = (r.count / max) * 100;
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
}: {
  rows: ProposerCount[];
  highlightSlug: string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        Cap dada registrada.
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
              {r.slug === 'government' ? 'Govern' : displayGroupShort(r.name_short)}
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
}: {
  rows: TopicCount[];
  highlightSlug: string;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        Aquest grup encara no té iniciatives classificades.
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

// ─── 5. Group summary grid ─────────────────────────────────────────────────

function GroupSummaryGrid({
  rows,
  highlightSlug,
}: {
  rows: GroupSummaryRow[];
  highlightSlug?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Encara no hi ha prou dades per al resum per grup.
      </p>
    );
  }
  const maxMembers = Math.max(...rows.map((r) => r.members_active), 1);
  const ordered = highlightSlug
    ? [
        ...rows.filter((r) => r.group_slug === highlightSlug),
        ...rows.filter((r) => r.group_slug !== highlightSlug),
      ]
    : rows;
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 14,
      }}
    >
      {ordered.map((row) => (
        <GroupSummaryCard
          key={row.group_slug}
          row={row}
          maxMembers={maxMembers}
          highlighted={row.group_slug === highlightSlug}
        />
      ))}
    </ul>
  );
}

function GroupSummaryCard({
  row,
  maxMembers,
  highlighted = false,
}: {
  row: GroupSummaryRow;
  maxMembers: number;
  highlighted?: boolean;
}) {
  const cohesionPct = row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
  const attendancePct =
    row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
  return (
    <li>
      <Link
        href={`/groups/${row.group_slug}`}
        style={{
          display: 'block',
          padding: 16,
          background: highlighted ? 'var(--paper)' : 'var(--paper-2)',
          border: highlighted ? '2px solid var(--ink)' : '1px solid var(--rule)',
          borderRadius: 12,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <GroupBadge slug={row.group_slug} color={row.group_color_hex} size="sm" link={false} />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 }}>
            {displayGroupShort(row.group_name_short)}
          </span>
          <span className="tabular" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {row.members_active}
          </span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>
            Membres a la cambra
          </div>
          <div
            style={{
              height: 8,
              background: 'var(--paper-3)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(row.members_active / maxMembers) * 100}%`,
                height: '100%',
                background: row.group_color_hex ?? 'var(--ink-3)',
                opacity: 0.9,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <DonutPct
            value={cohesionPct}
            label={<Tooltip term="Cohesió" explanation={glossaryShort('cohesion')} />}
            color="var(--ink)"
          />
          <DonutPct
            value={attendancePct}
            label={<Tooltip term="Assist." explanation={glossaryShort('attendance')} />}
            color="var(--accent)"
          />
        </div>
      </Link>
    </li>
  );
}

function DonutPct({
  value,
  label,
  color,
}: {
  value: number | null;
  label: React.ReactNode;
  color: string;
}) {
  const r = 24;
  const c = 30;
  const sw = 6;
  const C = 2 * Math.PI * r;
  const dash = value == null ? 0 : (value / 100) * C;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={2 * c} height={2 * c} viewBox={`0 0 ${2 * c} ${2 * c}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--paper-3)" strokeWidth={sw} />
        {value != null && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={`${dash} ${C - dash}`}
            transform={`rotate(-90 ${c} ${c})`}
            strokeLinecap="round"
          />
        )}
        <text
          x={c}
          y={c + 4}
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill="var(--ink)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value == null ? '—' : `${value}%`}
        </text>
      </svg>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

// ─── Per-topic proposers and per-group activity panels ─────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  approved: { label: 'Aprovada', color: 'var(--aye)' },
  rejected: { label: 'Rebutjada', color: 'var(--no)' },
  in_debate: { label: 'En tràmit', color: 'var(--accent)' },
  submitted: { label: 'Presentada', color: 'var(--accent)' },
  withdrawn: { label: 'Retirada', color: 'var(--nv)' },
  expired: { label: 'Caducada', color: 'var(--nv)' },
};

function TopicProposersPanel({
  data,
  topicSlug,
  highlightGroup,
}: {
  data: TopicProposers;
  topicSlug: string;
  highlightGroup: string | null;
}) {
  if (data.top_proposers.length === 0 && data.recent_initiatives.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Encara no hi ha iniciatives classificades en aquest tema.
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
        <h4 style={panelTitle}>Top proposants</h4>
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
                    'Govern'
                  ) : (
                    <Link
                      href={`/stats?topic=${encodeURIComponent(topicSlug)}&group=${encodeURIComponent(p.slug)}` as Route}
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
        <h4 style={panelTitle}>Iniciatives recents</h4>
        <InitiativeList items={data.recent_initiatives} />
      </div>
    </div>
  );
}

function GroupActivityPanel({
  data,
  groupSlug,
  currentTopic,
}: {
  data: GroupActivity;
  groupSlug: string;
  currentTopic: string | null;
}) {
  if (data.recent_initiatives.length === 0 && data.topic_distribution.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Encara no hi ha iniciatives recents d&apos;aquest grup.
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
        <h4 style={panelTitle}>Temes dominants</h4>
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
                  href={`/stats?topic=${encodeURIComponent(tt.topic_slug)}&group=${encodeURIComponent(groupSlug)}` as Route}
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
        <h4 style={panelTitle}>Iniciatives recents</h4>
        <InitiativeList items={data.recent_initiatives} />
      </div>
    </div>
  );
}

function InitiativeList({ items }: { items: InitiativeMini[] }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cap iniciativa recent.</p>;
  }
  return (
    <ul style={listReset}>
      {items.map((ini) => {
        const badge = STATUS_BADGE[ini.status] ?? { label: ini.status, color: 'var(--ink-3)' };
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
              <Link
                href={`/votes?q=${encodeURIComponent(ini.official_id)}` as Route}
                style={{ color: 'var(--ink)', textDecoration: 'none' }}
              >
                {ini.title_ca ?? ini.title_original}
              </Link>
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
function JointInitiativeList({ items }: { items: InitiativeMini[] }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cap iniciativa.</p>;
  }
  return (
    <ul style={listReset}>
      {items.map((ini) => {
        const badge = STATUS_BADGE[ini.status] ?? { label: ini.status, color: 'var(--ink-3)' };
        const type = TYPE_LABEL[ini.type] ?? ini.type;
        return (
          <li
            key={ini.id}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--rule)',
              fontSize: 13,
              display: 'grid',
              gridTemplateColumns: '90px 100px 1fr auto',
              gap: 10,
              alignItems: 'baseline',
            }}
            className="joint-row"
          >
            <span
              className="tabular"
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                whiteSpace: 'nowrap',
              }}
            >
              {ini.submitted_at ?? '—'}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={type}
            >
              {type}
            </span>
            <span style={{ minWidth: 0 }}>
              <SummaryHover
                summary={ini.plain_summary_ca}
                provider={ini.plain_summary_provider}
              >
                <Link
                  href={`/votes?q=${encodeURIComponent(ini.official_id)}` as Route}
                  style={{ color: 'var(--ink)', textDecoration: 'none' }}
                >
                  {ini.title_ca ?? ini.title_original}
                </Link>
              </SummaryHover>
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
              }}
            >
              {badge.label}
            </span>
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
