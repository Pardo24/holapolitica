/**
 * Seat positions for a results hemicycle: ``n`` seats in concentric rows,
 * left to right by angle, so filling them in order paints each party as one
 * wedge. Not the Congress's real seating (components/ChamberMap.tsx draws
 * that): an election result has no seats assigned yet.
 */

export interface SeatPoint {
  x: number;
  y: number;
}

export const HEMI_W = 400;
export const HEMI_H = 208;
const CX = HEMI_W / 2;
const CY = 200;
const OUTER = 190;
const INNER = 70;
const ROWS = 12;

/** Dot radius that keeps neighbours apart at this density. */
export const SEAT_R = 4.4;

export function hemicycleSeats(n: number): SeatPoint[] {
  const radii = Array.from({ length: ROWS }, (_, i) => INNER + ((OUTER - INNER) * i) / (ROWS - 1));
  const total = radii.reduce((a, b) => a + b, 0);
  // Seats per row in proportion to its length; the rounding goes to the
  // outermost row, which has the most room.
  const perRow = radii.map((r) => Math.max(1, Math.round((n * r) / total)));
  perRow[ROWS - 1]! += n - perRow.reduce((a, b) => a + b, 0);

  const seats: (SeatPoint & { angle: number; r: number })[] = [];
  radii.forEach((r, i) => {
    const k = perRow[i]!;
    for (let j = 0; j < k; j++) {
      const angle = k === 1 ? Math.PI / 2 : Math.PI * (1 - j / (k - 1));
      seats.push({
        x: Math.round((CX + r * Math.cos(angle)) * 10) / 10,
        y: Math.round((CY - r * Math.sin(angle)) * 10) / 10,
        angle,
        r,
      });
    }
  });
  // Left to right; across rows at one angle, inside out.
  seats.sort((a, b) => b.angle - a.angle || a.r - b.r);
  return seats.map(({ x, y }) => ({ x, y }));
}
