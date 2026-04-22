import Link from 'next/link';

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

export function CoincidenceMatrix({
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
  if (cells.length === 0 || groups.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Encara no hi ha prou votacions per calcular coincidències.
      </p>
    );
  }
  // Index cells by (a,b) for fast lookup
  const map = new Map<string, CoincidenceCell>();
  for (const c of cells) {
    map.set(`${c.group_a_slug}|${c.group_b_slug}`, c);
  }
  const sorted = [...groups].sort((a, b) => b.members_active - a.members_active);

  return (
    <div style={{ overflowX: 'auto' }} className="coincidence-wrap">
      <table
        className="tab"
        style={{ borderCollapse: 'separate', borderSpacing: 2, minWidth: 540 }}
      >
        <thead>
          <tr>
            <th style={{ minWidth: 100 }} />
            {sorted.map((g) => {
              const isHighlight = highlightSlug != null && g.slug === highlightSlug;
              return (
                <th
                  key={g.slug}
                  style={{
                    textAlign: 'center',
                    fontSize: 10,
                    letterSpacing: '0.04em',
                    color: isHighlight ? 'var(--ink)' : 'var(--ink-3)',
                    padding: '6px 4px',
                    borderBottom: isHighlight ? '2px solid var(--ink)' : 0,
                    fontWeight: isHighlight ? 700 : 400,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 1,
                        background: g.color_hex ?? 'var(--ink-3)',
                      }}
                    />
                    {displayGroupShort(g.name_short)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((rowG) => {
            const rowHighlight = highlightSlug != null && rowG.slug === highlightSlug;
            return (
              <tr key={rowG.slug}>
                <th
                  scope="row"
                  style={{
                    textAlign: 'right',
                    fontSize: 11,
                    letterSpacing: 0,
                    textTransform: 'none',
                    fontWeight: rowHighlight ? 700 : 600,
                    color: 'var(--ink)',
                    padding: '6px 10px',
                    borderBottom: 0,
                    whiteSpace: 'nowrap',
                    borderLeft: rowHighlight ? '2px solid var(--ink)' : 'none',
                  }}
                >
                  <Link
                    href={`/groups/${rowG.slug}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 1,
                        background: rowG.color_hex ?? 'var(--ink-3)',
                      }}
                    />
                    {displayGroupShort(rowG.name_short)}
                  </Link>
                </th>
                {sorted.map((colG) => {
                  const onAxis =
                    highlightSlug != null &&
                    (rowG.slug === highlightSlug || colG.slug === highlightSlug);
                  return (
                    <Cell
                      key={colG.slug}
                      data={map.get(`${rowG.slug}|${colG.slug}`)}
                      isDiagonal={rowG.slug === colG.slug}
                      dim={highlightSlug != null && !onAxis}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
        % de votacions on els dos grups van votar el mateix sentit (Sí, No o
        Abstenció). La diagonal és sempre 100% per construcció. Pares
        amb menys de {MIN_N} votacions comparades es mostren en blanc.
      </p>
    </div>
  );
}

function Cell({
  data,
  isDiagonal,
  dim = false,
}: {
  data: CoincidenceCell | undefined;
  isDiagonal: boolean;
  /** Outside the highlighted row/column. We keep the cell visible but
   *  reduce its contrast. */
  dim?: boolean;
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
        background: bg,
        color: fg,
        textAlign: 'center',
        fontSize: 11,
        fontWeight: 600,
        padding: '10px 4px',
        minWidth: 44,
        height: 36,
        borderBottom: 0,
        borderRadius: 4,
        fontVariantNumeric: 'tabular-nums',
        opacity: dim ? 0.35 : 1,
      }}
      title={
        data
          ? `${pct ?? '—'}% coincidència · ${data.votes_compared} votacions`
          : 'Sense dades'
      }
    >
      {pct == null ? '—' : `${pct}`}
    </td>
  );
}
