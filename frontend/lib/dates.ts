/**
 * Format an ISO date (or `YYYY-MM-DD` string) as `DD/MM/YYYY`, e.g.
 * `2012-05-23` → `23/05/2012`.
 *
 * We split the ISO string's date part directly rather than going through
 * `new Date(...).toLocaleDateString(...)`: that path (a) localises to forms
 * like `23/5/2012` without zero-padding and (b) can shift the day by one when
 * the runtime timezone is behind UTC (a bare `YYYY-MM-DD` parses as UTC
 * midnight). String slicing is timezone-proof and always two-digit.
 */
export function formatDMY(value: string | Date): string {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}
