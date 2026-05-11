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
 * - When the ingest step ``hemicycle_xv`` has not yet run for a given
 *   deputy, ``seat_x`` and ``seat_y`` are NULL. We synthesise a
 *   curved-rows fallback for those seats so the chart remains usable
 *   end-to-end before the position data lands. Every seat is still
 *   coloured by group and clickable in that fallback mode.
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
import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, User, X } from 'lucide-react';

import type { HemicycleSeat, HemicycleLayout } from '@/lib/api';

// SVG viewBox we render into. We pick a 2.2:1 ratio that matches the
// real chamber's aspect and gives a comfortable reading area for the
// 350 dots. Source-image coords (max 536×393 ≈ 1.36:1) get remapped
// horizontally to fill more of the width — the source PNG has a lot
// of empty margin around the actual seating area.
const VIEW_W = 1000;
const VIEW_H = 460;

// Seat geometry. The brief asks for 6-8 px on desktop and 8-10 px on
// mobile. The SVG scales fluidly, so we pick a single radius in
// viewBox units (12) and let CSS clamp the rendered size via the
// container width.
const SEAT_R = 10;

// Stroke around each seat — "subtle stroke (var(--ink) at 15%
// alpha)" per the brief. Drawn with rgba directly so it doesn't
// depend on a CSS variable resolving inside an SVG attribute.
const SEAT_STROKE = 'rgba(20, 28, 60, 0.18)';
const SEAT_STROKE_W = 1;

const DEFAULT_COLOR = '#9ca3af';

/**
 * Map a seat from source-image pixel space (536×393) into the
 * component's viewBox (1000×460), preserving aspect by zooming on
 * the seating cluster. Empirically the image's actual seating
 * footprint spans roughly x∈[80, 470] and y∈[100, 390]; padding
 * outside that range is empty press-gallery / margin.
 */
function remap(seat_x: number, seat_y: number): { cx: number; cy: number } {
  // Source bounding box of the seating area on the official PNG.
  const SRC_MIN_X = 70;
  const SRC_MAX_X = 480;
  const SRC_MIN_Y = 95;
  const SRC_MAX_Y = 395;
  const SRC_W = SRC_MAX_X - SRC_MIN_X;
  const SRC_H = SRC_MAX_Y - SRC_MIN_Y;

  // Target area inside the viewBox — leave a small margin around
  // the chart so the outer ring of seats doesn't kiss the edges.
  const TGT_PAD_X = 32;
  const TGT_PAD_Y = 32;
  const tgtW = VIEW_W - 2 * TGT_PAD_X;
  const tgtH = VIEW_H - 2 * TGT_PAD_Y;

  // Linear remap. Clamp the source values softly — a deputy ingested
  // with an out-of-range coordinate (shouldn't happen, but defensive)
  // gets pushed back into the seating area rather than off-canvas.
  const nx = (Math.max(SRC_MIN_X, Math.min(SRC_MAX_X, seat_x)) - SRC_MIN_X) / SRC_W;
  const ny = (Math.max(SRC_MIN_Y, Math.min(SRC_MAX_Y, seat_y)) - SRC_MIN_Y) / SRC_H;

  return {
    cx: TGT_PAD_X + nx * tgtW,
    cy: TGT_PAD_Y + ny * tgtH,
  };
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
  usingFallback: boolean;
} {
  const seated = layout.seats.filter((s) => s.seat_x != null && s.seat_y != null);
  const unseated = layout.seats.filter((s) => s.seat_x == null || s.seat_y == null);

  // If we have ANY real seat positions, real seats use their coords
  // and any stragglers (e.g. a brand-new substitute deputy whose
  // position hasn't been re-scraped yet) get appended to the synthetic
  // overflow at the far right. If we have NONE, the whole chart runs
  // in fallback mode.
  const usingFallback = seated.length === 0;

  const placed: PlacedSeat[] = [];
  for (const s of seated) {
    const { cx, cy } = remap(s.seat_x as number, s.seat_y as number);
    placed.push({ ...s, cx, cy });
  }
  const total = usingFallback ? unseated.length : Math.max(unseated.length, 1);
  unseated.forEach((s, i) => {
    const { cx, cy } = usingFallback
      ? syntheticArc(i, total)
      : // For "stragglers" without coords when most do have them,
        // park them in a small row above the SVG header — visible
        // but obviously distinct.
        { cx: 40 + (i % 20) * 24, cy: 16 };
    placed.push({ ...s, cx, cy });
  });

  return { placed, usingFallback };
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

export function Hemicycle({ layout }: { layout: HemicycleLayout }) {
  const t = useTranslations('hemicycle');
  const [selected, setSelected] = useState<SelectedSeat | null>(null);
  const isTouch = useIsTouch();

  const { placed, usingFallback } = useMemo(() => placeSeats(layout), [layout]);

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
        role="img"
        aria-label={`${t('caption')} — ${totalSeats} — ${ariaSummary}`}
        style={{ position: 'relative', width: '100%' }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={handleSeatLeave}
        >
          {placed.map((seat) => (
            <SeatDot
              key={seat.person_id}
              seat={seat}
              onHover={handleSeatHover}
              onTap={handleSeatTap}
              isTouch={isTouch}
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
}

function SeatDot({ seat, onHover, onTap, isTouch }: SeatDotProps) {
  const color = seat.group_color ?? DEFAULT_COLOR;
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
        // Native title gives screen readers + tooltip-on-hover-pause
        // a fallback that works even when the React hover card is
        // suppressed (e.g. in a forced-colors / prefers-reduced-motion
        // environment).
      >
        <title>
          {seat.full_name}
          {seat.group_short ? ` · ${seat.group_short}` : ''}
        </title>
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

function TouchInfoPane({
  seat,
  onDismiss,
}: {
  seat: PlacedSeat | null;
  onDismiss: () => void;
}) {
  const t = useTranslations('hemicycle');

  if (!seat) {
    return null;
  }

  return (
    <div
      role="region"
      aria-live="polite"
      style={{
        marginTop: 12,
        border: '1px solid var(--ink)',
        background: 'var(--paper)',
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <SeatInfoBody seat={seat} />
        <Link
          href={`/persons/${seat.person_id}` as Route}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            minHeight: 44,
            minWidth: 44,
            padding: '8px 14px',
            border: '1px solid var(--ink)',
            background: 'var(--paper-2)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {t('view_profile')}
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('dismiss')}
        style={{
          minWidth: 44,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: '1px solid var(--rule)',
          color: 'var(--ink-2)',
          cursor: 'pointer',
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function SeatInfoBody({ seat }: { seat: PlacedSeat }) {
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
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.25,
            color: 'var(--ink)',
          }}
        >
          {seat.full_name}
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
