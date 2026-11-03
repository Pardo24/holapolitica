'use client';

import { useState } from 'react';

export interface ChamberGroup {
  slug: string;
  /** Short name, as the legend prints it. */
  short: string;
  color: string;
  count: number;
  /** "121 escons": the count in words, for the name shown on hover. */
  seats: string;
  /** Its seats as x0, y0, x1, y1, ... */
  xy: number[];
}

/**
 * The seats and legend of {@link ChamberMap}, drawn from flat coordinate
 * lists (as props the ~400 circles are a list of numbers, not one RSC
 * element each).
 *
 * Pointing at a group, in the drawing or in the legend, lights it up: the
 * other groups fade and its name and seats appear in the middle of the
 * room. Every group answers the same way; none is lit at rest.
 */
export function ChamberSeats({
  r,
  width,
  height,
  ariaLabel,
  chairs,
  groups,
}: {
  r: number;
  width: number;
  height: number;
  ariaLabel: string;
  /** Empty chairs as x0, y0, x1, y1, ... */
  chairs: number[];
  /** Groups by size, biggest first. */
  groups: ChamberGroup[];
}) {
  const [lit, setLit] = useState<string | null>(null);
  const active = groups.find((g) => g.slug === lit) ?? null;

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        onMouseLeave={() => setLit(null)}
      >
        {/* Shared attributes live on the <g>, never on each circle. */}
        {/* The chairs with nobody in them: the cabinet benches, and any
            seat vacant between a resignation and its replacement. */}
        <g fill="none" stroke="var(--rule-strong)" strokeWidth={1} opacity={0.6}>
          {pairs(chairs).map(([x, y]) => (
            <circle key={`chair-${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        {/* The deputies, one group each. */}
        {groups.map((g) => (
          <g
            key={g.slug}
            fill={g.color}
            stroke="rgba(20, 28, 60, 0.18)"
            strokeWidth={1}
            opacity={active && active.slug !== g.slug ? 0.14 : 1}
            style={{ transition: 'opacity 0.15s ease' }}
            onMouseEnter={() => setLit(g.slug)}
          >
            {pairs(g.xy).map(([x, y]) => (
              <circle key={`${x},${y}`} cx={x} cy={y} r={active?.slug === g.slug ? r + 0.8 : r} />
            ))}
          </g>
        ))}
        {/* The lit group's name, in the empty floor of the room. */}
        {active && (
          <g pointerEvents="none" textAnchor="middle">
            <text
              x={width / 2}
              y={262}
              fontSize={17}
              fontWeight={700}
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {active.short}
            </text>
            <text
              x={width / 2}
              y={284}
              fontSize={13}
              fontWeight={600}
              fill={active.color}
              stroke="var(--paper)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {active.seats}
            </text>
          </g>
        )}
      </svg>

      {/* The legend is the same information in words: every group, its
          colour and how many seats it holds. Pointing at one lights it in
          the drawing too. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12 }}>
        {groups.map((g) => (
          <span
            key={g.slug}
            onMouseEnter={() => setLit(g.slug)}
            onMouseLeave={() => setLit(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              color: active?.slug === g.slug ? 'var(--ink)' : 'var(--ink-2)',
              fontWeight: active?.slug === g.slug ? 700 : 400,
              opacity: active && active.slug !== g.slug ? 0.45 : 1,
              transition: 'opacity 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: 999, background: g.color, flex: 'none' }}
            />
            {g.short}
            <span className="tabular" style={{ color: 'var(--ink-3)' }}>
              {g.count}
            </span>
          </span>
        ))}
      </div>
    </>
  );
}

function pairs(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] as number, flat[i + 1] as number]);
  return out;
}
