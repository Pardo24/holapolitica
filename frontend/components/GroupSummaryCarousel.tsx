import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { ScrollCarousel } from '@/components/ScrollCarousel';
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

  const cardLabels = {
    cohesion: t('cohesion_short'),
    attendance: t('attendance_short'),
    deputies: t('deputies'),
  };

  return (
    <ScrollCarousel
      ariaLabel={t('aria_label')}
      prevLabel={t('aria_label')}
      nextLabel={t('aria_label')}
    >
      {ordered.map((row) => (
        <GroupSummaryCard
          key={row.group_slug}
          row={row}
          highlighted={row.group_slug === highlightSlug}
          labels={cardLabels}
        />
      ))}
    </ScrollCarousel>
  );
}

function GroupSummaryCard({
  row,
  highlighted = false,
  labels,
}: {
  row: GroupSummaryRow;
  highlighted?: boolean;
  labels: {
    cohesion: string;
    attendance: string;
    deputies: string;
  };
}) {
  const cohesionPct =
    row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
  const attendancePct =
    row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
  return (
    <li style={{ flex: '0 0 244px', width: 244, scrollSnapAlign: 'start' }}>
      <Link
        href={`/groups/${row.group_slug}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '12px 14px 14px',
          background: highlighted ? 'var(--paper)' : 'var(--paper-2)',
          border: highlighted ? '2px solid var(--ink)' : '1px solid var(--rule)',
          borderRadius: 12,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, minWidth: 0 }}>
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
          <span
            className="tabular"
            aria-label={`${row.members_active} ${labels.deputies}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 7px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-2)',
              background: 'var(--paper-3)',
              borderRadius: 999,
              flex: 'none',
            }}
          >
            <span>{row.members_active}</span>
            <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{labels.deputies}</span>
          </span>
        </div>

        {/* Voting behaviour — the focal metrics for a group: how cohesively it
            votes and how much it turns out. (The demographic block that used to
            dominate here was removed — it was noise, not signal.) */}
        <div style={{ marginTop: 4, display: 'flex', gap: 12 }}>
          <CardMetric
            term={<Tooltip term={labels.cohesion} explanation={glossaryShort('cohesion')} />}
            value={cohesionPct == null ? '—' : `${cohesionPct}%`}
            color="var(--ink)"
          />
          <CardMetric
            term={<GlossaryTerm term="Vots emesos">{labels.attendance}</GlossaryTerm>}
            value={attendancePct == null ? '—' : `${attendancePct}%`}
            color="var(--accent)"
          />
        </div>
      </Link>
    </li>
  );
}

/** A single group metric on the summary card: a small caption over a big
 *  figure (cohesion, attendance). */
function CardMetric({ term, value, color }: { term: ReactNode; value: string; color: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{term}</span>
      <strong
        className="tabular"
        style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.01em', lineHeight: 1 }}
      >
        {value}
      </strong>
    </div>
  );
}
