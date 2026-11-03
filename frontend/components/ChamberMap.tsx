import Link from 'next/link';
import type { Route } from 'next';
import { ChamberSeats, type ChamberGroup } from '@/components/ChamberSeats';
import { ArrowRight } from '@/components/icons';

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
 * Light on purpose: {@link Hemicycle} is the full interactive version (hover
 * cards, per-seat links) and it belongs on the pages about deputies. Here
 * pointing at a group only lights it up and names it ({@link ChamberSeats}),
 * and the card links to that full one.
 *
 * Neutrality: every group is painted with its own colour and every group
 * appears in the legend, ordered by seats. No group is highlighted at rest
 * (only the one the reader points at), and nothing is inferred from where a
 * seat sits in the room.
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
  seatsLabel,
}: {
  layout: HemicycleLayout;
  eyebrow: string;
  caption: string;
  cta: string;
  href?: Route;
  /** Spoken description; the legend below carries the same numbers as text. */
  ariaLabel: string;
  /** "121 escons", shown with the name of the group pointed at. */
  seatsLabel: (n: number) => string;
}) {
  const seats = layout.seats ?? [];

  // Occupied chairs, so a chair with a deputy is painted and one without
  // stays an empty ring.
  const occupied = seats.filter((s) => s.seat_x != null && s.seat_y != null);

  // Only the chairs nobody sits in get a ring. Drawing all 369 and painting
  // over 350 of them doubled the SVG in the document for 19 visible rings
  // (the Banco Azul benches).
  const taken = new Set(occupied.map((s) => `${s.seat_x},${s.seat_y}`));
  const emptyChairs = ALL_SEAT_POSITIONS.filter(([x, y]) => !taken.has(`${x},${y}`));

  // One entry per group, its seats as a flat coordinate list. Ordered by
  // size so the legend reads like the chamber's arithmetic, never
  // editorially.
  const byGroup = new Map<string, ChamberGroup>();
  for (const s of occupied) {
    const slug = s.group_slug ?? 'none';
    const entry = byGroup.get(slug) ?? {
      slug,
      short: displayGroupShort(s.group_short ?? slug),
      color: s.group_color ?? '#9ca3af',
      count: 0,
      seats: '',
      xy: [],
    };
    entry.count += 1;
    entry.xy.push(s.seat_x as number, s.seat_y as number);
    byGroup.set(slug, entry);
  }
  const groups = [...byGroup.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => ({ ...g, seats: seatsLabel(g.count) }));

  return (
    <Link
      href={href}
      className="chamber-map"
      aria-label={`${eyebrow}. ${ariaLabel}`}
      style={{
        display: 'block',
        padding: '18px 20px 16px',
        borderRadius: 16,
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
        boxShadow: 'var(--shadow-2)',
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 10 }}>
        {eyebrow}
      </div>

      <ChamberSeats
        r={SEAT_R}
        width={VIEW_W}
        height={VIEW_H}
        ariaLabel={ariaLabel}
        chairs={emptyChairs.flat()}
        groups={groups}
      />

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
