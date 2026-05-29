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
    women: t('women_short'),
    men: t('men_short'),
    other: t('other_short'),
    ageAvg: t('age_avg_short'),
    ageUnit: t('age_unit'),
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
    women: string;
    men: string;
    other: string;
    ageAvg: string;
    ageUnit: string;
  };
}) {
  const cohesionPct =
    row.avg_cohesion == null ? null : Math.round(row.avg_cohesion * 100);
  const attendancePct =
    row.avg_attendance == null ? null : Math.round(row.avg_attendance * 100);
  const genderTotal = row.members_f + row.members_m + row.members_other;
  const fPct = genderTotal > 0 ? Math.round((row.members_f / genderTotal) * 100) : 0;
  const mPct = genderTotal > 0 ? Math.round((row.members_m / genderTotal) * 100) : 0;
  const otherPct = Math.max(0, 100 - fPct - mPct);
  const avgAge =
    row.members_age_avg == null ? null : Math.round(row.members_age_avg);
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

        {/* Demographics — the dominant block on each card. Two columns:
            LEFT shows the F / M / Altres counts stacked (big numbers,
            tinted dots) so the gender split reads at a glance; RIGHT
            shows the average age as a single large figure. Below
            both, a thin stacked bar gives the proportional shape. */}
        {genderTotal > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <div
                className="tabular"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  alignItems: 'baseline',
                }}
              >
                <GenderStat
                  count={row.members_f}
                  label={labels.women}
                  color="#B7568C"
                />
                <GenderStat
                  count={row.members_m}
                  label={labels.men}
                  color="#5470B0"
                />
                {row.members_other > 0 && (
                  <GenderStat
                    count={row.members_other}
                    label={labels.other}
                    color="var(--ink-3)"
                  />
                )}
              </div>
              {avgAge != null && (
                <div
                  style={{
                    textAlign: 'right',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  <div
                    className="tabular"
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1,
                    }}
                  >
                    {avgAge}
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--ink-3)',
                        fontWeight: 600,
                        marginLeft: 2,
                      }}
                    >
                      {labels.ageUnit.trim()}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                    }}
                  >
                    {labels.ageAvg}
                  </div>
                </div>
              )}
            </div>
            <div
              role="img"
              aria-label={`${labels.women} ${fPct}%, ${labels.men} ${mPct}%, ${labels.other} ${otherPct}%`}
              style={{
                display: 'flex',
                height: 5,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'var(--paper-3)',
                marginTop: 8,
              }}
            >
              {row.members_f > 0 && (
                <span style={{ width: `${fPct}%`, background: '#B7568C' }} />
              )}
              {row.members_m > 0 && (
                <span style={{ width: `${mPct}%`, background: '#5470B0' }} />
              )}
              {row.members_other > 0 && (
                <span style={{ width: `${otherPct}%`, background: 'var(--ink-3)' }} />
              )}
            </div>
          </div>
        )}

        {/* Cohesion + attendance — secondary metrics, rendered as a
            compact one-line caption rather than the previous twin
            donuts so the demographic block above stays the focal
            point. */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 11,
            color: 'var(--ink-3)',
            paddingTop: 10,
            borderTop: '1px solid var(--rule)',
          }}
        >
          <span>
            <Tooltip term={labels.cohesion} explanation={glossaryShort('cohesion')} />{' '}
            <strong className="tabular" style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {cohesionPct == null ? '—' : `${cohesionPct}%`}
            </strong>
          </span>
          <span>
            <GlossaryTerm term="Vots emesos">{labels.attendance}</GlossaryTerm>{' '}
            <strong
              className="tabular"
              style={{ color: 'var(--accent)', fontWeight: 700 }}
            >
              {attendancePct == null ? '—' : `${attendancePct}%`}
            </strong>
          </span>
        </div>
      </Link>
    </li>
  );
}

/**
 * Compact stat element for a single gender bucket — a tinted dot
 * followed by the count and the label. Kept in flex so the three
 * stats wrap gracefully on narrow cards.
 */
function GenderStat({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 999,
          background: color,
          transform: 'translateY(-1px)',
        }}
      />
      <strong
        className="tabular"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {count}
      </strong>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
    </span>
  );
}
