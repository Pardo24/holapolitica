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

const JAVA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A deputy's role line from the Congress ficha, split into the role and the
 * date it started. The ficha prints the date as a raw Java timestamp ("des
 * del Tue Nov 21 00:00:00 CET 2023"), sometimes as "04/04/2024", always
 * after a Catalan "des del" whatever the reader's language. Returns the role
 * alone and the date as YYYY-MM-DD, or the line untouched when it has no
 * date we can read.
 */
export function splitRoleSince(line: string): { role: string; since: string | null } {
  const java = line.match(
    /^(.*?)\s+(?:des del|desde el|desde)\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+[\d:]+\s+\w+\s+(\d{4})\s*$/i,
  );
  if (java) {
    const month = JAVA_MONTHS.indexOf(java[2]!) + 1;
    if (month > 0) {
      return {
        role: java[1]!.trim(),
        since: `${java[4]}-${String(month).padStart(2, '0')}-${java[3]!.padStart(2, '0')}`,
      };
    }
  }
  const dmy = line.match(/^(.*?)\s+(?:des del|desde el|desde)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/i);
  if (dmy) {
    return {
      role: dmy[1]!.trim(),
      since: `${dmy[4]}-${dmy[3]!.padStart(2, '0')}-${dmy[2]!.padStart(2, '0')}`,
    };
  }
  return { role: line, since: null };
}

/** "2023-12-04" as "4 de des. 2023" / "4 dic 2023" / "4 Dec 2023", no time and
 *  no timezone shift (the date is read as a calendar day). */
export function formatDayMonthYear(iso: string, locale: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
