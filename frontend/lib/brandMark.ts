/**
 * The site's mark: the chamber drawn as a hemicycle of seats over a rule,
 * in paper on ink. Used by the favicon, the iOS icon and public/icon.svg,
 * so all three draw the same dots. Coordinates are in a 512 x 512 box.
 */
export const MARK_INK = '#1c1c1a';
export const MARK_PAPER = '#ecebe6';

const ROWS = [
  { r: 176, n: 13 },
  { r: 134, n: 10 },
  { r: 92, n: 7 },
];
const CX = 256;
const CY = 330;
export const MARK_DOT = 14;
export const MARK_RULE = { x: 64, y: 362, width: 384, height: 16 };

/** Every seat's centre, outer row first. */
export function markSeats(): { x: number; y: number }[] {
  const seats: { x: number; y: number }[] = [];
  for (const { r, n } of ROWS) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI - (Math.PI * i) / (n - 1);
      seats.push({ x: Math.round((CX + r * Math.cos(a)) * 10) / 10, y: Math.round((CY - r * Math.sin(a)) * 10) / 10 });
    }
  }
  return seats;
}
