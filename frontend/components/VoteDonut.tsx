/**
 * Half-donut visual recount for one vote.
 *
 * Two concentric rings over a 180° arc:
 *
 * - OUTER ring: one segment per choice — Sí (green, grows from the
 *   left), Abstencions, Absents, No (red, ends at the right). A quiet
 *   tick at the top marks half the chamber, so "did the green pass
 *   the middle?" reads at a glance.
 * - INNER ring: within each choice block, one segment per
 *   parliamentary group (its own color), sized by how many of its
 *   deputies cast that choice. Hovering a segment shows
 *   "Group — N label" via a native <title>.
 *
 * Server component: pure SVG, no client JS. Neutral by construction —
 * it encodes only the official per-group tallies, in the same green/
 * red/amber/grey semantics as ResultPill and StackedBar.
 */

import type { CohesionResult } from '@/lib/api';

type ChoiceKey = 'aye' | 'no' | 'abstention' | 'absent';

const CHOICE_COLOR: Record<ChoiceKey, string> = {
  aye: 'var(--aye)',
  no: 'var(--no)',
  abstention: 'var(--abst)',
  absent: 'var(--nv)',
};

/** Angular order: Sí grows from the left edge, No ends at the right
 *  edge, the neutral outcomes sit in between. */
const CHOICE_ORDER: ChoiceKey[] = ['aye', 'abstention', 'absent', 'no'];

const GROUP_FALLBACK_COLOR = '#9ca3af';

// Geometry (viewBox units). Center sits on the bottom edge so the
// half-donut fills the box without dead space below.
const W = 320;
const H = 175;
const CX = W / 2;
const CY = 168;
const OUTER_R1 = 150;
const OUTER_R0 = 112;
const INNER_R1 = 108;
const INNER_R0 = 76;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)];
}

/**
 * Ring segment between angles ``a0 > a1`` (degrees, 180 = left edge,
 * 0 = right edge) and radii ``r0 < r1``.
 */
function ringPath(r0: number, r1: number, a0: number, a1: number): string {
  const large = a0 - a1 > 180 ? 1 : 0;
  const [x1, y1] = polar(r1, a0);
  const [x2, y2] = polar(r1, a1);
  const [x3, y3] = polar(r0, a1);
  const [x4, y4] = polar(r0, a0);
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export interface VoteDonutLabels {
  aye: string;
  no: string;
  abstention: string;
  absent: string;
}

export function VoteDonut({
  totals,
  groups,
  labels,
  ariaLabel,
}: {
  totals: Record<ChoiceKey, number>;
  /** Per-group tallies from the cohesion endpoint. Empty → the inner
   *  ring is simply omitted; the outer recount still renders. */
  groups: CohesionResult[];
  labels: VoteDonutLabels;
  ariaLabel: string;
}) {
  const total = CHOICE_ORDER.reduce((acc, k) => acc + totals[k], 0);
  if (total <= 0) return null;

  // Outer ring: cumulative angles per choice, small padding between
  // non-empty blocks so the boundaries stay crisp.
  const PAD = 0.6;
  const spanFor = (n: number) => (n / total) * 180;
  const outer: { key: ChoiceKey; a0: number; a1: number; n: number }[] = [];
  let cursor = 180;
  for (const key of CHOICE_ORDER) {
    const n = totals[key];
    if (n <= 0) continue;
    const a0 = cursor;
    const a1 = cursor - spanFor(n);
    outer.push({ key, a0, a1, n });
    cursor = a1;
  }

  // Inner ring: subdivide each choice block by group contribution.
  // Normalised inside the block (group sums can differ slightly from
  // the official totals when a record is missing) so the two rings
  // always stay aligned.
  const groupCount = (g: CohesionResult, key: ChoiceKey): number =>
    key === 'aye'
      ? g.ayes
      : key === 'no'
        ? g.noes
        : key === 'abstention'
          ? g.abstentions
          : g.no_vote;

  const inner: {
    key: string;
    a0: number;
    a1: number;
    color: string;
    title: string;
  }[] = [];
  for (const block of outer) {
    const contributors = groups
      .map((g) => ({ g, n: groupCount(g, block.key) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    const blockSum = contributors.reduce((acc, x) => acc + x.n, 0);
    if (blockSum <= 0) continue;
    let c = block.a0;
    for (const { g, n } of contributors) {
      const span = ((block.a0 - block.a1) * n) / blockSum;
      inner.push({
        key: `${block.key}:${g.group_slug}`,
        a0: c,
        a1: c - span,
        color: g.group_color_hex ?? GROUP_FALLBACK_COLOR,
        title: `${g.group_name_short} — ${n} ${labels[block.key]}`,
      });
      c -= span;
    }
  }

  // Half-the-chamber tick at 90°.
  const [tx1, ty1] = polar(OUTER_R1 + 2, 90);
  const [tx2, ty2] = polar(OUTER_R1 + 10, 90);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {outer.map((s) => (
        <path
          key={s.key}
          d={ringPath(OUTER_R0, OUTER_R1, s.a0, Math.min(s.a0 - 0.01, s.a1 + PAD / 2))}
          fill={CHOICE_COLOR[s.key]}
        >
          <title>{`${labels[s.key]}: ${s.n}`}</title>
        </path>
      ))}
      {inner.map((s) => (
        <path
          key={s.key}
          d={ringPath(INNER_R0, INNER_R1, s.a0, Math.min(s.a0 - 0.01, s.a1 + 0.3))}
          fill={s.color}
        >
          <title>{s.title}</title>
        </path>
      ))}
      {/* Midpoint tick — half the chamber. */}
      <line
        x1={tx1}
        y1={ty1}
        x2={tx2}
        y2={ty2}
        stroke="var(--ink-3)"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </svg>
  );
}
