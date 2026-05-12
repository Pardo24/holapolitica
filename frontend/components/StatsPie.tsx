'use client';

import { useState } from 'react';
import { Layers, Users, CheckCircle2, Scale } from 'lucide-react';

import type {
  GroupProposalCount,
  InitiativeStatusCount,
  TopicGlobalStat,
} from '@/lib/api';

/**
 * Interactive pie chart for the desktop /stats overview.
 *
 * Replaces the dense stack of mini-charts (per-status donut, per-type
 * donut, cohesion bars, attendance bars, proposing-group bars) with a
 * single deterministic SVG pie that the visitor can toggle between four
 * breakdown modes via a segmented radio group on the right. Legend
 * (color + label + count) sits below the pie.
 *
 * Neutrality (CLAUDE.md "regla de simetria"):
 *  - All modes render the FULL distribution, never a top-N highlight
 *    of one group. We sort slices by size only for readability; small
 *    slices remain in the chart.
 *  - We use each topic's / group's native color from the API; no
 *    editorial palette imposed on top.
 *
 * Status colors (mode 3) reuse the same CSS variables as the rest of
 * the product so the pie reads identically to the StackedBar / KPIs.
 *
 * The pie itself is a deterministic SVG. We render it client-side only
 * because the segmented mode toggle is local state — the data is
 * already fetched on the parent server component and passed in as
 * props, so no extra round trips happen on mode change.
 */

type Mode = 'topic' | 'group' | 'topic_acceptance' | 'status';

interface Slice {
  key: string;
  label: string;
  count: number;
  color: string;
}

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

// Fallback palette for slices missing an explicit color. Matches the
// TYPE_COLORS array in stats/page.tsx so the visuals stay consistent.
const FALLBACK_PALETTE = [
  'var(--accent)',
  'var(--aye)',
  'var(--no)',
  'var(--abst)',
  'var(--gp-junts)',
  'var(--gp-pnv)',
  'var(--nv)',
];

export interface StatsPieLabels {
  title: string;
  modeTopic: string;
  modeGroup: string;
  modeTopicAcceptance: string;
  modeStatus: string;
  modeAria: string;
  statusApproved: string;
  statusRejected: string;
  statusInDebate: string;
  statusSubmitted: string;
  statusWithdrawn: string;
  statusExpired: string;
  statusOther: string;
  initiativesUnit: string;
  emptyMode: string;
}

export interface StatsPieProps {
  byStatus: InitiativeStatusCount[];
  proposingGroups: GroupProposalCount[];
  topics: TopicGlobalStat[];
  labels: StatsPieLabels;
}

export function StatsPie({
  byStatus,
  proposingGroups,
  topics,
  labels,
}: StatsPieProps) {
  const [mode, setMode] = useState<Mode>('topic');

  const slices = buildSlices(mode, { byStatus, proposingGroups, topics, labels });
  const total = slices.reduce((a, s) => a + s.count, 0);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 280px',
        gap: 28,
        alignItems: 'start',
      }}
      className="stats-pie-wrap"
    >
      <div style={{ minWidth: 0 }}>
        <PieSvg slices={slices} total={total} emptyLabel={labels.emptyMode} />
        <PieLegend slices={slices} total={total} unit={labels.initiativesUnit} />
      </div>
      <ModeRadio
        mode={mode}
        onChange={setMode}
        labels={labels}
      />
    </div>
  );
}

// ─── Mode → slice builders ────────────────────────────────────────────────

function buildSlices(
  mode: Mode,
  src: {
    byStatus: InitiativeStatusCount[];
    proposingGroups: GroupProposalCount[];
    topics: TopicGlobalStat[];
    labels: StatsPieLabels;
  },
): Slice[] {
  switch (mode) {
    case 'topic':
      return src.topics
        .filter((t) => t.initiatives_total > 0)
        .map((t, i) => ({
          key: t.topic_slug,
          label: t.topic_name_ca,
          count: t.initiatives_total,
          color: t.topic_color_hex ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]!,
        }))
        .sort((a, b) => b.count - a.count);
    case 'group':
      return src.proposingGroups
        .filter((g) => g.count > 0)
        .map((g, i) => ({
          key: g.slug,
          label: g.name_short,
          count: g.count,
          color: g.color_hex ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]!,
        }))
        .sort((a, b) => b.count - a.count);
    case 'topic_acceptance':
      // Per topic, sum approved + rejected (decided initiatives). Shows
      // where the chamber actually moves things to a verdict, broken
      // down by topic. Symmetric: approved and rejected both included.
      return src.topics
        .map((t, i) => ({
          key: t.topic_slug,
          label: t.topic_name_ca,
          count: t.initiatives_approved + t.initiatives_rejected,
          color: t.topic_color_hex ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]!,
        }))
        .filter((s) => s.count > 0)
        .sort((a, b) => b.count - a.count);
    case 'status':
      return src.byStatus
        .filter((r) => r.count > 0)
        .map((r) => ({
          key: r.status,
          label: statusLabel(r.status, src.labels),
          count: r.count,
          color: STATUS_COLOR[r.status] ?? 'var(--nv)',
        }))
        .sort((a, b) => b.count - a.count);
  }
}

function statusLabel(status: string, labels: StatsPieLabels): string {
  switch (status) {
    case 'approved':
      return labels.statusApproved;
    case 'rejected':
      return labels.statusRejected;
    case 'in_debate':
      return labels.statusInDebate;
    case 'submitted':
      return labels.statusSubmitted;
    case 'withdrawn':
      return labels.statusWithdrawn;
    case 'expired':
      return labels.statusExpired;
    default:
      return labels.statusOther;
  }
}

// ─── SVG pie ──────────────────────────────────────────────────────────────

function PieSvg({
  slices,
  total,
  emptyLabel,
}: {
  slices: Slice[];
  total: number;
  emptyLabel: string;
}) {
  // Single-slice pies need special handling — the standard formula
  // collapses to a zero-area path because start == end. We render a
  // full circle for that case.
  if (total === 0) {
    return (
      <div
        style={{
          aspectRatio: '1 / 1',
          maxWidth: 360,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-3)',
          fontSize: 12,
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let acc = 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={slices
        .map((s) => `${s.label} ${Math.round((s.count / total) * 100)}%`)
        .join(', ')}
    >
      {slices.length === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill={slices[0]!.color} />
      ) : (
        slices.map((s) => {
          const a0 = (acc / total) * Math.PI * 2;
          acc += s.count;
          const a1 = (acc / total) * Math.PI * 2;
          const x0 = cx + Math.sin(a0) * r;
          const y0 = cy - Math.cos(a0) * r;
          const x1 = cx + Math.sin(a1) * r;
          const y1 = cy - Math.cos(a1) * r;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
          return (
            <path
              key={s.key}
              d={d}
              fill={s.color}
              stroke="var(--paper)"
              strokeWidth={1.5}
            >
              <title>
                {s.label}: {s.count} ({Math.round((s.count / total) * 100)}%)
              </title>
            </path>
          );
        })
      )}
    </svg>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────

function PieLegend({
  slices,
  total,
  unit,
}: {
  slices: Slice[];
  total: number;
  unit: string;
}) {
  if (slices.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: '18px 0 0',
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '6px 14px',
      }}
    >
      {slices.map((s) => {
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
        return (
          <li
            key={s.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--ink-2)',
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: s.color,
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
              title={`${s.label} · ${s.count} ${unit} (${pct}%)`}
            >
              {s.label}
            </span>
            <span
              className="tabular"
              style={{
                fontWeight: 600,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.count}
              <span style={{ color: 'var(--ink-3)', marginLeft: 4 }}>
                {pct}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────

function ModeRadio({
  mode,
  onChange,
  labels,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  labels: StatsPieLabels;
}) {
  const options: { key: Mode; label: string; Icon: typeof Layers }[] = [
    { key: 'topic', label: labels.modeTopic, Icon: Layers },
    { key: 'group', label: labels.modeGroup, Icon: Users },
    { key: 'topic_acceptance', label: labels.modeTopicAcceptance, Icon: Scale },
    { key: 'status', label: labels.modeStatus, Icon: CheckCircle2 },
  ];
  return (
    <fieldset
      role="radiogroup"
      aria-label={labels.modeAria}
      style={{
        border: '1px solid var(--rule-strong)',
        borderRadius: 12,
        padding: '14px 14px 10px',
        background: 'var(--paper-2)',
        margin: 0,
        minWidth: 0,
      }}
    >
      <legend
        style={{
          padding: '0 6px',
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontWeight: 600,
        }}
      >
        {labels.title}
      </legend>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {options.map(({ key, label, Icon }) => {
          const active = key === mode;
          return (
            <li key={key}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-2)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  border: '1px solid',
                  borderColor: active ? 'var(--ink)' : 'transparent',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                <input
                  type="radio"
                  name="stats-pie-mode"
                  value={key}
                  checked={active}
                  onChange={() => onChange(key)}
                  className="input-bare"
                  style={{
                    width: 14,
                    height: 14,
                    margin: 0,
                    accentColor: active ? 'var(--paper)' : 'var(--accent)',
                    flex: 'none',
                  }}
                />
                <Icon size={16} aria-hidden="true" strokeWidth={1.75} />
                <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
