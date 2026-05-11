import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import type { CoincidenceCell, ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Square heatmap of pairwise group coincidence — what fraction of votes
 * each pair voted the same way on. Symmetric by construction (all pairs,
 * including diagonals = 1.0). Cell color interpolates between paper-3
 * (low) and accent (high); cell number shows the % only when cast >=
 * MIN_N to avoid suggesting precision we don't have.
 *
 * Per CLAUDE.md "regla de simetria": every group is shown, no ranking,
 * no "interesting" subsets.
 */

const MIN_N = 3;

export async function CoincidenceMatrix({
  groups,
  cells,
  highlightSlug,
}: {
  groups: ParliamentaryGroupSummary[];
  cells: CoincidenceCell[];
  /** Highlight this group's row and column. The rest of the matrix
   *  remains visible — symmetry rule, we never hide groups. */
  highlightSlug?: string | null;
}) {
  const t = await getTranslations('coincidence_matrix');
  if (cells.length === 0 || groups.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        {t('empty')}
      </p>
    );
  }
  const labels = {
    desktopCaption: t('desktop_caption', { minN: MIN_N }),
    mobileCaption: t('mobile_caption', { minN: MIN_N }),
    mobileExpand: t('mobile_expand'),
    cellTitle: (pct: number | string, votes: number) =>
      t('mobile_cell_title', { pct, votes }),
    noData: t('no_data'),
  };
  // Index cells by (a,b) for fast lookup
  const map = new Map<string, CoincidenceCell>();
  for (const c of cells) {
    map.set(`${c.group_a_slug}|${c.group_b_slug}`, c);
  }
  const sorted = [...groups].sort((a, b) => b.members_active - a.members_active);

  return (
    <>
      {/* Mobile (≤640px): per-group accordion. Every group is expandable —
          no group is privileged, preserving the symmetry rule. */}
      <MobileCoincidenceList
        groups={sorted}
        cells={map}
        highlightSlug={highlightSlug}
        labels={labels}
      />
      {/* Desktop matrix (≥640px): a grid of perfectly square cells where
          column and row headers are GroupBadge discs only — the long
          name lives in a Tooltip on hover/focus. This makes every column
          the same width and every row the same height regardless of how
          long the group's name is. Cells are 48×48 on desktop, falling
          to 36×36 in the narrower band between sm and md so the matrix
          still fits without horizontal scroll on tablets. */}
      <div
        // Note: NOT using overflow-x: auto here. Per CSS spec, declaring
        // overflow on one axis implicitly sets the other to "auto" too,
        // which clips the tooltips that pop ABOVE the column/row headers.
        // The matrix is content-sized (9 groups * 48px ≈ 480px) so it
        // fits any desktop viewport. Mobile uses the separate accordion.
        style={{ overflow: 'visible', maxWidth: '100%', position: 'relative' }}
        className="coincidence-wrap hidden sm:block"
      >
        <table
          className="coincidence-matrix"
          style={{
            borderCollapse: 'separate',
            borderSpacing: 2,
            // Width is content-driven (cells × cell-size), centered so
            // the matrix sits as a clean block rather than left-aligned.
            margin: '0 auto',
          }}
        >
          <thead>
            <tr>
              <th
                aria-hidden="true"
                style={{
                  // Header corner cell — matches the row-label column width.
                  width: 'var(--coincidence-label-w)',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                }}
              />
              {sorted.map((g) => {
                const isHighlight =
                  highlightSlug != null && g.slug === highlightSlug;
                return (
                  <th
                    key={g.slug}
                    scope="col"
                    style={{
                      width: 'var(--coincidence-cell)',
                      height: 'var(--coincidence-cell)',
                      padding: 0,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      borderBottom: isHighlight
                        ? '2px solid var(--ink)'
                        : 0,
                      // Override the global `.tab th` text-transform so
                      // GroupBadge initials render as-is.
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    <GroupHeaderCell group={g} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((rowG) => {
              const rowHighlight =
                highlightSlug != null && rowG.slug === highlightSlug;
              return (
                <tr key={rowG.slug}>
                  <th
                    scope="row"
                    style={{
                      width: 'var(--coincidence-label-w)',
                      height: 'var(--coincidence-cell)',
                      padding: 0,
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      borderBottom: 0,
                      borderLeft: rowHighlight
                        ? '2px solid var(--ink)'
                        : 'none',
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    <GroupHeaderCell group={rowG} />
                  </th>
                  {sorted.map((colG) => {
                    const onAxis =
                      highlightSlug != null &&
                      (rowG.slug === highlightSlug ||
                        colG.slug === highlightSlug);
                    return (
                      <Cell
                        key={colG.slug}
                        data={map.get(`${rowG.slug}|${colG.slug}`)}
                        isDiagonal={rowG.slug === colG.slug}
                        dim={highlightSlug != null && !onAxis}
                        rowName={displayGroupShort(rowG.name_short)}
                        colName={displayGroupShort(colG.name_short)}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {labels.desktopCaption}
        </p>
        {/* Square-cell sizing — defined once via custom properties so the
            cells, headers, and corner cell stay in lockstep. Tablet band
            uses smaller cells to avoid horizontal scrolling. */}
        <style>{`
          .coincidence-matrix {
            --coincidence-cell: 48px;
            --coincidence-label-w: 48px;
          }
          @media (max-width: 900px) {
            .coincidence-matrix {
              --coincidence-cell: 36px;
              --coincidence-label-w: 36px;
            }
          }
          /* Subtle focus ring on header badges so keyboard users see
             which header cell is active. Uses the same accent-color
             outline the rest of the site uses for focus. */
          .coincidence-matrix .term-tooltip a:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
            border-radius: 999px;
          }
        `}</style>
      </div>
    </>
  );
}

/**
 * Mobile-only accordion: each group is a collapsible `<details>` row.
 * Tapping a group reveals its coincidence with every OTHER group as a list
 * of mini bars. No JS state needed — `<details>` handles open/close. Per
 * "regla de simetria": every group is shown identically; nothing is
 * pre-expanded, nothing ranked.
 */
interface MatrixLabels {
  desktopCaption: string;
  mobileCaption: string;
  mobileExpand: string;
  cellTitle: (pct: number | string, votes: number) => string;
  noData: string;
}

function MobileCoincidenceList({
  groups,
  cells,
  highlightSlug,
  labels,
}: {
  groups: ParliamentaryGroupSummary[];
  cells: Map<string, CoincidenceCell>;
  highlightSlug?: string | null;
  labels: MatrixLabels;
}) {
  return (
    <div className="sm:hidden" style={{ marginTop: 4 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {groups.map((g) => {
          const isHighlight = highlightSlug != null && g.slug === highlightSlug;
          return (
            <li
              key={g.slug}
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <details>
                <summary
                  style={{
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 4px',
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontWeight: isHighlight ? 700 : 600,
                    borderLeft: isHighlight ? '3px solid var(--ink)' : '3px solid transparent',
                    paddingLeft: isHighlight ? 8 : 11,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: g.color_hex ?? 'var(--ink-3)',
                      flex: 'none',
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {displayGroupShort(g.name_short)}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {labels.mobileExpand}
                  </span>
                </summary>
                <div style={{ padding: '4px 4px 14px 14px' }}>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {groups
                      .filter((other) => other.slug !== g.slug)
                      .map((other) => {
                        const cell = cells.get(`${g.slug}|${other.slug}`);
                        const pct =
                          cell && cell.votes_compared >= MIN_N && cell.coincidence != null
                            ? Math.round(cell.coincidence * 100)
                            : null;
                        const width = pct == null ? 0 : pct;
                        return (
                          <li
                            key={other.slug}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 88px 38px',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 12,
                              color: 'var(--ink-2)',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 2,
                                  background: other.color_hex ?? 'var(--ink-3)',
                                  flex: 'none',
                                }}
                              />
                              {displayGroupShort(other.name_short)}
                            </span>
                            <span
                              aria-hidden="true"
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
                                  background: pct == null ? 'transparent' : 'var(--accent)',
                                  opacity: pct == null ? 0 : 0.85,
                                }}
                              />
                            </span>
                            <span
                              className="tabular"
                              style={{
                                fontWeight: 600,
                                textAlign: 'right',
                                color: pct == null ? 'var(--ink-3)' : 'var(--ink)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                              title={
                                cell
                                  ? labels.cellTitle(pct ?? '—', cell.votes_compared)
                                  : labels.noData
                              }
                            >
                              {pct == null ? '—' : `${pct}%`}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 10 }}>
        {labels.mobileCaption}
      </p>
    </div>
  );
}

/**
 * Group header cell used in the desktop coincidence matrix: a clickable
 * GroupBadge disc (linking to the group page) with a CSS-only hover/focus
 * tooltip that reveals the full group name.
 *
 * Uses the same `.term-tooltip` CSS classes as the shared :file:`Tooltip`
 * component (defined in globals.css) so the visual language stays
 * consistent — but renders the trigger as a `<Link>` directly rather
 * than wrapping it in a `role="button"` span. The shared `Tooltip` is
 * built around a focusable span anchor, which would create a
 * nested-interactive a11y issue when wrapping a Link.
 */
function GroupHeaderCell({ group }: { group: ParliamentaryGroupSummary }) {
  const shortName = displayGroupShort(group.name_short);
  const explanation =
    shortName === group.name_long ? shortName : `${shortName} — ${group.name_long}`;
  return (
    <span
      className="term-tooltip"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Link
        href={`/groups/${group.slug}`}
        aria-label={explanation}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          color: 'inherit',
          // The Link itself is the focus target; on focus, the
          // surrounding `.term-tooltip` selector reveals the bubble via
          // `:focus-within`.
          outline: 'none',
        }}
      >
        <GroupBadge
          slug={group.slug}
          color={group.color_hex}
          size="sm"
          link={false}
        />
      </Link>
      <span className="term-tooltip__bubble" role="tooltip">
        {explanation}
      </span>
    </span>
  );
}

function Cell({
  data,
  isDiagonal,
  dim = false,
  rowName,
  colName,
}: {
  data: CoincidenceCell | undefined;
  isDiagonal: boolean;
  /** Outside the highlighted row/column. We keep the cell visible but
   *  reduce its contrast. */
  dim?: boolean;
  /** Used to build the native title tooltip so users learn which two
   *  groups intersect at this cell — the column/row headers are now
   *  abbreviations only, so we restore the pair name here. */
  rowName: string;
  colName: string;
}) {
  const pct =
    data && data.votes_compared >= MIN_N && data.coincidence != null
      ? Math.round(data.coincidence * 100)
      : null;
  // Color interpolation: low (paper-3) → high (accent)
  const bg =
    pct == null
      ? 'var(--paper-2)'
      : isDiagonal
        ? 'var(--ink)'
        : `color-mix(in oklch, var(--accent) ${pct}%, var(--paper-2))`;
  const fg = pct != null && pct >= 55 ? 'white' : 'var(--ink)';
  return (
    <td
      style={{
        // Square cell driven by the same custom properties as the
        // headers, so every cell — header or data — is identical in
        // size and the grid stays perfectly aligned.
        width: 'var(--coincidence-cell)',
        height: 'var(--coincidence-cell)',
        background: bg,
        color: fg,
        textAlign: 'center',
        verticalAlign: 'middle',
        fontSize: 12,
        fontWeight: 600,
        padding: 0,
        borderBottom: 0,
        borderRadius: 4,
        fontVariantNumeric: 'tabular-nums',
        opacity: dim ? 0.35 : 1,
      }}
      title={
        data
          ? `${rowName} ↔ ${colName} · ${pct ?? '—'}% coincidència · ${data.votes_compared} votacions`
          : `${rowName} ↔ ${colName} · sense dades`
      }
    >
      {pct == null ? '—' : `${pct}`}
    </td>
  );
}
