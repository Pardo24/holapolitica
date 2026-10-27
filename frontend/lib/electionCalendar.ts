/**
 * The dates of the 29 November 2026 general election, as the law fixes
 * them. Real Decreto 806/2026 (BOE-A-2026-20742) called it on 6 October:
 * election day, the campaign and the day the new Cortes meet are in the
 * decree; every other deadline is the LOREG counting days from that call
 * or back from election day, and cites its article.
 *
 * Titles and explanations live in messages (elections.cal_<id>_title,
 * elections.cal_<id>_body); this file only holds the dates and sources.
 */

export type CalendarKind =
  /** Something the voter has to do before a deadline. */
  | 'action'
  /** Only for Spaniards who live abroad (CERA). */
  | 'abroad'
  /** A step of the process the voter only watches. */
  | 'process';

export interface CalendarEvent {
  id: string;
  /** First day, YYYY-MM-DD (Madrid). */
  start: string;
  /** Last day, inclusive; omitted for a single day. */
  end?: string;
  kind: CalendarKind;
  /** The legal basis, shown verbatim ("RD 806/2026, art. 4", "LOREG, art. 72"). */
  source: string;
  url: string;
}

const DECREE_URL = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20742';
const LOREG_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-1985-11672';

export const ELECTION_CALENDAR: CalendarEvent[] = [
  { id: 'call', start: '2026-10-06', kind: 'process', source: 'RD 806/2026', url: DECREE_URL },
  // From the call to the tenth day before polling day.
  { id: 'postal_request', start: '2026-10-06', end: '2026-11-19', kind: 'action', source: 'LOREG, art. 72', url: LOREG_URL },
  // 22nd day after the call.
  { id: 'lists_presented', start: '2026-10-28', kind: 'process', source: 'LOREG, art. 47.1', url: LOREG_URL },
  // 25th to 29th day after the call.
  { id: 'polling_draw', start: '2026-10-31', end: '2026-11-04', kind: 'process', source: 'LOREG, art. 26.4', url: LOREG_URL },
  // Proclaimed on the 27th day, published on the 28th.
  { id: 'lists_proclaimed', start: '2026-11-03', kind: 'process', source: 'LOREG, art. 47.5', url: LOREG_URL },
  // From the 34th day after the call to before the sixth day before polling day.
  { id: 'postal_delivery', start: '2026-11-09', end: '2026-11-22', kind: 'process', source: 'LOREG, art. 73.2', url: LOREG_URL },
  { id: 'campaign', start: '2026-11-13', end: '2026-11-27', kind: 'process', source: 'RD 806/2026, art. 4', url: DECREE_URL },
  // Eighth to third day before polling day, both included.
  { id: 'abroad_urn', start: '2026-11-21', end: '2026-11-26', kind: 'abroad', source: 'LOREG, art. 75.4', url: LOREG_URL },
  // No later than the fifth day before polling day.
  { id: 'abroad_mail', start: '2026-11-24', kind: 'abroad', source: 'LOREG, art. 75.7', url: LOREG_URL },
  // The five days before polling day.
  { id: 'polls_ban', start: '2026-11-24', end: '2026-11-28', kind: 'process', source: 'LOREG, art. 69.7', url: LOREG_URL },
  // Before the third day before polling day.
  { id: 'postal_send', start: '2026-11-25', kind: 'action', source: 'LOREG, art. 73.3', url: LOREG_URL },
  { id: 'reflection', start: '2026-11-28', kind: 'process', source: 'RD 806/2026, art. 4', url: DECREE_URL },
  { id: 'election', start: '2026-11-29', kind: 'action', source: 'RD 806/2026, art. 2; LOREG, art. 84', url: DECREE_URL },
  { id: 'cortes', start: '2026-12-23', kind: 'process', source: 'RD 806/2026, art. 5', url: DECREE_URL },
];

export type CalendarStatus = 'past' | 'now' | 'next' | 'later';

/** Today in Madrid as YYYY-MM-DD. */
export function madridToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/**
 * Where each event stands today: over, under way, the first one still to
 * come (or all of those that start that same day), or later. Events are
 * read in calendar order, so the list must be sorted by start date.
 */
export function calendarStatus(events: CalendarEvent[], today: string): CalendarStatus[] {
  const firstAhead = events.find((e) => e.start > today)?.start;
  return events.map((e) => {
    const end = e.end ?? e.start;
    if (end < today) return 'past';
    if (e.start <= today) return 'now';
    return e.start === firstAhead ? 'next' : 'later';
  });
}

/** Whole days from `today` to `day` (both YYYY-MM-DD). */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
