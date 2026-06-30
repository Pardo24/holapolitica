'use client';

import { useState } from 'react';
import { Layers, CheckCircle2, Scale, X } from 'lucide-react';

import type {
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

type Mode = 'topic' | 'topic_acceptance' | 'status';

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
  topics: TopicGlobalStat[];
  labels: StatsPieLabels;
  /** slug → plain-language topic description, for the click-to-explain
   *  panel. Only present for topic slices; groups/status have none. */
  topicDescriptions?: Record<string, string>;
  /** Caption shown above the description panel (e.g. "What it covers"). */
  explainHint?: string;
}

export function StatsPie({
  byStatus,
  topics,
  labels,
  topicDescriptions = {},
  explainHint,
}: StatsPieProps) {
  const [mode, setMode] = useState<Mode>('topic');
  // The clicked slice/legend item — drives the topic explanation panel.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const slices = buildSlices(mode, { byStatus, topics, labels });
  const total = slices.reduce((a, s) => a + s.count, 0);

  const changeMode = (m: Mode) => {
    setMode(m);
    setSelectedKey(null);
  };
  const toggleSelect = (key: string) =>
    setSelectedKey((prev) => (prev === key ? null : key));

  const selectedSlice = selectedKey
    ? slices.find((s) => s.key === selectedKey) ?? null
    : null;
  const selectedDesc = selectedKey ? topicDescriptions[selectedKey] ?? null : null;

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
        <PieSvg
          slices={slices}
          total={total}
          emptyLabel={labels.emptyMode}
          selectedKey={selectedKey}
          onSelect={toggleSelect}
        />
        {selectedSlice && selectedDesc && (
          <TopicExplain
            slice={selectedSlice}
            total={total}
            description={selectedDesc}
            unit={labels.initiativesUnit}
            hint={explainHint}
            onClose={() => setSelectedKey(null)}
          />
        )}
        <PieLegend
          slices={slices}
          total={total}
          unit={labels.initiativesUnit}
          selectedKey={selectedKey}
          onSelect={toggleSelect}
        />
      </div>
      <ModeRadio
        mode={mode}
        onChange={changeMode}
        labels={labels}
      />
    </div>
  );
}

// ─── Topic explanation panel (click-to-explain) ──────────────────────────────

function TopicExplain({
  slice,
  total,
  description,
  unit,
  hint,
  onClose,
}: {
  slice: Slice;
  total: number;
  description: string;
  unit: string;
  hint?: string;
  onClose: () => void;
}) {
  const pct = total > 0 ? Math.round((slice.count / total) * 100) : 0;
  return (
    <div
      role="region"
      style={{
        marginTop: 14,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        borderLeft: `3px solid ${slice.color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 11,
            height: 11,
            borderRadius: 3,
            background: slice.color,
            flex: 'none',
            transform: 'translateY(1px)',
          }}
        />
        <strong style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 700 }}>
          {slice.label}
        </strong>
        <span className="tabular" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
          {slice.count} {unit} · {pct}%
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tancar"
          style={{
            border: 0,
            background: 'transparent',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            padding: 2,
            lineHeight: 1,
            display: 'inline-flex',
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            fontWeight: 600,
            margin: '10px 0 4px',
          }}
        >
          {hint}
        </div>
      )}
      <p
        style={{
          margin: hint ? 0 : '8px 0 0',
          fontSize: 13.5,
          lineHeight: 1.5,
          color: 'var(--ink-2)',
        }}
      >
        {description}
      </p>
    </div>
  );
}

// ─── Mode → slice builders ────────────────────────────────────────────────

function buildSlices(
  mode: Mode,
  src: {
    byStatus: InitiativeStatusCount[];
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
  selectedKey,
  onSelect,
}: {
  slices: Slice[];
  total: number;
  emptyLabel: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  // Hooks must sit above any conditional return per the rules of hooks.
  const [hoverKey, setHoverKey] = useState<string | null>(null);
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
  // Hover wins for the transient tooltip; a clicked (selected) slice keeps
  // the bump + tooltip when the pointer leaves.
  const activeKey = hoverKey ?? selectedKey;
  const active = activeKey ? slices.find((s) => s.key === activeKey) ?? null : null;
  const activePct = active ? Math.round((active.count / total) * 100) : 0;
  let acc = 0;

  return (
    <div style={{ position: 'relative', maxWidth: 360, margin: '0 auto' }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={slices
          .map((s) => `${s.label} ${Math.round((s.count / total) * 100)}%`)
          .join(', ')}
        onMouseLeave={() => setHoverKey(null)}
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
            const isActive = activeKey === s.key;
            const isOther = activeKey !== null && !isActive;
            // Push the active slice outward slightly so the user feels
            // they've selected it. ``preserveAspectRatio`` is fine — the
            // SVG container has ``overflow: visible`` to allow the bump.
            const midAngle = (a0 + a1) / 2;
            const offset = isActive ? 6 : 0;
            const tx = Math.sin(midAngle) * offset;
            const ty = -Math.cos(midAngle) * offset;
            return (
              <path
                key={s.key}
                d={d}
                fill={s.color}
                stroke="var(--paper)"
                strokeWidth={isActive ? 2.5 : 1.5}
                style={{
                  cursor: 'pointer',
                  transform: `translate(${tx}px, ${ty}px)`,
                  transition: 'transform 0.18s ease, opacity 0.15s ease, stroke-width 0.15s ease',
                  opacity: isOther ? 0.55 : 1,
                  filter: isActive
                    ? 'drop-shadow(0 4px 10px rgba(15,23,42,0.18))'
                    : 'none',
                }}
                onMouseEnter={() => setHoverKey(s.key)}
                onFocus={() => setHoverKey(s.key)}
                onBlur={() => setHoverKey(null)}
                onClick={() => onSelect(s.key)}
                role="button"
                tabIndex={0}
                aria-pressed={selectedKey === s.key}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(s.key);
                  }
                }}
                aria-label={`${s.label}: ${s.count} (${Math.round(
                  (s.count / total) * 100,
                )}%)`}
              />
            );
          })
        )}
      </svg>
      {/* Center tooltip — appears when a slice is active. Sits absolutely
          inside the wrapper, centered on the pie. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: active ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 12,
            padding: '10px 14px',
            textAlign: 'center',
            minWidth: 110,
            boxShadow: '0 8px 22px -12px rgba(15,23,42,0.18)',
          }}
        >
          {active && (
            <>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  marginBottom: 4,
                }}
              >
                {active.label}
              </div>
              <div
                className="tabular"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: active.color,
                  lineHeight: 1.1,
                }}
              >
                {activePct}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                {active.count}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────

function PieLegend({
  slices,
  total,
  unit,
  selectedKey,
  onSelect,
}: {
  slices: Slice[];
  total: number;
  unit: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
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
        gap: '2px 8px',
      }}
    >
      {slices.map((s) => {
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
        const isSelected = selectedKey === s.key;
        return (
          <li key={s.key} style={{ minWidth: 0 }}>
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              aria-pressed={isSelected}
              title={`${s.label} · ${s.count} ${unit} (${pct}%)`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                fontSize: 12,
                color: 'var(--ink-2)',
                minWidth: 0,
                padding: '4px 6px',
                border: '1px solid',
                borderColor: isSelected ? 'var(--rule-strong)' : 'transparent',
                borderRadius: 6,
                background: isSelected ? 'var(--paper-2)' : 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
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
            </button>
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
