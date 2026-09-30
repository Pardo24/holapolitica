/**
 * Summaries that carry a list, and the two places that need them differently.
 *
 * More than half the plain summaries are motions, and a motion asks for
 * several things at once, so the model writes them as a list:
 *
 *     Demana al Govern que:
 *
 *     1. Obligui que els aliments del programa escolar siguin ecològics…
 *     2. Simplifiqui les normes perquè els petits productors…
 *     3. Estableixi objectius mesurables per reduir…
 *
 * On a law's own page that is exactly right, and it should look like a list.
 * As the headline of a card it is not: clamped to three lines it reads
 * "Demana al Govern que: 1. Obligui… 2. Simplifiqui…", which is neither a
 * title nor a list.
 *
 * So: {@link parseSummary} splits the text once, {@link summaryHeadline}
 * gives the card a first line that reads like a title, and the detail pages
 * render the items as the list they are.
 */

export interface ParsedSummary {
  /** The sentence that introduces the list, or the whole text when there is none. */
  lead: string;
  /** The enumerated points, markers stripped. Empty when the text is prose. */
  items: string[];
}

/** "1." / "2)" / "-" / "•" at the start of a line. */
const LINE_MARKER = /^\s*(?:\d{1,2}[.)]|[-–•*])\s+/;
/** The same markers mid-paragraph, for summaries that came back on one line. */
const INLINE_MARKER = /\s(?=\d{1,2}[.)]\s+[^\s])/g;

export function parseSummary(text: string | null | undefined): ParsedSummary {
  const clean = (text ?? '').trim();
  if (!clean) return { lead: '', items: [] };

  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const firstItem = lines.findIndex((l) => LINE_MARKER.test(l));

  if (firstItem > 0) {
    const items = lines.slice(firstItem).filter((l) => LINE_MARKER.test(l));
    // A single item is not a list; keep it as prose so a card doesn't grow a
    // one-bullet list out of an ordinary sentence.
    if (items.length > 1) {
      return {
        lead: lines.slice(0, firstItem).join(' '),
        items: items.map((l) => l.replace(LINE_MARKER, '').trim()),
      };
    }
  }

  // One-liner variant: "Demana al Govern que: 1. Obliga… 2. Simplifica…".
  const colon = clean.indexOf(':');
  if (colon > 0 && lines.length === 1) {
    const head = clean.slice(0, colon + 1);
    const tail = clean.slice(colon + 1).trim();
    const parts = tail
      .split(INLINE_MARKER)
      .map((p) => p.replace(/^\s*\d{1,2}[.)]\s*/, '').trim())
      .filter(Boolean);
    if (parts.length > 1) return { lead: head, items: parts };
  }

  return { lead: clean, items: [] };
}

/**
 * One line that reads like a title: the lead plus the first point, with the
 * rest counted rather than run together. Prose comes back untouched.
 *
 * No case surgery on the item: lowercasing "Obligui" to follow "que:" would
 * also lowercase "Espanya" two summaries later.
 */
export function summaryHeadline(text: string | null | undefined): string {
  const { lead, items } = parseSummary(text);
  if (items.length === 0) return lead;
  if (!lead) return items[0]!;
  return `${lead} ${items[0]!}`;
}

/**
 * Is the lead just the formula that introduces the list?
 *
 * Half the motions summarise as "Demana al Govern que:" plus eight points.
 * That lead makes a fine introduction to the list and a useless headline: it
 * says nothing about the subject. A page that has the official title to fall
 * back on should use it instead.
 */
export function isStubLead(text: string | null | undefined): boolean {
  const { lead, items } = parseSummary(text);
  if (items.length === 0) return false;
  const words = lead.split(/\s+/).filter(Boolean).length;
  return lead.endsWith(':') && words <= 8;
}

/** How many points the summary enumerates; 0 when it is prose. */
export function summaryPointCount(text: string | null | undefined): number {
  return parseSummary(text).items.length;
}

/** How many points a derived headline leaves out (it shows the first one). */
export function summaryRestCount(text: string | null | undefined): number {
  const { items } = parseSummary(text);
  return items.length > 1 ? items.length - 1 : 0;
}
