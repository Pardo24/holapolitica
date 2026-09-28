import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';

import type { HemicycleLayout } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { ALL_SEAT_POSITIONS } from '@/lib/hemicycleAllSeats';

/**
 * The chamber, drawn as it is: 350 seats in their real positions, each
 * painted with the group of the deputy who sits in it.
 *
 * The home page had no image of any kind — all type, rules and white. The
 * honest way to fix that on a parliamentary-transparency site is not
 * decoration but the data itself, and the hemicycle is the one picture of a
 * parliament everybody already recognises. Seat coordinates come from the
 * official image map (see ``app/ingest/congreso/hemicycle.py``); the empty
 * chairs are drawn too, so the architecture reads even where nobody sits.
 *
 * Static on purpose: {@link Hemicycle} is the interactive version (hover
 * cards, per-seat links) and it belongs on the pages about deputies. Here
 * a plain SVG with no client JavaScript carries the whole point, and the
 * card links to that interactive one.
 *
 * Neutrality: every group is painted with its own colour and every group
 * appears in the legend, ordered by seats. No group is highlighted, and
 * nothing is inferred from where a seat sits in the room.
 */

/** Seat radius in the 536x393 viewBox of the official image map. */
const SEAT_R = 5;
const VIEW_W = 536;
const VIEW_H = 393;

export function ChamberMap({
  layout,
  eyebrow,
  caption,
  cta,
  href = '/el-teu-diputat' as Route,
  ariaLabel,
}: {
  layout: HemicycleLayout;
  eyebrow: string;
  caption: string;
  cta: string;
  href?: Route;
  /** Spoken description; the legend below carries the same numbers as text. */
  ariaLabel: string;
}) {
  const seats = layout.seats ?? [];

  // Group tallies drive the legend. Ordered by size so the legend reads
  // like the chamber's arithmetic, never editorially.
  const byGroup = new Map<string, { short: string; color: string; count: number }>();
  for (const s of seats) {
    if (!s.group_slug) continue;
    const entry = byGroup.get(s.group_slug) ?? {
      short: displayGroupShort(s.group_short ?? s.group_slug),
      color: s.group_color ?? 'var(--ink-3)',
      count: 0,
    };
    entry.count += 1;
    byGroup.set(s.group_slug, entry);
  }
  const groups = [...byGroup.values()].sort((a, b) => b.count - a.count);

  // Occupied chairs, keyed by position, so a chair with a deputy is painted
  // and one without stays an empty ring.
  const occupied = seats.filter((s) => s.seat_x != null && s.seat_y != null);

  // Only the chairs nobody sits in get a ring. Drawing all 369 and painting
  // over 350 of them doubled the SVG in the document for 19 visible rings
  // (the Banco Azul benches), and this page ships the map twice — once per
  // breakpoint tree.
  const taken = new Set(occupied.map((s) => `${s.seat_x},${s.seat_y}`));
  const emptyChairs = ALL_SEAT_POSITIONS.filter(([x, y]) => !taken.has(`${x},${y}`));

  // One <g> per colour, so a seat is just its coordinates: the fill was the
  // longest part of each circle and it repeats 350 times.
  const seatsByColor = new Map<string, { x: number; y: number }[]>();
  for (const s of occupied) {
    const color = s.group_color ?? '#9ca3af';
    const list = seatsByColor.get(color) ?? [];
    list.push({ x: s.seat_x as number, y: s.seat_y as number });
    seatsByColor.set(color, list);
  }

  return (
    <Link
      href={href}
      className="chamber-map"
      aria-label={`${eyebrow}. ${ariaLabel}`}
      style={{
        display: 'block',
        padding: '18px 20px 16px',
        borderRadius: 16,
        border: '1px solid var(--rule-strong)',
        background:
          'linear-gradient(180deg, var(--paper-2) 0%, color-mix(in oklch, var(--accent) 5%, var(--paper-2)) 100%)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 10 }}>
        {eyebrow}
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {/* Shared attributes live on the <g>, never on each circle. */}
        {/* The chairs with nobody in them — the cabinet benches, and any
            seat vacant between a resignation and its replacement. */}
        <g fill="none" stroke="var(--rule-strong)" strokeWidth={1} opacity={0.6}>
          {emptyChairs.map(([x, y]) => (
            <circle key={`chair-${x}-${y}`} cx={x} cy={y} r={SEAT_R} />
          ))}
        </g>
        {/* The deputies, one group per colour. */}
        {[...seatsByColor.entries()].map(([color, list]) => (
          <g key={color} fill={color} stroke="rgba(20, 28, 60, 0.18)" strokeWidth={1}>
            {list.map(({ x, y }) => (
              <circle key={`${x},${y}`} cx={x} cy={y} r={SEAT_R} />
            ))}
          </g>
        ))}
      </svg>

      {/* The legend is the same information in words: every group, its
          colour and how many seats it holds. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 14px',
          marginTop: 12,
        }}
      >
        {groups.map((g) => (
          <span
            key={g.short}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: g.color,
                flex: 'none',
              }}
            />
            {g.short}
            <span className="tabular" style={{ color: 'var(--ink-3)' }}>
              {g.count}
            </span>
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--rule)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>{caption}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}
        >
          {cta}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
