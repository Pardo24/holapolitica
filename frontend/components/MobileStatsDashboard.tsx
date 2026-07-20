import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronDown, ArrowRight, X } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupSummaryCarousel } from '@/components/GroupSummaryCarousel';
import {
  PairCoincidenceClient,
  PairCoincidenceEyebrow,
} from '@/components/PairCoincidenceClient';
import {
  StatsGroupFilter,
  StatsTopicFilter,
} from '@/components/StatsFilterClient';
import { SummaryHover } from '@/components/SummaryHover';
import { Tooltip } from '@/components/Tooltip';
import type {
  CoincidenceCell,
  CrossTopicGroup,
  GroupActivity,
  GroupSummaryRow,
  InitiativeMini,
  InitiativeStatusCount,
  ParliamentaryGroupSummary,
  ProposerCount,
  StatsSummary,
  Topic,
  TopicGlobalStat,
  TopicProposers,
  TopicVoteStat,
} from '@/lib/api';
import { glossaryShort, pickPlainSummary } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';

/**
 * Mobile-only dashboard for /stats. Shown via ``sm:hidden`` on ≤640px while
 * the desktop tabbed layout is hidden via ``hidden sm:block``. Built as a
 * **dashboard on open**: every key signal visible without scrolling through
 * paragraphs of explanation.
 *
 * The highlights carousel that used to anchor this dashboard now lives on
 * the home page (``app/page.tsx``) — visitors see it before they ever land
 * on /stats. The mobile stats view is now squarely a compact mirror of the
 * desktop /stats: status + proposers, per-group summary cards (cohesion /
 * attendance / size), expandable list, pair coincidence, and per-topic
 * stance columns.
 *
 * State model — URL params only, no useState:
 *   - ``?topic=<slug>``     scope of widgets 1, 2, 4
 *   - ``?pair_a=<slug>``    first picked group in widget 3
 *   - ``?pair_b=<slug>``    second picked group in widget 3
 *
 * URL state is preferred over useState because it lets the user share /
 * bookmark a configured view. The desktop layout already uses the same
 * ``topic`` param, so switching viewport keeps the user's context.
 *
 * Neutrality (CLAUDE.md "regla de simetria"):
 *   - widget 1's proposers shows top N regardless of color; never
 *     "highlight" one group
 *   - the group summary carousel renders every group (members_active desc)
 *   - widget 3 is a symmetric pair — order of selection doesn't change
 *     meaning
 *   - widget 4 ALWAYS shows both the "supports" and "rejects" columns
 *     side by side; neither column can be hidden
 */
export async function MobileStatsDashboard({
  allTopics,
  allGroups,
  topics,
  byStatus,
  topicProposers,
  groupActivity,
  cross,
  coincidence,
  topicStatsByGroup,
  groupSummary,
  summary,
  selectedTopic,
  selectedGroup,
  pairA,
  pairB,
  locale,
}: {
  allTopics: Topic[];
  allGroups: ParliamentaryGroupSummary[];
  topics: TopicGlobalStat[];
  byStatus: InitiativeStatusCount[];
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  coincidence: CoincidenceCell[];
  topicStatsByGroup: Map<string, TopicVoteStat[]>;
  groupSummary: GroupSummaryRow[];
  summary: StatsSummary;
  selectedTopic: string;
  /** Desktop tabbed layout also exposes a ``group`` filter. Mobile
   *  dashboard doesn't manage it directly, but the dashboard's form
   *  submissions preserve it so the user doesn't lose desktop-set
   *  context when toggling viewports. */
  selectedGroup: string;
  pairA: string;
  pairB: string;
  locale: string;
}) {
  const t = await getTranslations('dashboard');
  const hasTopic = selectedTopic !== 'all';
  const focusedTopic = hasTopic
    ? topics.find((tt) => tt.topic_slug === selectedTopic) ?? null
    : null;
  const focusedTopicName =
    focusedTopic?.topic_name_ca ??
    allTopics.find((tt) => tt.slug === selectedTopic)?.name_ca ??
    selectedTopic;
  const hasGroup = selectedGroup !== 'all' && selectedGroup !== '';
  const focusedGroup = hasGroup
    ? allGroups.find((g) => g.slug === selectedGroup) ?? null
    : null;
  const focusedGroupName = focusedGroup
    ? displayGroupShort(focusedGroup.name_short)
    : selectedGroup;

  const statusLabels: Record<string, string> = {
    approved: t('status_approved'),
    rejected: t('status_rejected'),
    in_debate: t('status_in_debate'),
    submitted: t('status_submitted'),
    withdrawn: t('status_withdrawn'),
    expired: t('status_expired'),
    other: t('status_other'),
  };
  const governmentShort = t('government_short');

  return (
    <div className="sm:hidden" style={{ paddingTop: 18 }}>
      {/* Widget order — the per-group cards lead (the page is about the
          parties), then the topic-scoped widgets and the pair comparison:
          1. GroupSummaryCarousel — per-group cohesion + votes emitted.
          2. Topic-scope card: initiatives state + topic filter +
             top proposers, then (when a topic is picked) the "Suport
             vs rebuig per tema" stance columns, then the compact
             3-latest initiatives list with a link to the topic page.
          3. PairCoincidence — between-group comparison.

          Symmetry intact at every step (see PerTopicCoincidenceBody
          and PairCoincidenceWidget docs). */}

      {/* ─── 1. Per-group summary cards (cohesion + attendance) ────── */}
      {groupSummary.length > 0 && (
        <DashSection
          eyebrow={t('group_summary_eyebrow')}
          info={t('group_summary_info')}
        >
          <GroupSummaryCarousel rows={groupSummary} highlightSlug={null} />
        </DashSection>
      )}

      {/* ─── 2. Single bordered card grouping the topic-scoped widgets:
              the global initiatives state + topic filter, the "Suport vs
              rebuig per tema" stance widget (only when a topic is picked)
              and the compact 3-latest initiatives list with a link to the
              topic page. They all share the same scope (the selected
              topic) so visually grouping them under one card makes the
              filter relationship obvious — picking a topic changes the
              other two blocks inside the same card. */}
      <DashSection eyebrow={t('state_eyebrow')} info={t('state_info')}>
        <Card>
          <InitiativesStateBody
            allTopics={allTopics}
            allGroups={allGroups}
            byStatus={byStatus}
            topicProposers={topicProposers}
            groupActivity={groupActivity}
            cross={cross}
            focusedTopic={focusedTopic}
            focusedTopicName={focusedTopicName}
            focusedGroupName={focusedGroupName}
            selectedTopic={selectedTopic}
            selectedGroup={selectedGroup}
            summary={summary}
            locale={locale}
            labels={{
              initiativesPlenary: t('state_initiatives_at_plenary'),
              initiativesOnTopic: (topic: string) =>
                t('state_initiatives_on_topic', { topic }),
              filterByTopic: t('state_filter_by_topic'),
              topicValue: t('state_topic_value'),
              clearTopic: t('state_clear_topic'),
              filterByGroup: t('state_filter_by_group'),
              groupValue: t('state_group_value'),
              clearGroup: t('state_clear_group'),
              topProposersPlenary: t('state_top_proposers_plenary'),
              topProposersTopic: (topic: string) =>
                t('state_top_proposers_topic', { topic }),
              groupProposes: (group: string) =>
                t('state_group_proposes', { group }),
            }}
            statusLabels={statusLabels}
            governmentShort={governmentShort}
          />

          {hasTopic && (
            <PerTopicCoincidenceBody
              allGroups={allGroups}
              topicStatsByGroup={topicStatsByGroup}
              selectedTopic={selectedTopic}
              focusedTopicName={focusedTopicName}
              labels={{
                eyebrow: t('stance_eyebrow'),
                minVotes: t('stance_min_votes'),
                supports: t('stance_supports'),
                rejects: t('stance_rejects'),
                votesEmitted: (count: number) =>
                  t('stance_votes_emitted', { count }),
                backfillEyebrow: t('backfill_eyebrow'),
                backfillBodyTopic: (topic: string) =>
                  t('backfill_body_topic', { topic }),
                backfillBodyNoTopic: t('backfill_body_no_topic'),
              }}
            />
          )}

          {hasTopic && (
            <CompactTopicInitiativesBody
              topicProposers={topicProposers}
              cross={cross}
              selectedTopic={selectedTopic}
              focusedTopicName={focusedTopicName}
              locale={locale}
              labels={{
                eyebrow: t('list_eyebrow'),
                openTopicPage: t('list_open_topic_page'),
              }}
            />
          )}
        </Card>
      </DashSection>

      {/* ─── 3. Coincidence — pair picker (fully client-side state) ── */}
      <DashSection
        eyebrow={<PairCoincidenceEyebrow suffix={t('pair_eyebrow_suffix')} />}
        info={t('pair_info')}
      >
        <Card>
          <PairCoincidenceClient
            allGroups={allGroups}
            coincidence={coincidence}
            initialPairA={pairA}
            initialPairB={pairB}
          />
        </Card>
      </DashSection>

      {/* The long expandable-list widget is intentionally removed:
          when a topic is selected the user already saw the 3 most-
          recent initiatives at widget 2b, and the topic page link
          deep-links to the full filterable browse. Without a topic
          there's no scoped list to show. */}
    </div>
  );
}

// ─── Layout primitive ─────────────────────────────────────────────────────

function DashSection({
  eyebrow,
  title,
  info,
  children,
}: {
  eyebrow: React.ReactNode;
  title?: React.ReactNode;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginBottom: 6,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {eyebrow}
        {info && (
          <Tooltip
            term={
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  border: '1px solid var(--rule-strong)',
                  fontSize: 9,
                  color: 'var(--ink-3)',
                  fontStyle: 'italic',
                  fontWeight: 700,
                }}
              >
                i
              </span>
            }
            explanation={info}
          />
        )}
      </div>
      {title && (
        <h2
          className="serif"
          style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid var(--rule-strong)',
        background: 'var(--paper-2)',
        borderRadius: 14,
      }}
    >
      {children}
    </div>
  );
}

// ─── Widget 2: Iniciatives — estat global + filtres ───────────────────────

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

interface StatusSegment {
  status: string;
  count: number;
  label: string;
  color: string;
}

function buildStatusSegmentsFromTopic(
  topic: TopicGlobalStat,
  statusLabels: Record<string, string>,
): StatusSegment[] {
  // Topic-global breakdown doesn't have separate retired/expired buckets —
  // we lump them into "other" via initiatives_other to keep the bar shape.
  const segs: StatusSegment[] = [
    {
      status: 'approved',
      count: topic.initiatives_approved,
      label: statusLabels.approved!,
      color: STATUS_COLOR.approved!,
    },
    {
      status: 'rejected',
      count: topic.initiatives_rejected,
      label: statusLabels.rejected!,
      color: STATUS_COLOR.rejected!,
    },
    {
      status: 'in_debate',
      count: topic.initiatives_in_debate,
      label: statusLabels.in_debate!,
      color: STATUS_COLOR.in_debate!,
    },
    {
      status: 'other',
      count: topic.initiatives_other,
      label: statusLabels.other!,
      color: 'var(--nv)',
    },
  ];
  return segs.filter((s) => s.count > 0);
}

function buildStatusSegmentsGlobal(
  rows: InitiativeStatusCount[],
  statusLabels: Record<string, string>,
): StatusSegment[] {
  return rows
    .map((r) => ({
      status: r.status,
      count: r.count,
      label: statusLabels[r.status] ?? r.status,
      color: STATUS_COLOR[r.status] ?? 'var(--nv)',
    }))
    .filter((s) => s.count > 0);
}

interface StateLabels {
  initiativesPlenary: string;
  initiativesOnTopic: (topic: string) => string;
  filterByTopic: string;
  topicValue: string;
  clearTopic: string;
  filterByGroup: string;
  groupValue: string;
  clearGroup: string;
  topProposersPlenary: string;
  topProposersTopic: (topic: string) => string;
  groupProposes: (group: string) => string;
}

/** Inline body of the "initiatives state" widget — renders the topic-scoped
 *  big number, status bar, topic filter, and top proposers list. No outer
 *  Card/DashSection chrome: the parent dashboard wraps this together with
 *  the per-topic stance + compact list widgets inside a single shared
 *  bordered card so the user sees them as one topic-scoped group. */
function InitiativesStateBody({
  allTopics,
  allGroups,
  byStatus,
  topicProposers,
  groupActivity,
  cross,
  focusedTopic,
  focusedTopicName,
  focusedGroupName,
  selectedTopic,
  selectedGroup,
  summary,
  locale,
  labels,
  statusLabels,
  governmentShort,
}: {
  allTopics: Topic[];
  allGroups: ParliamentaryGroupSummary[];
  byStatus: InitiativeStatusCount[];
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  focusedTopic: TopicGlobalStat | null;
  focusedTopicName: string;
  focusedGroupName: string;
  selectedTopic: string;
  selectedGroup: string;
  summary: StatsSummary;
  locale: string;
  labels: StateLabels;
  statusLabels: Record<string, string>;
  governmentShort: string;
}) {
  const hasTopic = selectedTopic !== 'all';
  const hasGroup = selectedGroup !== 'all' && selectedGroup !== '';
  // Group-only view: show what the picked group proposes most, by topic.
  // (When a topic is also picked, the cross-scoped proposers below take over.)
  const groupTopics =
    hasGroup && !hasTopic ? (groupActivity?.topic_distribution ?? []).slice(0, 6) : [];
  const maxGroupTopicCount = Math.max(...groupTopics.map((tt) => tt.count), 1);
  const segments: StatusSegment[] = hasTopic
    ? focusedTopic
      ? buildStatusSegmentsFromTopic(focusedTopic, statusLabels)
      : []
    : buildStatusSegmentsGlobal(byStatus, statusLabels);
  const total =
    hasTopic && focusedTopic
      ? focusedTopic.initiatives_total
      : segments.reduce((a, s) => a + s.count, 0) || summary.initiatives_total;

  // Top proposing groups — ONLY shown when scoped to a topic. We
  // deliberately do NOT show a global "top proposers" list: the
  // proposing_group_id data is sparse and spans every legislature, so a
  // global figure (e.g. "PP, 818") reads as a misleading, stuck number that
  // undermines the page's credibility. When a topic is picked the count is
  // scoped and meaningful; otherwise the list is empty.
  const proposers: { slug: string; name_short: string; color_hex: string | null; count: number }[] =
    (() => {
      if (cross) return cross.initiatives_on_topic_by_group.slice(0, 4);
      if (hasTopic) return (topicProposers?.top_proposers ?? []).slice(0, 4);
      return [];
    })();

  const maxProposerCount = Math.max(...proposers.map((p) => p.count), 1);

  return (
    <>
      {/* Big number — generous serif tabular */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <span
            className="serif tabular"
            style={{
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: 'var(--ink)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {total.toLocaleString(locale)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {hasTopic
              ? labels.initiativesOnTopic(focusedTopicName)
              : labels.initiativesPlenary}
          </span>
        </div>

        {/* Topic filter — combobox is directly visible (no extra unfold tap).
            Picking a topic updates ``?topic=…`` in place via router.replace
            with scroll preservation; no form submit, no scroll jump. */}
        <div
          style={{
            margin: '0 0 16px',
            padding: '10px 12px',
            border: '1px solid var(--rule)',
            borderRadius: 10,
            background: 'var(--paper)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              fontWeight: 600,
            }}
          >
            {hasTopic ? labels.topicValue : labels.filterByTopic}
          </div>
          {/* When a topic is active, the X to clear sits INLINE next
              to the dropdown — same line, same visual rhythm — so
              users don't hunt for a separate "Treure filtre" link
              below. The X is a real <Link> so it works without JS. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <StatsTopicFilter allTopics={allTopics} selectedTopic={selectedTopic} />
            </div>
            {hasTopic && (
              <Link
                href={
                  selectedGroup && selectedGroup !== 'all'
                    ? (`/stats?group=${encodeURIComponent(selectedGroup)}` as Route)
                    : ('/stats' as Route)
                }
                scroll={false}
                aria-label={labels.clearTopic}
                title={labels.clearTopic}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  color: 'var(--ink-2)',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 999,
                  flex: 'none',
                  textDecoration: 'none',
                }}
              >
                <X size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          {/* Group filter — same in-place ?group=… update as the topic
              picker. Lets the phone user scope the view to one group. */}
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {hasGroup ? labels.groupValue : labels.filterByGroup}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <StatsGroupFilter allGroups={allGroups} selectedGroup={selectedGroup} />
            </div>
            {hasGroup && (
              <Link
                href={
                  hasTopic
                    ? (`/stats?topic=${encodeURIComponent(selectedTopic)}` as Route)
                    : ('/stats' as Route)
                }
                scroll={false}
                aria-label={labels.clearGroup}
                title={labels.clearGroup}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  color: 'var(--ink-2)',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 999,
                  flex: 'none',
                  textDecoration: 'none',
                }}
              >
                <X size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {/* Stacked horizontal bar with inline % labels */}
        <StatusStackedBar segments={segments} />

        {/* Status legend (compact, two columns) */}
        <ul
          style={{
            listStyle: 'none',
            margin: '12px 0 0',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
          }}
        >
          {segments.map((s) => (
            <li
              key={s.status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-2)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color,
                  flex: 'none',
                }}
              />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
              <span className="tabular" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {s.count}
              </span>
            </li>
          ))}
        </ul>

        {/* Top proposing groups — symmetric (top N regardless of color) */}
        {proposers.length > 0 && (
          <>
            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--rule)',
                fontSize: 9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {hasTopic
                ? labels.topProposersTopic(focusedTopicName)
                : labels.topProposersPlenary}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proposers.map((p) => (
                <li key={p.slug}>
                  <ProposerRow
                    proposer={p}
                    maxCount={maxProposerCount}
                    topicSlug={hasTopic ? selectedTopic : null}
                    governmentShort={governmentShort}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Group-only scope: the picked group's top topics — "what it
            proposes most". Replaces the (global) proposers list above. */}
        {groupTopics.length > 0 && (
          <>
            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--rule)',
                fontSize: 9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {labels.groupProposes(focusedGroupName)}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupTopics.map((tt) => (
                <li key={tt.topic_slug}>
                  <GroupTopicRow
                    name={tt.topic_name_ca}
                    color={tt.topic_color_hex}
                    count={tt.count}
                    maxCount={maxGroupTopicCount}
                    href={`/stats?tab=filtered&topic=${encodeURIComponent(tt.topic_slug)}&group=${encodeURIComponent(selectedGroup)}` as Route}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
    </>
  );
}

/** One "what this group proposes" row: topic dot + name + bar + count.
 *  Mirrors {@link ProposerRow} but for the group's topic distribution. */
function GroupTopicRow({
  name,
  color,
  count,
  maxCount,
  href,
}: {
  name: string;
  color: string | null;
  count: number;
  maxCount: number;
  href: Route;
}) {
  const widthPct = Math.max(2, (count / maxCount) * 100);
  return (
    <Link
      href={href}
      scroll={false}
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr 36px',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 10, height: 10, borderRadius: 2, background: color ?? 'var(--ink-3)' }}
      />
      <span style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 3,
          }}
        >
          {name}
        </div>
        <div style={{ height: 4, background: 'var(--paper-3)', borderRadius: 2, overflow: 'hidden' }}>
          <span
            style={{
              display: 'block',
              width: `${widthPct}%`,
              height: '100%',
              background: color ?? 'var(--ink-3)',
              opacity: 0.95,
            }}
          />
        </div>
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
    </Link>
  );
}

function StatusStackedBar({ segments }: { segments: StatusSegment[] }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total === 0) {
    return (
      <div
        style={{
          height: 14,
          background: 'var(--paper-3)',
          borderRadius: 3,
        }}
      />
    );
  }
  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 16,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--paper-3)',
        }}
        role="img"
        aria-label={segments
          .map((s) => `${s.label} ${Math.round((s.count / total) * 100)}%`)
          .join(', ')}
      >
        {segments.map((s) => {
          const pct = (s.count / total) * 100;
          // Hide inline label if segment is too small for legibility.
          const showLabel = pct >= 10;
          return (
            <span
              key={s.status}
              title={`${s.label}: ${s.count} (${Math.round(pct)}%)`}
              style={{
                width: `${pct}%`,
                background: s.color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 9,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {showLabel ? `${Math.round(pct)}%` : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ProposerRow({
  proposer,
  maxCount,
  topicSlug,
  governmentShort,
}: {
  proposer: { slug: string; name_short: string; color_hex: string | null; count: number };
  maxCount: number;
  topicSlug: string | null;
  governmentShort: string;
}) {
  const widthPct = Math.max(2, (proposer.count / maxCount) * 100);
  const label =
    proposer.slug === 'government' ? governmentShort : displayGroupShort(proposer.name_short);
  const href = (() => {
    if (proposer.slug === 'government') {
      return topicSlug
        ? (`/stats?topic=${encodeURIComponent(topicSlug)}` as Route)
        : ('/stats' as Route);
    }
    const qs = new URLSearchParams({ tab: 'filtered', group: proposer.slug });
    if (topicSlug) qs.set('topic', topicSlug);
    return `/stats?${qs.toString()}` as Route;
  })();
  return (
    <Link
      href={href}
      scroll={false}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 36px',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {proposer.slug === 'government' ? (
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: 'var(--ink)',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          GOV
        </span>
      ) : (
        <GroupBadge
          slug={proposer.slug}
          color={proposer.color_hex}
          size="sm"
          link={false}
        />
      )}
      <span style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            height: 4,
            background: 'var(--paper-3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${widthPct}%`,
              height: '100%',
              background: proposer.color_hex ?? 'var(--ink-3)',
              opacity: 0.95,
            }}
          />
        </div>
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {proposer.count}
      </span>
    </Link>
  );
}

// ─── Widget 3: Expandable initiative list ─────────────────────────────────

function pickInitiativesForList(
  topicProposers: TopicProposers | null,
  groupActivity: GroupActivity | null,
  cross: CrossTopicGroup | null,
): InitiativeMini[] {
  if (cross) return cross.joint_initiatives;
  if (topicProposers) return topicProposers.recent_initiatives;
  if (groupActivity) return groupActivity.recent_initiatives;
  return [];
}

/**
 * Compact 3-initiative preview rendered inside the shared topic-scope card
 * on mobile, beneath the "Suport vs rebuig" widget, when a topic filter is
 * active. The full list lives at ``/topics/<slug>`` — this body is just a
 * hint with a deep link. No outer DashSection/Card chrome: the parent
 * dashboard renders this inside its own bordered Card.
 */
function CompactTopicInitiativesBody({
  topicProposers,
  cross,
  selectedTopic,
  focusedTopicName,
  locale,
  labels,
}: {
  topicProposers: TopicProposers | null;
  cross: CrossTopicGroup | null;
  selectedTopic: string;
  focusedTopicName: string;
  locale: string;
  labels: { eyebrow: string; openTopicPage: string };
}) {
  const items = (cross?.joint_initiatives ?? topicProposers?.recent_initiatives ?? []).slice(0, 3);
  if (items.length === 0) return null;
  const href = `/topics/${encodeURIComponent(selectedTopic)}` as Route;
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {labels.eyebrow}
      </div>
      <h3
        className="serif"
        style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}
      >
        {focusedTopicName}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((ini) => (
          <InitiativeRow key={ini.id} ini={ini} locale={locale} />
        ))}
      </div>
      <Link
        href={href}
        scroll={false}
        prefetch={false}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 12,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--accent)',
          textDecoration: 'none',
        }}
      >
        {labels.openTopicPage} →
      </Link>
    </div>
  );
}

interface ListLabels {
  eyebrow: string;
  info: string;
  seeTopic: (topic: string) => string;
  seeRecent: string;
  emptyTopic: string;
  emptyNoFilter: string;
  seeMore: (count: number) => string;
  openTopicPage: string;
}

/** How many initiatives we ever render inline on the mobile dashboard before
 *  pushing the user to the dedicated /topics/<slug> page. Picked small enough
 *  that even on slow phones the list never blows past one viewport scroll. */
const INLINE_LIST_LIMIT = 10;

function InitiativeListExpandable({
  topicProposers,
  groupActivity,
  cross,
  focusedTopicName,
  selectedTopic,
  locale,
  labels,
}: {
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  focusedTopicName: string;
  selectedTopic: string;
  locale: string;
  labels: ListLabels;
}) {
  const items = pickInitiativesForList(topicProposers, groupActivity, cross);
  const hasTopic = selectedTopic !== 'all';
  // When the user has not picked any filter, show a CTA pointing to the
  // votes index — we don't list ALL initiatives in this widget to keep
  // the dashboard fast.
  const empty = items.length === 0;
  // Slice & "see more" pattern: keep ≤10 rows inline so even 50+ matches
  // don't overwhelm. The overflow CTA navigates to /topics/<slug>, which
  // already has the full filter / subset UX (per votar / votades). When
  // no topic is selected, the overflow points back to /votes as the
  // generic catalog.
  const visible = items.slice(0, INLINE_LIST_LIMIT);
  const overflow = Math.max(0, items.length - visible.length);
  const moreHref: Route = hasTopic
    ? (`/topics/${encodeURIComponent(selectedTopic)}?subset=voted` as Route)
    : ('/votes' as Route);
  return (
    <DashSection
      eyebrow={labels.eyebrow}
      info={labels.info}
    >
      <Card>
        <details open={hasTopic}>
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {hasTopic ? labels.seeTopic(focusedTopicName) : labels.seeRecent}
              {items.length > 0 && (
                <span style={{ color: 'var(--ink-3)', fontWeight: 400, marginLeft: 6 }}>
                  ({items.length})
                </span>
              )}
            </span>
            <span aria-hidden="true" style={{ color: 'var(--ink-3)', display: 'inline-flex' }}>
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </summary>
          <div style={{ marginTop: 10 }}>
            {empty ? (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
                {hasTopic ? labels.emptyTopic : labels.emptyNoFilter}
              </p>
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {visible.map((ini) => (
                    <InitiativeRow key={ini.id} ini={ini} locale={locale} />
                  ))}
                </ul>
                {overflow > 0 && (
                  <Link
                    href={moreHref}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 10,
                      padding: '8px 12px',
                      border: '1px solid var(--ink)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--ink)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    <span>{labels.seeMore(overflow)}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
                {overflow === 0 && hasTopic && (
                  <Link
                    href={moreHref}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 10,
                      fontSize: 12,
                      color: 'var(--ink-2)',
                      textDecoration: 'none',
                    }}
                  >
                    <span>{labels.openTopicPage}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}
              </>
            )}
          </div>
        </details>
      </Card>
    </DashSection>
  );
}

function InitiativeRow({ ini, locale }: { ini: InitiativeMini; locale: string }) {
  const plainSummary = pickPlainSummary(ini, locale);
  return (
    <li
      style={{
        padding: '10px 0',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        fontSize: 13,
      }}
    >
      <span
        className="tabular"
        style={{
          fontSize: 10,
          color: 'var(--ink-3)',
          flex: 'none',
          width: 64,
          paddingTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {ini.submitted_at ?? '—'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <SummaryHover
          summary={plainSummary}
          provider={ini.plain_summary_provider}
          visibleText={ini.title_ca ?? ini.title_original}
        >
          <Link
            href={`/initiatives/${ini.id}` as Route}
            style={{ color: 'var(--ink)', textDecoration: 'none', lineHeight: 1.3 }}
          >
            <AnnotatedText text={ini.title_ca ?? ini.title_original} />
          </Link>
        </SummaryHover>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>
          {ini.official_id}
        </div>
      </span>
    </li>
  );
}

// ─── Widget 4: Pair coincidence picker ────────────────────────────────────
// Moved to :file:`PairCoincidenceClient.tsx` so the picker updates state
// locally without round-tripping through the server SSR. The previously-
// inline helpers (``lookupCoincidence``, ``PairLabels``,
// ``PairCoincidenceWidget``, ``PairResult``) all live in that file now.

// ─── Widget 5: Per-topic coincidence (all groups, symmetric) ──────────────

interface GroupStance {
  group: ParliamentaryGroupSummary;
  yesPct: number | null;
  noPct: number | null;
  cast: number;
}

interface StanceLabels {
  eyebrow: string;
  minVotes: string;
  supports: string;
  rejects: string;
  votesEmitted: (count: number) => string;
  backfillEyebrow: string;
  backfillBodyTopic: (topic: string) => string;
  backfillBodyNoTopic: string;
}

/** Inline body of the per-topic "supports vs rejects" widget. Rendered inside
 *  the parent dashboard's shared topic-scope Card on mobile. No outer
 *  DashSection/Card chrome and no own topic filter (the parent's filter is
 *  shared). Caller is expected to render this only when a topic IS selected. */
function PerTopicCoincidenceBody({
  allGroups,
  topicStatsByGroup,
  selectedTopic,
  focusedTopicName,
  labels,
}: {
  allGroups: ParliamentaryGroupSummary[];
  topicStatsByGroup: Map<string, TopicVoteStat[]>;
  selectedTopic: string;
  focusedTopicName: string;
  labels: StanceLabels;
}) {
  const hasTopic = selectedTopic !== 'all';

  // For every group, look up its TopicVoteStat for the focal topic and
  // compute Sí / No rates over cast=Sí+No+Abst. Symmetric: every group
  // present in allGroups is rendered, in both the "supports" and "rejects"
  // columns. We never hide a group based on its stance.
  const stances: GroupStance[] = allGroups.map((g) => {
    const rows = topicStatsByGroup.get(g.slug) ?? [];
    const row = hasTopic ? rows.find((r) => r.topic_slug === selectedTopic) : null;
    const cast = row?.cast ?? 0;
    return {
      group: g,
      yesPct: row && cast > 0 ? row.ayes / cast : null,
      noPct: row && cast > 0 ? row.noes / cast : null,
      cast,
    };
  });

  const supports = [...stances].sort(
    (a, b) => (b.yesPct ?? -1) - (a.yesPct ?? -1),
  );
  const rejects = [...stances].sort(
    (a, b) => (b.noPct ?? -1) - (a.noPct ?? -1),
  );

  // Empty when a topic IS selected but no group has any cast votes for it.
  // This happens when the backend vote↔initiative linkage is still being
  // backfilled — render a soft placeholder instead of rows of dashes.
  const hasAnyData = stances.some((s) => s.cast > 0);

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--rule)' }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {labels.eyebrow}
      </div>
      {!hasAnyData && (
        <BackfillNotice
          topicName={focusedTopicName}
          eyebrow={labels.backfillEyebrow}
          bodyWithTopic={labels.backfillBodyTopic}
          bodyNoTopic={labels.backfillBodyNoTopic}
        />
      )}
      {hasAnyData && (
        <>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              marginBottom: 10,
            }}
          >
            {focusedTopicName}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <StanceColumn
              title={labels.supports}
              color="var(--aye)"
              stances={supports}
              metric="yes"
              votesEmitted={labels.votesEmitted}
            />
            <StanceColumn
              title={labels.rejects}
              color="var(--no)"
              stances={rejects}
              metric="no"
              votesEmitted={labels.votesEmitted}
            />
          </div>
          <p style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 10 }}>
            <span title={glossaryShort('approval_rate')}>{labels.minVotes}</span>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Soft placeholder shown when an entire stats widget has no rows because the
 * backend vote↔initiative linkage is still being backfilled. Not an error —
 * the data will arrive — so we use the same paper-2 background and rule
 * styling as a regular card, never red.
 */
function BackfillNotice({
  topicName,
  eyebrow,
  bodyWithTopic,
  bodyNoTopic,
}: {
  topicName?: string;
  eyebrow: string;
  bodyWithTopic: (topic: string) => string;
  bodyNoTopic: string;
}) {
  return (
    <div
      role="status"
      style={{
        padding: '14px 16px',
        background: 'var(--paper-2)',
        border: '1px dashed var(--rule)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, lineHeight: 1.4 }}>
        {topicName ? bodyWithTopic(topicName) : bodyNoTopic}
      </p>
    </div>
  );
}

function StanceColumn({
  title,
  color,
  stances,
  metric,
  votesEmitted,
}: {
  title: string;
  color: string;
  stances: GroupStance[];
  metric: 'yes' | 'no';
  votesEmitted: (count: number) => string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stances.map((s) => {
          const value = metric === 'yes' ? s.yesPct : s.noPct;
          const pct = value == null ? null : Math.round(value * 100);
          const width = pct ?? 0;
          return (
            <li key={s.group.slug}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 2,
                  fontSize: 11,
                  color: 'var(--ink-2)',
                  fontWeight: 600,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: s.group.color_hex ?? 'var(--ink-3)',
                    flex: 'none',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${displayGroupShort(s.group.name_short)} · ${votesEmitted(s.cast)}`}
                >
                  {displayGroupShort(s.group.name_short)}
                </span>
                <span
                  className="tabular"
                  style={{
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {pct == null ? '—' : `${pct}%`}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: 'var(--paper-3)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${width}%`,
                    height: '100%',
                    background: pct == null ? 'transparent' : color,
                    opacity: pct == null ? 0 : 0.95,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────

const pickerLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const pickerLabelText: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

const emptyHint: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-3)',
  margin: 0,
  padding: '12px 14px',
  border: '1px dashed var(--rule)',
  borderRadius: 8,
  background: 'var(--paper)',
};
