'use client';

/**
 * Real-data-driven, interactive hemicycle.
 *
 * Renders the chamber as an SVG, one seat per deputy:
 *
 * - Seats are placed at the pixel coordinates scraped from the official
 *   Congreso ``<area coords="x,y,r">`` image-map (see
 *   ``app/ingest/congreso/hemicycle.py``). Source pixel space is
 *   536×393; we remap into the component's own viewBox so the chart
 *   scales fluidly with its container.
 *
 * - When the ingest step ``hemicycle_xv`` has not yet run AT ALL,
 *   every seat lacks coordinates and we synthesise a curved-rows
 *   fallback so the chart remains usable end-to-end. When only a few
 *   seats lack coordinates (fresh substitutes pending a re-scrape),
 *   those deputies are listed by name under the chart instead of
 *   being drawn at an invented position.
 *
 * Interaction (per the brief):
 *
 * - Desktop (``@media (hover: hover)``): hover reveals a floating card
 *   anchored to the seat showing photo, name, group, constituency.
 *   Click anywhere on the seat navigates to ``/persons/[id]``.
 *
 * - Touch: tap reveals an info card pinned BELOW the SVG (so it never
 *   gets clipped by the chart frame), with a clear "Veure fitxa →"
 *   navigation link and a dismiss button.
 *
 * Neutrality (CLAUDE.md "mirall, no megàfon"): the card shows only
 * factual data — name, group, constituency. No editorial framing, no
 * emoji-style status indicators, no opinion-laden language.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, User, X } from 'lucide-react';

import type {
  HemicycleSeat,
  HemicycleLayout,
  VoteHemicycleSeat,
  VoteHemicycleLayout,
} from '@/lib/api';
import { GroupBadge } from '@/components/GroupBadge';
import { displayGroupShort } from '@/lib/groups';
import { ALL_SEAT_POSITIONS } from '@/lib/hemicycleAllSeats';

// SVG viewBox we render into. We pick a 2.2:1 ratio that matches the
// real chamber's aspect and gives a comfortable reading area for the
// 350 dots. Source-image coords (max 536×393 ≈ 1.36:1) get remapped
// horizontally to fill more of the width — the source PNG has a lot
// of empty margin around the actual seating area.
// Match the official Congrés hemicycle PNG dimensions so seat
// coordinates from the ingest land exactly on the right pixel.
const VIEW_W = 536;
const VIEW_H = 393;

// Seat geometry. The brief asks for 6-8 px on desktop and 8-10 px on
// mobile. The SVG scales fluidly, so we pick a single radius in
// viewBox units (12) and let CSS clamp the rendered size via the
// container width.
// Seats sized for the native 536×393 PNG. Slightly bigger than the
// raw ~2.5px ingest radius so they read as distinct dots and provide
// a comfortable hover/tap target without smothering the architecture.
const SEAT_R = 5;

// Stroke around each seat — "subtle stroke (var(--ink) at 15%
// alpha)" per the brief. Drawn with rgba directly so it doesn't
// depend on a CSS variable resolving inside an SVG attribute.
const SEAT_STROKE = 'rgba(20, 28, 60, 0.18)';
const SEAT_STROKE_W = 1;

const DEFAULT_COLOR = '#9ca3af';

/**
 * Color mapping for the vote-mode rendering. Keeps each seat
 * visually consistent with the rest of the site's vote semantics
 * (StackedBar, ResultPill): green for aye, red for no, ocre for
 * abstention, neutral grey for any "not cast" state (absent,
 * not-recorded, or no VoteRecord row for the seat). Resolved against
 * the same OKLCH tokens used by globals.css so dark-mode swaps
 * propagate automatically.
 */
const VOTE_CHOICE_COLOR: Record<string, string> = {
  aye: 'oklch(0.55 0.12 152)',
  no: 'oklch(0.55 0.16 26)',
  abstention: 'oklch(0.68 0.13 82)',
  absent: 'oklch(0.85 0.005 250)',
  no_vote_recorded: 'oklch(0.85 0.005 250)',
};

export type HemicycleColorMode = 'group' | 'vote';

/**
 * Map a seat from source-image pixel space (536×393) into the
 * component's viewBox (1000×460), preserving aspect by zooming on
 * the seating cluster. Empirically the image's actual seating
 * footprint spans roughly x∈[80, 470] and y∈[100, 390]; padding
 * outside that range is empty press-gallery / margin.
 */
function remap(seat_x: number, seat_y: number): { cx: number; cy: number } {
  // Identity. Seat coordinates are already in the PNG's pixel space
  // (536×393), so they overlay the official backdrop exactly.
  return { cx: seat_x, cy: seat_y };
}

/**
 * Synthetic curved-rows fallback for seats without ingested positions.
 * Returns the same shape as ``remap`` but lays each seat out on one
 * of N concentric arcs, sweeping left-to-right, in the order given.
 */
function syntheticArc(
  index: number,
  total: number,
  rows = 9,
): { cx: number; cy: number } {
  // Weights skew toward the outer arcs so the larger rings carry
  // more seats — mirrors the geometry of a real hemicycle.
  const weights: number[] = [];
  let weightSum = 0;
  for (let r = 0; r < rows; r++) {
    const w = r + 3;
    weights.push(w);
    weightSum += w;
  }
  const rowSizes: number[] = [];
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    const n = Math.round((total * (weights[r] ?? 0)) / weightSum);
    rowSizes.push(n);
    acc += n;
  }
  // Absorb any rounding remainder into the outermost arc.
  rowSizes[rows - 1] = (rowSizes[rows - 1] ?? 0) + (total - acc);

  // Find which row this index falls into.
  let consumed = 0;
  let row = 0;
  let positionInRow = 0;
  for (let r = 0; r < rows; r++) {
    const n = rowSizes[r] ?? 0;
    if (index < consumed + n) {
      row = r;
      positionInRow = index - consumed;
      break;
    }
    consumed += n;
  }
  const n = rowSizes[row] ?? 1;

  const cx = VIEW_W / 2;
  const baseline = VIEW_H * 0.93;
  const innerR = VIEW_H * 0.34;
  const outerR = VIEW_W * 0.46;
  const ringStep = (outerR - innerR) / Math.max(rows - 1, 1);
  const radius = innerR + row * ringStep;
  const theta = Math.PI - ((positionInRow + 0.5) / n) * Math.PI;
  return {
    cx: cx + Math.cos(theta) * radius,
    cy: baseline - Math.sin(theta) * radius,
  };
}

interface PlacedSeat extends HemicycleSeat {
  cx: number;
  cy: number;
}

function placeSeats(layout: HemicycleLayout): {
  placed: PlacedSeat[];
  unplaced: HemicycleSeat[];
  usingFallback: boolean;
} {
  const seated = layout.seats.filter((s) => s.seat_x != null && s.seat_y != null);
  const unseated = layout.seats.filter((s) => s.seat_x == null || s.seat_y == null);

  // If we have ANY real seat positions, real seats use their coords.
  // Stragglers (e.g. a brand-new substitute deputy whose position
  // hasn't been re-scraped yet) are NOT drawn as dots — a dot at an
  // invented position reads as data. They're listed by name under the
  // chart instead (see the pending-placement strip in the component).
  // If we have NO positions at all, the whole chart runs in synthetic
  // fallback mode and everyone gets an arc slot.
  const usingFallback = seated.length === 0;

  const placed: PlacedSeat[] = [];
  for (const s of seated) {
    const { cx, cy } = remap(s.seat_x as number, s.seat_y as number);
    placed.push({ ...s, cx, cy });
  }
  if (usingFallback) {
    unseated.forEach((s, i) => {
      const { cx, cy } = syntheticArc(i, unseated.length);
      placed.push({ ...s, cx, cy });
    });
    return { placed, unplaced: [], usingFallback };
  }

  return { placed, unplaced: unseated, usingFallback };
}

interface SelectedSeat {
  seat: PlacedSeat;
  origin: 'hover' | 'tap';
}

/**
 * Detect coarse-pointer (touch) devices. Used to decide whether the
 * info card lives anchored next to a seat (desktop hover) or pinned
 * below the SVG (touch). We DO NOT call this during render — it
 * lives behind a useState bound to a media query so SSR stays stable.
 */
function useIsTouch(): boolean {
  // Default to ``false`` for SSR so the first paint matches the
  // most common case (desktop). The effect then upgrades the value
  // on the client.
  const [touch, setTouch] = useState(false);
  useMemo(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(hover: none)');
    setTouch(mq.matches);
    const handler = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return touch;
}

export function Hemicycle({
  layout,
  coloredBy = 'group',
  highlightConstituency = null,
  showLegend = false,
}: {
  // Accepts both the legislature-wide layout (group colors) and the
  // per-vote layout (each seat carries a `vote_choice`). The two
  // shapes share every field except `vote_choice`, so we widen the
  // type here and let the seat renderer branch on `coloredBy`.
  layout: HemicycleLayout | VoteHemicycleLayout;
  /**
   * How to fill each seat:
   *
   * - `'group'` (default) — the deputy's parliamentary group color,
   *   as on the legislature-wide hemicycle.
   * - `'vote'` — the choice cast on a specific vote. Requires the
   *   layout to be a `VoteHemicycleLayout` (i.e. each seat carries
   *   a `vote_choice`). When passed without those fields the seats
   *   fall back to the group color, never crash.
   */
  coloredBy?: HemicycleColorMode;
  /**
   * When set, the seats whose `constituency` matches stay at full
   * strength and every other seat dims back — so "El teu diputat" can
   * light up just your province's deputies on the chamber map. Null
   * (default) renders the whole chamber at full strength.
   */
  highlightConstituency?: string | null;
  /**
   * Renders a clickable group legend beside the chamber (desktop) /
   * beneath it (narrow): logo + name + seat count per group. Clicking
   * a group lights up its seats; the arrow on each row links to the
   * group's profile page — the legend doubles as the entry point to
   * the party pages.
   */
  showLegend?: boolean;
}) {
  const t = useTranslations('hemicycle');
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const isTouch = useIsTouch();

  const { placed, unplaced, usingFallback } = useMemo(() => placeSeats(layout), [layout]);

  // Legend rows: one per group, ordered by seat count desc. GP-less
  // seats (no adscrits) are excluded from the legend but stay drawn.
  const legendGroups = useMemo(() => {
    if (!showLegend) return [];
    const byGroup = new Map<
      string,
      { slug: string; short: string; color: string | null; count: number }
    >();
    for (const s of layout.seats) {
      if (!s.group_slug) continue;
      const row = byGroup.get(s.group_slug) ?? {
        slug: s.group_slug,
        short: s.group_short ?? s.group_slug,
        color: s.group_color,
        count: 0,
      };
      row.count += 1;
      byGroup.set(s.group_slug, row);
    }
    return [...byGroup.values()].sort((a, b) => b.count - a.count);
  }, [layout.seats, showLegend]);

  const handleSeatHover = useCallback(
    (seat: PlacedSeat) => {
      if (isTouch) return;
      setSelected({ seat, origin: 'hover' });
    },
    [isTouch],
  );

  const handleSeatLeave = useCallback(() => {
    if (isTouch) return;
    setSelected((prev) => (prev?.origin === 'hover' ? null : prev));
  }, [isTouch]);

  const handleSeatTap = useCallback(
    (seat: PlacedSeat) => {
      // On touch devices the first tap pins the card; subsequent
      // navigation happens via the explicit "Veure fitxa →" CTA.
      // On desktop, click navigates directly via the wrapping <Link>;
      // this handler only fires for touch (we still listen for both
      // to preserve keyboard activation).
      if (isTouch) {
        setSelected({ seat, origin: 'tap' });
      }
    },
    [isTouch],
  );

  const totalSeats = layout.seats.length;
  const ariaSummary = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const s of layout.seats) {
      const key = s.group_short ?? s.group_slug ?? 'n/a';
      byGroup.set(key, (byGroup.get(key) ?? 0) + 1);
    }
    return [...byGroup.entries()].map(([k, v]) => `${k}: ${v}`).join(', ');
  }, [layout.seats]);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 22,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
      <div style={{ flex: '1 1 340px', minWidth: 280 }}>
      <div
        role="img"
        aria-label={`${t('caption')} — ${totalSeats} — ${ariaSummary}`}
        style={{ position: 'relative', width: '100%' }}
      >
        <svg
          viewBox={`0 -12 ${VIEW_W} ${VIEW_H + 12}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={handleSeatLeave}
        >
          {/* No image backdrop. The official PNG has every seat pre-
              painted (grey dots + the dark-blue government bench), so
              overlaying our colored dots on it produced ghost seats:
              empty ministerial chairs stayed blue, and any half-pixel
              offset showed the grey dot peeking behind ours. Instead
              we draw the full chamber ourselves: a base layer with
              every physical chair as an empty ring (static inventory
              extracted from the same official image map), and the
              occupied seats painted on top. Vacant seats and the
              cabinet-bench chairs of non-deputy ministers therefore
              stay visible as what they are — seats without a sitting
              deputy. Skipped in synthetic-fallback mode, where dot
              positions are invented and wouldn't line up. */}
          {!usingFallback &&
            ALL_SEAT_POSITIONS.map(([x, y]) => (
              <circle
                key={`empty-${x}-${y}`}
                cx={x}
                cy={y}
                r={SEAT_R}
                fill="var(--paper-3)"
                stroke={SEAT_STROKE}
                strokeWidth={SEAT_STROKE_W}
                aria-hidden="true"
              />
            ))}
          {placed.map((seat) => (
            <SeatDot
              key={seat.person_id}
              seat={seat}
              onHover={handleSeatHover}
              onTap={handleSeatTap}
              isTouch={isTouch}
              coloredBy={coloredBy}
              dimmed={
                (!!highlightConstituency &&
                  seat.constituency !== highlightConstituency) ||
                (!!selectedGroup && seat.group_slug !== selectedGroup)
              }
            />
          ))}
        </svg>

        {/* Desktop hover card — anchored near the seat. We translate
            the SVG-space (cx, cy) into container percentages so the
            card moves correctly through CSS layout, not as an SVG
            element (which would be clipped by viewBox / overflow). */}
        {!isTouch && selected && selected.origin === 'hover' && (
          <DesktopHoverCard seat={selected.seat} />
        )}
      </div>

      {/* Caption (mobile-friendly small text under the chart). */}
      <div
        className="tabular"
        style={{
          marginTop: 6,
          fontSize: 11,
          color: 'var(--ink-3)',
          textAlign: 'center',
        }}
      >
        {usingFallback ? t('no_position_yet') : t('tap_for_info')}
      </div>
      </div>

      {/* Group legend — clickable: a row per group lights up its seats;
          the arrow goes to the group's profile page, making the legend
          the natural gateway to the party pages. */}
      {showLegend && legendGroups.length > 0 && (
        <div style={{ flex: '0 1 235px', minWidth: 200 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginBottom: 8,
            }}
          >
            {t('legend_hint')}
          </div>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {legendGroups.map((g) => {
              const active = selectedGroup === g.slug;
              return (
                <li key={g.slug}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => setSelectedGroup(active ? null : g.slug)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedGroup(active ? null : g.slug);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '5px 8px',
                      borderRadius: 9,
                      cursor: 'pointer',
                      background: active ? 'var(--paper-3)' : 'transparent',
                      border: `1px solid ${active ? 'var(--rule-strong)' : 'transparent'}`,
                    }}
                  >
                    <GroupBadge slug={g.slug} color={g.color} size="sm" link={false} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {displayGroupShort(g.short)}
                    </span>
                    <span
                      className="tabular"
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', flex: 'none' }}
                    >
                      {g.count}
                    </span>
                    <Link
                      href={`/groups/${g.slug}` as Route}
                      aria-label={t('legend_view_group')}
                      title={t('legend_view_group')}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex',
                        color: 'var(--ink-3)',
                        flex: 'none',
                      }}
                    >
                      <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </div>

      {/* Deputies without a scraped seat position yet (brand-new
          substitutes, typically 0-2 people for a few days). Listed by
          name instead of drawn at an invented position — honest, and
          keeps the chart free of "floating" dots. */}
      {unplaced.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px 10px',
            fontSize: 11.5,
            color: 'var(--ink-3)',
          }}
        >
          <span>{t('pending_placement')}</span>
          {unplaced.map((s) => (
            <Link
              key={s.person_id}
              href={`/persons/${s.person_id}` as Route}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                color: 'var(--ink-2)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: s.group_color ?? DEFAULT_COLOR,
                  display: 'inline-block',
                  flex: 'none',
                }}
              />
              {s.full_name}
            </Link>
          ))}
        </div>
      )}

      {/* Touch info pane — pinned below the SVG. Always rendered as a
          shell so the layout doesn't jump when the first seat is
          tapped; visually hidden when no seat is selected. */}
      {isTouch && (
        <TouchInfoPane
          seat={selected?.seat ?? null}
          onDismiss={() => setSelected(null)}
        />
      )}
    </div>
  );
}

interface SeatDotProps {
  seat: PlacedSeat;
  onHover: (seat: PlacedSeat) => void;
  onTap: (seat: PlacedSeat) => void;
  isTouch: boolean;
  coloredBy: HemicycleColorMode;
  /** Faded back because a constituency highlight is active and this seat
   *  isn't in it. */
  dimmed?: boolean;
}

function SeatDot({
  seat,
  onHover,
  onTap,
  isTouch,
  coloredBy,
  dimmed = false,
}: SeatDotProps) {
  // In `vote` mode the placed seat carries a `vote_choice`; fall back
  // to the group color when the field is missing (e.g. the parent
  // passed `coloredBy="vote"` with a legacy layout). Reading via the
  // generic indexer avoids a type assertion while keeping null-safe.
  const voteChoice =
    coloredBy === 'vote' ? (seat as PlacedSeat & Partial<VoteHemicycleSeat>).vote_choice : null;
  const color =
    coloredBy === 'vote' && voteChoice
      ? VOTE_CHOICE_COLOR[voteChoice] ?? DEFAULT_COLOR
      : seat.group_color ?? DEFAULT_COLOR;
  const href = `/persons/${seat.person_id}` as Route;

  // Two interaction modes:
  // - Desktop: <a> wraps the <circle>, click navigates. Hover fires
  //   onHover for the floating card.
  // - Touch: tap fires onTap (which pins the info pane below). We
  //   don't wrap in <a> on touch because the brief specifies that
  //   the first tap reveals info; navigation happens via the CTA in
  //   the pinned pane.
  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (isTouch) {
      e.preventDefault();
      onTap(seat);
    }
  };

  const title = `${seat.full_name}${seat.group_short ? ` · ${seat.group_short}` : ''}`;

  return (
    <a
      href={href}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick(e);
      }}
      onMouseEnter={() => onHover(seat)}
      onFocus={() => onHover(seat)}
      style={{ cursor: 'pointer' }}
    >
      <circle
        cx={seat.cx}
        cy={seat.cy}
        r={SEAT_R}
        fill={color}
        stroke={SEAT_STROKE}
        strokeWidth={SEAT_STROKE_W}
        opacity={dimmed ? 0.16 : 1}
        style={{ transition: 'opacity 0.2s ease' }}
        // Native title gives screen readers + tooltip-on-hover-pause
        // a fallback that works even when the React hover card is
        // suppressed (e.g. in a forced-colors / prefers-reduced-motion
        // environment).
      >
        <title>{title}</title>
      </circle>
    </a>
  );
}

function DesktopHoverCard({ seat }: { seat: PlacedSeat }) {
  // Position the card in container coordinates. The SVG fills the
  // container; we use the seat's (cx, cy) divided by the viewBox to
  // get a percentage offset. CSS handles the rest (no SVG transforms
  // so the card doesn't shrink with the chart).
  const left = `${(seat.cx / VIEW_W) * 100}%`;
  const top = `${(seat.cy / VIEW_H) * 100}%`;

  return (
    <div
      role="tooltip"
      aria-live="polite"
      style={{
        position: 'absolute',
        left,
        top,
        transform: 'translate(-50%, calc(-100% - 14px))',
        background: 'var(--paper)',
        border: '1px solid var(--ink)',
        padding: '8px 10px',
        boxShadow: '4px 4px 0 var(--rule)',
        minWidth: 180,
        maxWidth: 240,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <SeatInfoBody seat={seat} />
    </div>
  );
}

/**
 * Animation timings for the touch info pane. The enter animation is
 * slightly longer than the exit to feel "snappy out, soft in" — exits
 * need to feel responsive after a tap, while entries can take a beat
 * to draw the eye downward to the new card below the SVG.
 *
 * Both honour ``prefers-reduced-motion`` via the global rule in
 * ``globals.css`` (which flattens animation-duration to 1ms).
 */
const TOUCH_PANE_ENTER_MS = 220;
const TOUCH_PANE_EXIT_MS = 180;

function TouchInfoPane({
  seat,
  onDismiss,
}: {
  seat: PlacedSeat | null;
  onDismiss: () => void;
}) {
  const t = useTranslations('hemicycle');
  // Local "currently visible" seat — kept independent of the prop so
  // the pane can keep rendering while the exit animation plays. When
  // ``seat`` becomes ``null`` we flip ``exiting`` on, wait the exit
  // duration, then clear ``visibleSeat`` to actually unmount.
  const [visibleSeat, setVisibleSeat] = useState<PlacedSeat | null>(seat);
  const [exiting, setExiting] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (seat) {
      // New (or replaced) seat: cancel any pending exit and show.
      setExiting(false);
      setVisibleSeat(seat);
      return;
    }
    if (!visibleSeat) return;
    // Parent cleared the seat — play the exit animation, then unmount.
    setExiting(true);
    const id = window.setTimeout(() => {
      setVisibleSeat(null);
      setExiting(false);
    }, TOUCH_PANE_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [seat, visibleSeat]);

  // Tap-outside-to-dismiss. We listen for pointerdown on the document
  // and call ``onDismiss`` when the event target is outside both the
  // card itself and any seat (taps on seats are handled by ``onTap`` in
  // the parent, which replaces the visible seat — we don't want this
  // listener to fight that path). The listener only attaches while a
  // seat is visible to keep the document cheap when the pane is closed.
  useEffect(() => {
    if (!visibleSeat || exiting) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const card = cardRef.current;
      if (card && card.contains(target)) return;
      // Don't dismiss when the tap landed on a seat — the parent will
      // replace ``visibleSeat`` via ``onTap`` in the next render.
      if (target instanceof Element && target.closest('a[href^="/persons/"]')) {
        return;
      }
      onDismiss();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [visibleSeat, exiting, onDismiss]);

  if (!visibleSeat) {
    return null;
  }

  return (
    <div
      role="region"
      aria-live="polite"
      style={{
        marginTop: 12,
      }}
    >
      <div
        ref={cardRef}
        className="hemicycle-tap-card"
        style={{
          border: '1px solid var(--rule-strong)',
          background: 'var(--paper)',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          animation: `${
            exiting ? 'hemicycleTapPaneExit' : 'hemicycleTapPaneEnter'
          } ${exiting ? TOUCH_PANE_EXIT_MS : TOUCH_PANE_ENTER_MS}ms ease-out both`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <SeatInfoBody
            seat={visibleSeat}
            cta={
              <Link
                href={`/persons/${visibleSeat.person_id}` as Route}
                className="hemicycle-tap-cta"
                aria-label={t('view_profile')}
              >
                <span className="hemicycle-tap-cta-label">{t('view_profile')}</span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            }
          />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('dismiss')}
          className="hemicycle-tap-close"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <style>{`
        @keyframes hemicycleTapPaneEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hemicycleTapPaneExit {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(8px); }
        }
        .hemicycle-tap-close {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          border-radius: 999px;
          color: var(--ink-3);
          cursor: pointer;
          flex: none;
          padding: 0;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .hemicycle-tap-close:hover,
        .hemicycle-tap-close:focus-visible {
          background-color: var(--paper-3);
          color: var(--ink);
          outline: none;
        }
        .hemicycle-tap-cta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border-radius: 999px;
          background: var(--ink);
          color: var(--paper);
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          line-height: 1;
          white-space: nowrap;
          transition: background-color 120ms ease, transform 120ms ease;
        }
        .hemicycle-tap-cta:hover,
        .hemicycle-tap-cta:focus-visible {
          background: color-mix(in oklch, var(--ink) 88%, var(--accent));
          outline: none;
        }
        .hemicycle-tap-cta:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}

function SeatInfoBody({
  seat,
  cta,
}: {
  seat: PlacedSeat;
  cta?: React.ReactNode;
}) {
  const initials = computeInitials(seat.full_name);
  const color = seat.group_color ?? DEFAULT_COLOR;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {seat.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={seat.photo_url}
          alt=""
          width={44}
          height={56}
          style={{
            width: 44,
            height: 56,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid var(--rule)',
            background: 'var(--paper-3)',
            flex: 'none',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 56,
            background: 'var(--paper-3)',
            border: '1px solid var(--rule)',
            borderRadius: 8,
            color: 'var(--ink-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 600,
            flex: 'none',
          }}
        >
          {initials || <User size={18} aria-hidden="true" />}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.25,
              color: 'var(--ink)',
              minWidth: 0,
              flex: '1 1 auto',
            }}
          >
            {seat.full_name}
          </div>
          {cta}
        </div>
        {seat.group_short && (
          <div
            style={{
              fontSize: 11,
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--ink-2)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                background: color,
                display: 'inline-block',
                borderRadius: '50%',
              }}
            />
            {seat.group_short}
          </div>
        )}
        {seat.constituency && (
          <div
            style={{
              fontSize: 11,
              marginTop: 2,
              color: 'var(--ink-3)',
            }}
          >
            {seat.constituency}
          </div>
        )}
      </div>
    </div>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '';
  }
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts[parts.length - 1]?.charAt(0) ?? '';
  return (first + last).toUpperCase();
}
