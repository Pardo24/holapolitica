'use client';

/**
 * Progressive-disclosure wrapper around :file:`CoincidenceMatrix`.
 *
 * The full N×N matrix has every pair on screen for transparency — but
 * 72 cells of percentages dropped on a reader at once is a lot. This
 * wrapper splits the read in two:
 *
 *   1. A row of group chips at the top, in stable order (members
 *      descending). Tapping one focuses the view on THAT group's
 *      coincidence with every other group, sorted from highest to
 *      lowest. Still complete — the symmetry rule is preserved
 *      because the focused view never hides a group, it just sorts
 *      them.
 *
 *   2. A collapsed "see the full matrix" `<details>` toggle below, so
 *      the original matrix is still one tap away when the user wants
 *      the canonical view. The matrix itself is passed in as
 *      ``children`` so the rendering (server-side CoincidenceMatrix)
 *      stays exactly as it was.
 *
 * Neutrality (CLAUDE.md):
 *   - Every group is a chip; the chip strip has no curation.
 *   - The focused view shows ALL other groups, sorted neutrally by
 *     the underlying coincidence number — no "top N", no "interesting
 *     pairs".
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { GroupBadge } from '@/components/GroupBadge';
import type { CoincidenceCell, ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

const MIN_N = 3;

export function CoincidenceProgressive({
  groups,
  cells,
  children,
}: {
  groups: ParliamentaryGroupSummary[];
  cells: CoincidenceCell[];
  /** Server-rendered matrix node — shown inside the "full matrix"
   *  details. We accept it as children so this wrapper stays a thin
   *  client island; the heavy table render is still SSR-only. */
  children: React.ReactNode;
}) {
  const t = useTranslations('coincidence_progressive');
  const [focused, setFocused] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Stable order: members descending, ties broken alphabetically.
  const ordered = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          b.members_active - a.members_active ||
          a.name_short.localeCompare(b.name_short),
      ),
    [groups],
  );

  // Index cells by ordered pair string for fast lookup. Coincidence is
  // symmetric so we accept both directions.
  const map = useMemo(() => {
    const m = new Map<string, CoincidenceCell>();
    for (const c of cells) {
      m.set(`${c.group_a_slug}|${c.group_b_slug}`, c);
      m.set(`${c.group_b_slug}|${c.group_a_slug}`, c);
    }
    return m;
  }, [cells]);

  const focusedGroup = focused
    ? ordered.find((g) => g.slug === focused) ?? null
    : null;

  // Sorted row vs all other groups for the focused view. ``null``
  // coincidence (insufficient data) falls to the bottom so the
  // readable rows live at the top.
  const focusedRows = useMemo(() => {
    if (!focusedGroup) return [];
    return ordered
      .filter((g) => g.slug !== focusedGroup.slug)
      .map((g) => {
        const cell = map.get(`${focusedGroup.slug}|${g.slug}`);
        const ok =
          cell && cell.coincidence != null && cell.votes_compared >= MIN_N;
        return {
          group: g,
          pct: ok ? Math.round((cell!.coincidence as number) * 100) : null,
          votes: cell?.votes_compared ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.pct == null && b.pct == null) return 0;
        if (a.pct == null) return 1;
        if (b.pct == null) return -1;
        return b.pct - a.pct;
      });
  }, [focusedGroup, map, ordered]);

  return (
    <div>
      {/* Chip row — choose a group to focus. Horizontal scroll snap
          so long lists fling on mobile. */}
      <div
        className="coincidence-chips"
        role="navigation"
        aria-label={t('chips_aria')}
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          padding: '4px 2px 12px',
        }}
      >
        <button
          type="button"
          onClick={() => setFocused(null)}
          aria-pressed={focused === null}
          style={chipStyle(focused === null, 'var(--ink-3)')}
        >
          {t('all_groups')}
        </button>
        {ordered.map((g) => {
          const isActive = focused === g.slug;
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => setFocused(g.slug)}
              aria-pressed={isActive}
              style={chipStyle(isActive, g.color_hex ?? 'var(--ink-3)')}
            >
              <GroupBadge
                slug={g.slug}
                color={g.color_hex}
                size="xs"
                link={false}
              />
              <span style={{ whiteSpace: 'nowrap' }}>
                {displayGroupShort(g.name_short)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Focused row view OR prompt. */}
      {focusedGroup ? (
        <section
          aria-label={t('focused_aria', {
            group: displayGroupShort(focusedGroup.name_short),
          })}
          style={{ paddingTop: 4, paddingBottom: 6 }}
        >
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-2)',
              margin: '0 0 14px',
              lineHeight: 1.5,
            }}
          >
            {t('focused_caption', {
              group: displayGroupShort(focusedGroup.name_short),
            })}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {focusedRows.map(({ group, pct, votes }) => (
              <li
                key={group.slug}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <GroupBadge
                      slug={group.slug}
                      color={group.color_hex}
                      size="xs"
                      link={false}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={group.name_short}
                    >
                      {displayGroupShort(group.name_short)}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={
                      pct == null
                        ? t('row_no_data', {
                            group: displayGroupShort(group.name_short),
                          })
                        : t('row_aria', {
                            group: displayGroupShort(group.name_short),
                            pct,
                          })
                    }
                    style={{
                      display: 'flex',
                      height: 8,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'var(--paper-3)',
                    }}
                  >
                    {pct != null && (
                      <span
                        style={{
                          width: `${pct}%`,
                          background: barColor(pct, focusedGroup.color_hex),
                        }}
                      />
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 64 }}>
                  {pct != null ? (
                    <>
                      <div
                        className="tabular"
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          letterSpacing: '-0.01em',
                          lineHeight: 1,
                        }}
                      >
                        {pct}%
                      </div>
                      <div
                        className="tabular"
                        style={{
                          fontSize: 10,
                          color: 'var(--ink-3)',
                          marginTop: 2,
                        }}
                      >
                        {t('row_votes', { count: votes })}
                      </div>
                    </>
                  ) : (
                    <div
                      style={{ fontSize: 11, color: 'var(--ink-3)' }}
                    >
                      {t('row_low_n')}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--ink-3)',
            lineHeight: 1.5,
          }}
        >
          {t('prompt')}
        </p>
      )}

      {/* Full matrix — collapsed by default, accessible to anyone who
          wants the canonical complete view. */}
      <details
        open={expanded}
        onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
        style={{ marginTop: 18 }}
      >
        <summary
          style={{
            cursor: 'pointer',
            listStyle: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            border: '1px solid var(--rule-strong)',
            background: 'var(--paper)',
            color: 'var(--ink-2)',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {expanded ? t('hide_matrix') : t('show_matrix')}
        </summary>
        <div style={{ marginTop: 14 }}>{children}</div>
      </details>
    </div>
  );
}

function chipStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    flex: 'none',
    scrollSnapAlign: 'start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? '1px solid var(--ink)' : '1px solid var(--rule)',
    background: active ? 'var(--ink)' : 'var(--paper)',
    color: active ? 'var(--paper)' : 'var(--ink)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background-color .12s ease, border-color .12s ease, color .12s ease',
    minHeight: 36,
    outlineColor: accent,
  };
}

function barColor(pct: number, fallback: string | null): string {
  // Tint the bar with the focused group's brand color, with intensity
  // proportional to the coincidence percentage so the eye reads
  // "stronger overlap = denser fill" without needing the number.
  const c = fallback ?? 'var(--ink-2)';
  if (pct >= 80) return c;
  if (pct >= 60) return `color-mix(in oklch, ${c} 78%, var(--paper))`;
  if (pct >= 40) return `color-mix(in oklch, ${c} 55%, var(--paper))`;
  return `color-mix(in oklch, ${c} 32%, var(--paper))`;
}
