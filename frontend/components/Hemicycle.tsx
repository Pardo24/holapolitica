/**
 * Symbolic hemicycle composition rendered as a true semicircular arc in
 * SVG. Each seat is a colored disc placed on one of N concentric arcs;
 * outer arcs hold more seats than inner arcs so the visual mirrors a
 * real parliament floor. SVG (rather than HTML+Flexbox) gives us
 * proper proportional scaling — the chart maintains a clean 2:1
 * aspect ratio at any container width without wrapping, clipping, or
 * recomputing seat sizes per viewport.
 *
 * The order is preserved as the caller passes it: ie. groups should be
 * sorted left-to-right by political family before passing in. Seats
 * are laid out arc-by-arc, sweeping from left (180°) to right (0°),
 * pulling from a flat array of `members` slots × N groups.
 */
export function Hemicycle({
  groups,
  rows = 8,
}: {
  groups: { slug: string; members: number; color: string | null }[];
  rows?: number;
}) {
  const totalSeats = groups.reduce((acc, g) => acc + g.members, 0);
  if (totalSeats === 0) return null;

  // Flatten the group composition into a single array of seat-color
  // tokens so we can sweep the whole hemicycle in one pass.
  const seats: { color: string; slug: string }[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.members; i++) {
      seats.push({ color: g.color ?? '#9ca3af', slug: g.slug });
    }
  }

  // Distribute seats per arc proportional to that arc's circumference —
  // outer arcs (larger radius) get more seats. We use the row index +
  // base offset to keep the innermost arc usable (not zero-radius).
  const rowSizes: number[] = [];
  const weights: number[] = [];
  let weightSum = 0;
  for (let r = 0; r < rows; r++) {
    const w = r + 3;
    weights.push(w);
    weightSum += w;
  }
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    const w = weights[r] ?? 0;
    const n = Math.round((totalSeats * w) / weightSum);
    rowSizes.push(n);
    acc += n;
  }
  // Absorb any rounding remainder into the outermost arc — it has the
  // most space and the eye is least sensitive to one extra seat there.
  rowSizes[rows - 1] = (rowSizes[rows - 1] ?? 0) + (totalSeats - acc);

  // Geometry — chart fits a 200×100 viewBox. The arcs span radii
  // [innerR, outerR] divided into `rows` concentric rings centered at
  // (100, 95). The 5px vertical margin keeps seats from kissing the
  // bottom rule.
  const cx = 100;
  const cy = 95;
  const innerR = 28;
  const outerR = 92;
  const ringStep = (outerR - innerR) / Math.max(rows - 1, 1);
  const seatRadius = Math.min(2.6, ringStep * 0.36);

  // Place seats: for each row, sweep from 180° (left) to 0° (right),
  // dropping `rowSizes[r]` seats evenly along the arc.
  let cursor = 0;
  const placedSeats: {
    cx: number;
    cy: number;
    color: string;
    slug: string;
    row: number;
  }[] = [];
  for (let r = 0; r < rows; r++) {
    const radius = innerR + r * ringStep;
    const n = rowSizes[r] ?? 0;
    if (n === 0) continue;
    for (let i = 0; i < n; i++) {
      // (i + 0.5) / n places the seats in the centers of equal arc
      // segments rather than at the segment edges — avoids a seat
      // exactly on the horizontal baseline.
      const theta = Math.PI - ((i + 0.5) / n) * Math.PI;
      const seat = seats[cursor++];
      if (!seat) continue;
      placedSeats.push({
        cx: cx + Math.cos(theta) * radius,
        cy: cy - Math.sin(theta) * radius,
        color: seat.color,
        slug: seat.slug,
        row: r,
      });
    }
  }

  // Build a screen-reader summary listing every group in the chart in
  // the same order shown. Replaces the previous "Composition: N seats
  // across M groups" stub which was technically accurate but unusable.
  const ariaSummary = groups
    .map((g) => `${g.slug}: ${g.members}`)
    .join(', ');

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
      }}
      role="img"
      aria-label={`Hemicycle composition: ${totalSeats} seats — ${ariaSummary}`}
    >
      <svg
        viewBox="0 0 200 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-hidden="true"
      >
        {placedSeats.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={seatRadius}
            fill={s.color}
            // Outer rings slightly lighter than inner ones — mirrors the
            // perspective of a parliament floor viewed from the press
            // gallery (back rows recede).
            opacity={s.row < 2 ? 0.65 : 0.92}
          >
            <title>{s.slug}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
