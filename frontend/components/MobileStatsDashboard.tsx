import Link from 'next/link';
import type { Route } from 'next';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import { HighlightsCarousel } from '@/components/HighlightsCarousel';
import { SummaryHover } from '@/components/SummaryHover';
import { TopicCombobox } from '@/components/TopicCombobox';
import { Tooltip } from '@/components/Tooltip';
import type {
  CoincidenceCell,
  CrossTopicGroup,
  GroupActivity,
  GroupProposalCount,
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
import type { Highlight } from '@/lib/highlights';

/**
 * Mobile-only dashboard for /stats. Shown via ``sm:hidden`` on ≤640px while
 * the desktop tabbed layout is hidden via ``hidden sm:block``. Built as a
 * **dashboard on open**: every key signal visible without scrolling through
 * paragraphs of explanation.
 *
 * State model — URL params only, no useState:
 *   - ``?topic=<slug>``     scope of widgets 2, 3, 5
 *   - ``?pair_a=<slug>``    first picked group in widget 4
 *   - ``?pair_b=<slug>``    second picked group in widget 4
 *
 * URL state is preferred over useState because it lets the user share /
 * bookmark a configured view. The desktop layout already uses the same
 * ``topic`` param, so switching viewport keeps the user's context.
 *
 * Neutrality (CLAUDE.md "regla de simetria"):
 *   - widget 2's proposers shows top N regardless of color; never
 *     "highlight" one group
 *   - widget 4 is a symmetric pair — order of selection doesn't change
 *     meaning
 *   - widget 5 ALWAYS shows both the "supports" and "rejects" columns
 *     side by side; neither column can be hidden
 */
export function MobileStatsDashboard({
  highlights,
  allTopics,
  allGroups,
  topics,
  byStatus,
  proposingGroups,
  topicProposers,
  groupActivity,
  cross,
  coincidence,
  topicStatsByGroup,
  summary,
  selectedTopic,
  selectedGroup,
  pairA,
  pairB,
  locale,
}: {
  highlights: Highlight[];
  allTopics: Topic[];
  allGroups: ParliamentaryGroupSummary[];
  topics: TopicGlobalStat[];
  byStatus: InitiativeStatusCount[];
  proposingGroups: GroupProposalCount[];
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  coincidence: CoincidenceCell[];
  topicStatsByGroup: Map<string, TopicVoteStat[]>;
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
  const hasTopic = selectedTopic !== 'all';
  const focusedTopic = hasTopic
    ? topics.find((t) => t.topic_slug === selectedTopic) ?? null
    : null;
  const focusedTopicName =
    focusedTopic?.topic_name_ca ??
    allTopics.find((t) => t.slug === selectedTopic)?.name_ca ??
    selectedTopic;

  return (
    <div className="sm:hidden" style={{ paddingTop: 18 }}>
      {/* ─── Widget 1: highlights carousel — always first ─────────────── */}
      <DashSection
        eyebrow="Destacats per grup"
        info="Per cada grup, el tema on dóna més suport i el tema on rebutja més. Rotem entre tots els grups per igual."
      >
        <HighlightsCarousel items={highlights} />
      </DashSection>

      {/* ─── Widget 2: Initiatives state + topic filter ───────────────── */}
      <InitiativesStateWidget
        allTopics={allTopics}
        topics={topics}
        byStatus={byStatus}
        proposingGroups={proposingGroups}
        topicProposers={topicProposers}
        groupActivity={groupActivity}
        cross={cross}
        focusedTopic={focusedTopic}
        focusedTopicName={focusedTopicName}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
        summary={summary}
        locale={locale}
      />

      {/* ─── Widget 3: Expandable initiative list ────────────────────── */}
      <InitiativeListExpandable
        topicProposers={topicProposers}
        groupActivity={groupActivity}
        cross={cross}
        focusedTopicName={focusedTopicName}
        selectedTopic={selectedTopic}
        locale={locale}
      />

      {/* ─── Widget 4: Coincidence — pair picker ─────────────────────── */}
      <PairCoincidenceWidget
        allGroups={allGroups}
        coincidence={coincidence}
        pairA={pairA}
        pairB={pairB}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
      />

      {/* ─── Widget 5: Coincidence — per topic, all groups ───────────── */}
      <PerTopicCoincidenceWidget
        allTopics={allTopics}
        allGroups={allGroups}
        topicStatsByGroup={topicStatsByGroup}
        selectedTopic={selectedTopic}
        selectedGroup={selectedGroup}
        focusedTopicName={focusedTopicName}
        pairA={pairA}
        pairB={pairB}
      />
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
const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovades',
  rejected: 'Rebutjades',
  in_debate: 'En tràmit',
  submitted: 'Presentades',
  withdrawn: 'Retirades',
  expired: 'Caducades',
};

interface StatusSegment {
  status: string;
  count: number;
  label: string;
  color: string;
}

function buildStatusSegmentsFromTopic(t: TopicGlobalStat): StatusSegment[] {
  // Topic-global breakdown doesn't have separate retired/expired buckets —
  // we lump them into "Altres" via initiatives_other to keep the bar shape.
  const segs: StatusSegment[] = [
    {
      status: 'approved',
      count: t.initiatives_approved,
      label: STATUS_LABEL.approved!,
      color: STATUS_COLOR.approved!,
    },
    {
      status: 'rejected',
      count: t.initiatives_rejected,
      label: STATUS_LABEL.rejected!,
      color: STATUS_COLOR.rejected!,
    },
    {
      status: 'in_debate',
      count: t.initiatives_in_debate,
      label: STATUS_LABEL.in_debate!,
      color: STATUS_COLOR.in_debate!,
    },
    {
      status: 'other',
      count: t.initiatives_other,
      label: 'Altres',
      color: 'var(--nv)',
    },
  ];
  return segs.filter((s) => s.count > 0);
}

function buildStatusSegmentsGlobal(rows: InitiativeStatusCount[]): StatusSegment[] {
  return rows
    .map((r) => ({
      status: r.status,
      count: r.count,
      label: STATUS_LABEL[r.status] ?? r.status,
      color: STATUS_COLOR[r.status] ?? 'var(--nv)',
    }))
    .filter((s) => s.count > 0);
}

function InitiativesStateWidget({
  allTopics,
  topics,
  byStatus,
  proposingGroups,
  topicProposers,
  groupActivity,
  cross,
  focusedTopic,
  focusedTopicName,
  selectedTopic,
  selectedGroup,
  summary,
  locale,
}: {
  allTopics: Topic[];
  topics: TopicGlobalStat[];
  byStatus: InitiativeStatusCount[];
  proposingGroups: GroupProposalCount[];
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  focusedTopic: TopicGlobalStat | null;
  focusedTopicName: string;
  selectedTopic: string;
  selectedGroup: string;
  summary: StatsSummary;
  locale: string;
}) {
  const hasTopic = selectedTopic !== 'all';
  const segments: StatusSegment[] = hasTopic
    ? focusedTopic
      ? buildStatusSegmentsFromTopic(focusedTopic)
      : []
    : buildStatusSegmentsGlobal(byStatus);
  const total =
    hasTopic && focusedTopic
      ? focusedTopic.initiatives_total
      : segments.reduce((a, s) => a + s.count, 0) || summary.initiatives_total;

  // Top proposing groups for the current scope. Always show top 3-4 regardless
  // of color — symmetry rule: never single out a group, always show the same
  // shape of list. The scope, from most to least specific:
  //   1. both filters → cross.initiatives_on_topic_by_group
  //   2. topic only   → topicProposers.top_proposers
  //   3. group only   → fall back to global proposingGroups (less useful here
  //                     because dashboard is keyed by topic, but harmless)
  //   4. neither      → global proposingGroups
  const proposers: { slug: string; name_short: string; color_hex: string | null; count: number }[] =
    (() => {
      if (cross) return cross.initiatives_on_topic_by_group.slice(0, 4);
      if (hasTopic && topicProposers) return topicProposers.top_proposers.slice(0, 4);
      // Suppress the unused-arg warning — groupActivity is reserved for future
      // expansion where the group-only case shows top topics. Today we fall
      // through to global proposingGroups.
      void groupActivity;
      return proposingGroups.slice(0, 4);
    })();

  const maxProposerCount = Math.max(...proposers.map((p) => p.count), 1);

  return (
    <DashSection
      eyebrow="Iniciatives · estat global"
      info="Total d'iniciatives presentades a la cambra, repartides per estat actual. Filtra per tema per veure-ho per àrea."
    >
      <Card>
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
            iniciatives {hasTopic ? `· ${focusedTopicName}` : 'al ple'}
          </span>
        </div>

        {/* Topic filter — collapsable behind a <details>. Form submits via
            GET, preserving the rest of the URL params. */}
        <details
          open={hasTopic}
          style={{
            margin: '0 0 16px',
            border: '1px solid var(--rule)',
            borderRadius: 10,
            background: 'var(--paper)',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--ink-2)',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>
              {hasTopic ? (
                <>
                  Tema: <strong>{focusedTopicName}</strong>
                </>
              ) : (
                'Filtra per tema'
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>▾</span>
          </summary>
          <form method="GET" action="/stats" style={{ padding: '4px 14px 14px', display: 'grid', gap: 10 }}>
            {selectedGroup && selectedGroup !== 'all' && (
              <input type="hidden" name="group" value={selectedGroup} />
            )}
            <TopicCombobox
              name="topic"
              value={selectedTopic}
              topics={allTopics}
              emptyValue="all"
              clearLabel="Cap (tots els temes)"
              placeholder="Filtra per tema…"
              ariaLabel="Filtra per tema"
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="btn-ink btn-sm" style={{ flex: 1 }}>
                Aplica
              </button>
              {hasTopic && (
                <Link
                  href={
                    selectedGroup && selectedGroup !== 'all'
                      ? (`/stats?group=${encodeURIComponent(selectedGroup)}` as Route)
                      : ('/stats' as Route)
                  }
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    textDecoration: 'none',
                    padding: '8px 12px',
                    border: '1px solid var(--rule)',
                    borderRadius: 8,
                    textAlign: 'center',
                  }}
                >
                  × Neteja
                </Link>
              )}
            </div>
          </form>
        </details>

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
              Qui proposa més {hasTopic ? `en ${focusedTopicName}` : 'al ple'}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proposers.map((p) => (
                <li key={p.slug}>
                  <ProposerRow
                    proposer={p}
                    maxCount={maxProposerCount}
                    topicSlug={hasTopic ? selectedTopic : null}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </DashSection>
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
}: {
  proposer: { slug: string; name_short: string; color_hex: string | null; count: number };
  maxCount: number;
  topicSlug: string | null;
}) {
  const widthPct = Math.max(2, (proposer.count / maxCount) * 100);
  const label =
    proposer.slug === 'government' ? 'Govern' : displayGroupShort(proposer.name_short);
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

function InitiativeListExpandable({
  topicProposers,
  groupActivity,
  cross,
  focusedTopicName,
  selectedTopic,
  locale,
}: {
  topicProposers: TopicProposers | null;
  groupActivity: GroupActivity | null;
  cross: CrossTopicGroup | null;
  focusedTopicName: string;
  selectedTopic: string;
  locale: string;
}) {
  const items = pickInitiativesForList(topicProposers, groupActivity, cross);
  const hasTopic = selectedTopic !== 'all';
  // When the user has not picked any filter, show a CTA pointing to the
  // votes index — we don't list ALL initiatives in this widget to keep
  // the dashboard fast.
  const empty = items.length === 0;
  return (
    <DashSection
      eyebrow="Llista d'iniciatives"
      info="Iniciatives més recents segons el filtre actiu. Toca el títol per veure el resum en llenguatge planer."
    >
      <Card>
        <details>
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
              Veure {hasTopic ? `iniciatives sobre ${focusedTopicName}` : 'iniciatives recents'}
              {items.length > 0 && (
                <span style={{ color: 'var(--ink-3)', fontWeight: 400, marginLeft: 6 }}>
                  ({items.length})
                </span>
              )}
            </span>
            <span aria-hidden="true" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              ▾
            </span>
          </summary>
          <div style={{ marginTop: 10 }}>
            {empty ? (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
                {hasTopic
                  ? 'Cap iniciativa classificada per a aquest tema encara.'
                  : 'Selecciona un tema per veure iniciatives concretes, o visita la pestanya de votacions.'}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((ini) => (
                  <InitiativeRow key={ini.id} ini={ini} locale={locale} />
                ))}
              </ul>
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
        <SummaryHover summary={plainSummary} provider={ini.plain_summary_provider}>
          <Link
            href={`/votes?q=${encodeURIComponent(ini.official_id)}` as Route}
            style={{ color: 'var(--ink)', textDecoration: 'none', lineHeight: 1.3 }}
          >
            {ini.title_ca ?? ini.title_original}
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

function lookupCoincidence(
  cells: CoincidenceCell[],
  a: string,
  b: string,
): CoincidenceCell | null {
  for (const c of cells) {
    if (
      (c.group_a_slug === a && c.group_b_slug === b) ||
      (c.group_a_slug === b && c.group_b_slug === a)
    ) {
      return c;
    }
  }
  return null;
}

function PairCoincidenceWidget({
  allGroups,
  coincidence,
  pairA,
  pairB,
  selectedTopic,
  selectedGroup,
}: {
  allGroups: ParliamentaryGroupSummary[];
  coincidence: CoincidenceCell[];
  pairA: string;
  pairB: string;
  selectedTopic: string;
  selectedGroup: string;
}) {
  const hasBoth = pairA && pairB && pairA !== 'all' && pairB !== 'all';
  const sameGroup = hasBoth && pairA === pairB;
  const cell = hasBoth && !sameGroup ? lookupCoincidence(coincidence, pairA, pairB) : null;
  const pct =
    cell && cell.coincidence != null ? Math.round(cell.coincidence * 100) : null;
  const groupA = allGroups.find((g) => g.slug === pairA) ?? null;
  const groupB = allGroups.find((g) => g.slug === pairB) ?? null;

  return (
    <DashSection
      eyebrow={
        <>
          <GlossaryTerm term="Coincidència">Coincidència</GlossaryTerm> entre dos grups
        </>
      }
      info="Tria dos grups parlamentaris i mira en quin % de votacions han votat el mateix sentit (Sí, No o Abstenció). L'ordre de la parella no afecta el resultat."
    >
      <Card>
        <form
          method="GET"
          action="/stats"
          style={{ display: 'grid', gap: 10, marginBottom: 14 }}
        >
          {selectedTopic && selectedTopic !== 'all' && (
            <input type="hidden" name="topic" value={selectedTopic} />
          )}
          {selectedGroup && selectedGroup !== 'all' && (
            <input type="hidden" name="group" value={selectedGroup} />
          )}
          <label style={pickerLabel}>
            <span style={pickerLabelText}>Grup A</span>
            <GroupCombobox
              name="pair_a"
              value={pairA && pairA !== 'all' ? pairA : ''}
              groups={allGroups}
              emptyValue=""
              clearLabel="—"
              placeholder="Tria el primer grup…"
              ariaLabel="Tria el primer grup"
            />
          </label>
          <label style={pickerLabel}>
            <span style={pickerLabelText}>Grup B</span>
            <GroupCombobox
              name="pair_b"
              value={pairB && pairB !== 'all' ? pairB : ''}
              groups={allGroups}
              emptyValue=""
              clearLabel="—"
              placeholder="Tria el segon grup…"
              ariaLabel="Tria el segon grup"
            />
          </label>
          <button type="submit" className="btn-ink btn-sm">
            Calcula
          </button>
        </form>

        {!hasBoth && (
          <p style={emptyHint}>
            Tria dos grups parlamentaris diferents per calcular la
            coincidència.
          </p>
        )}
        {sameGroup && (
          <p style={emptyHint}>
            Tria dos grups <em>diferents</em> — la coincidència d&apos;un grup
            amb si mateix és sempre 100%.
          </p>
        )}
        {hasBoth && !sameGroup && pct == null && (
          <p style={emptyHint}>
            No hi ha prou votacions comparades entre aquests dos grups encara.
          </p>
        )}
        {hasBoth && !sameGroup && pct != null && groupA && groupB && (
          <PairResult
            groupA={groupA}
            groupB={groupB}
            pct={pct}
            votesCompared={cell?.votes_compared ?? 0}
          />
        )}
      </Card>
    </DashSection>
  );
}

function PairResult({
  groupA,
  groupB,
  pct,
  votesCompared,
}: {
  groupA: ParliamentaryGroupSummary;
  groupB: ParliamentaryGroupSummary;
  pct: number;
  votesCompared: number;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <GroupBadge slug={groupA.slug} color={groupA.color_hex} size="sm" link={false} />
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>i</span>
        <GroupBadge slug={groupB.slug} color={groupB.color_hex} size="sm" link={false} />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>
          {displayGroupShort(groupA.name_short)} · {displayGroupShort(groupB.name_short)}
        </span>
      </div>

      <div
        className="serif tabular"
        style={{
          fontSize: 52,
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}
        <span style={{ fontSize: 22, marginLeft: 2 }}>%</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '8px 0 12px' }}>
        de votacions on han votat el mateix sentit · {votesCompared} comparades
      </p>

      {/* Single-color bar of the coincidence percentage. The detailed
          breakdown (both-yes / both-no / both-abstain / divergent) is not
          exposed by the backend yet — see TODO below. */}
      <div
        style={{
          display: 'flex',
          height: 14,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--paper-3)',
        }}
      >
        <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        <span style={{ width: `${100 - pct}%`, background: 'var(--paper-3)' }} />
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
        <span>Mateix sentit</span>
        <span>Divergent · {100 - pct}%</span>
      </div>
      {/* TODO: when the backend exposes both-yes / both-no / both-abstain /
          divergent breakdown for a pair, render a 4-segment stacked bar
          here instead of the single-color split. The current
          /metrics/coincidence endpoint only returns the total coincidence
          ratio. */}
    </div>
  );
}

// ─── Widget 5: Per-topic coincidence (all groups, symmetric) ──────────────

interface GroupStance {
  group: ParliamentaryGroupSummary;
  yesPct: number | null;
  noPct: number | null;
  cast: number;
}

function PerTopicCoincidenceWidget({
  allTopics,
  allGroups,
  topicStatsByGroup,
  selectedTopic,
  selectedGroup,
  focusedTopicName,
  pairA,
  pairB,
}: {
  allTopics: Topic[];
  allGroups: ParliamentaryGroupSummary[];
  topicStatsByGroup: Map<string, TopicVoteStat[]>;
  selectedTopic: string;
  selectedGroup: string;
  focusedTopicName: string;
  pairA: string;
  pairB: string;
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

  return (
    <DashSection
      eyebrow={<>Posició per tema · suport vs. rebuig</>}
      info="Per al tema seleccionat, cada grup té un % de Sí i un % de No sobre el total de vots emesos. Mostrem totes les dues columnes alhora — mai amaguem un cantó."
    >
      <Card>
        <form
          method="GET"
          action="/stats"
          style={{ display: 'grid', gap: 10, marginBottom: 14 }}
        >
          {selectedGroup && selectedGroup !== 'all' && (
            <input type="hidden" name="group" value={selectedGroup} />
          )}
          {pairA && pairA !== 'all' && <input type="hidden" name="pair_a" value={pairA} />}
          {pairB && pairB !== 'all' && <input type="hidden" name="pair_b" value={pairB} />}
          <label style={pickerLabel}>
            <span style={pickerLabelText}>Tema</span>
            <TopicCombobox
              name="topic"
              value={selectedTopic}
              topics={allTopics}
              emptyValue="all"
              clearLabel="Cap (tots els temes)"
              placeholder="Tria un tema…"
              ariaLabel="Tria un tema"
            />
          </label>
          <button type="submit" className="btn-ink btn-sm">
            Aplica
          </button>
        </form>

        {!hasTopic && (
          <p style={emptyHint}>
            Tria un tema per veure quins grups li donen suport i quins el
            rebutgen, amb totes dues columnes alhora.
          </p>
        )}
        {hasTopic && (
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
                title="Donen suport"
                color="var(--aye)"
                stances={supports}
                metric="yes"
              />
              <StanceColumn
                title="Neguen"
                color="var(--no)"
                stances={rejects}
                metric="no"
              />
            </div>
            <p style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 10 }}>
              Mín. <span title={glossaryShort('approval_rate')}>5 vots emesos</span> per ser computat.
              Columnes simètriques: mateixos grups, ordenats per cada mètrica.
            </p>
          </>
        )}
      </Card>
    </DashSection>
  );
}

function StanceColumn({
  title,
  color,
  stances,
  metric,
}: {
  title: string;
  color: string;
  stances: GroupStance[];
  metric: 'yes' | 'no';
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
                  title={`${displayGroupShort(s.group.name_short)} · ${s.cast} vots emesos`}
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
