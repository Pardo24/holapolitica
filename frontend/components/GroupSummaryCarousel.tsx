import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { Tooltip } from '@/components/Tooltip';
import type { GroupSummaryRow } from '@/lib/api';
import { glossaryShort } from '@/lib/glossary';
import { displayGroupShort } from '@/lib/groups';

/**
 * Horizontal scroll-snap carousel of per-group summary cards.
 *
 * Replaces the redundant "Cohesió per grup" + "Assistència per grup" bar
 * charts plus the grid of GroupSummaryGrid. Each card folds cohesion %,
 * attendance %, and member count into one tap target into ``/groups/<slug>``.
 *
 * Neutrality (CLAUDE.md "regla de simetria"): every group rendered, in
 * deterministic order (members_active desc). ``highlightSlug`` is reserved
 * for filtered views where the user has explicitly selected a focus.
 */
export async function GroupSummaryCarousel({
  rows,
  highlightSlug,
}: {
  rows: GroupSummaryRow[];
  highlightSlug?: string | null;
}) {
  const t = await getTranslations('group_summary_carousel');
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {t('empty')}
      </p>
    );
  }
  const ordered = highlightSlug
    ? [
        ...rows.filter((r) => r.group_slug === highlightSlug),
        ...rows
          .filter((r) => r.group_slug !== highlightSlug)
          .sort((a, b) => b.members_active - a.members_active),
      ]
    : [...rows].sort((a, b) => b.members_active - a.members_active);

  return (
    <div style={{ position: 'relative' }}>
      <ul
        role="list"
        aria-label={t('aria_label')}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '4px 2px 12px',
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
        }}
      >
        {ordered.map((row) => (
          <GroupSummaryCard
            key={row.group_slug}
            row={row}
            highlighted={row.group_slug === highlightSlug}
            labels={{
              cohesion: t('cohesion_short'),
              attendance: t('attendance_short'),
              deputies: t('deputies'),
            }}
          />
        ))}
      </ul>
      {/* Edge fades — decorative scrollability hint, pointer-events:none. */}
      <span aria-hidden="true" style={{ ...edgeFade, left: 0, background: 'linear-gradient(to right, var(--paper) 0%, transparent 100%)' }} />
      <span aria-hidden="true" style={{ ...edgeFade, right: 0, background: 'linear-gradient(to left, var(--paper) 0%, transparent 100%)' }} />
    </div>
  );
}

const edgeFade: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 12,
  width: 24,
  pointerEvents: 'none',
};

function GroupSummaryCard({
  row,
  highlighted = false,
  labels,
}: {
  row: GroupSummaryRow;
  highlighted?: boolean;
  labels: { cohesion: string; attendance: string; deputies: string };
}) {
  const cohesionPct =
    row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
  const attendancePct =
    row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
  return (
    <li style={{ flex: '0 0 240px', width: 240, scrollSnapAlign: 'start' }}>
      <Link
        href={`/groups/${row.group_slug}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: 16,
          background: highlighted ? 'var(--paper)' : 'var(--paper-2)',
          border: highlighted ? '2px solid var(--ink)' : '1px solid var(--rule)',
          borderRadius: 12,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, minWidth: 0 }}>
          <GroupBadge slug={row.group_slug} color={row.group_color_hex} size="sm" link={false} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={row.group_name_short}
          >
            {displayGroupShort(row.group_name_short)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <DonutPct
            value={cohesionPct}
            label={<Tooltip term={labels.cohesion} explanation={glossaryShort('cohesion')} />}
            color="var(--ink)"
          />
          <DonutPct
            value={attendancePct}
            label={<Tooltip term={labels.attendance} explanation={glossaryShort('attendance')} />}
            color="var(--accent)"
          />
        </div>

        <span
          className="tabular"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            marginTop: 'auto',
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-2)',
            background: 'var(--paper-3)',
            borderRadius: 999,
          }}
        >
          <span>{row.members_active}</span>
          <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{labels.deputies}</span>
        </span>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}
