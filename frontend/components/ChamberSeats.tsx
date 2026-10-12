'use client';

/**
 * The seats of {@link ChamberMap}, drawn from flat coordinate lists.
 *
 * A client component for the payload only, there is nothing interactive
 * here: drawn by the server component, the ~400 circles travelled in the
 * RSC payload as one element each (~45 bytes apiece). As props they are a
 * list of numbers. The SVG in the HTML is the same.
 */
export function ChamberSeats({
  r,
  chairs,
  groups,
}: {
  r: number;
  /** Empty chairs as x0, y0, x1, y1, ... */
  chairs: number[];
  /** Occupied seats per group colour, as x0, y0, x1, y1, ... */
  groups: { color: string; xy: number[] }[];
}) {
  return (
    <>
      {/* Shared attributes live on the <g>, never on each circle. */}
      {/* The chairs with nobody in them — the cabinet benches, and any
          seat vacant between a resignation and its replacement. */}
      <g fill="none" stroke="var(--rule-strong)" strokeWidth={1} opacity={0.6}>
        {pairs(chairs).map(([x, y]) => (
          <circle key={`chair-${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      {/* The deputies, one group per colour. */}
      {groups.map(({ color, xy }) => (
        <g key={color} fill={color} stroke="rgba(20, 28, 60, 0.18)" strokeWidth={1}>
          {pairs(xy).map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      ))}
    </>
  );
}

function pairs(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] as number, flat[i + 1] as number]);
  return out;
}
