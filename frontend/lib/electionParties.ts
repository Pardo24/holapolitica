/**
 * Parties of the 29 November 2026 election, as the /pactes filter and the
 * article tags show them. Same slugs and order as the backend
 * (app/services/election_parties.py): seats in the outgoing Congress.
 * Colours are the site's group colours (Frente Amplio takes the Sumar
 * group's); the parties without a group of their own get their usual one.
 */
export interface ElectionParty {
  slug: string;
  name: string;
  color: string;
}

export const ELECTION_PARTIES: ElectionParty[] = [
  { slug: 'pp', name: 'PP', color: '#1E88E5' },
  { slug: 'psoe', name: 'PSOE', color: '#E53935' },
  { slug: 'vox', name: 'Vox', color: '#43A047' },
  { slug: 'frente-amplio', name: 'Frente Amplio', color: '#8E24AA' },
  { slug: 'erc', name: 'ERC', color: '#FB8C00' },
  { slug: 'junts', name: 'Junts', color: '#00ACC1' },
  { slug: 'bildu', name: 'EH Bildu', color: '#7CB342' },
  { slug: 'pnv', name: 'PNV', color: '#00897B' },
  { slug: 'podemos', name: 'Podemos', color: '#5E35B1' },
  { slug: 'bng', name: 'BNG', color: '#4FA3D9' },
  { slug: 'cc', name: 'CC', color: '#F2B705' },
  { slug: 'upn', name: 'UPN', color: '#3F51B5' },
];

const BY_SLUG = new Map(ELECTION_PARTIES.map((p) => [p.slug, p]));

export function electionParty(slug: string | null | undefined): ElectionParty | null {
  return slug ? BY_SLUG.get(slug) ?? null : null;
}

/** Election day, and how many days are left to it in Madrid. */
export const ELECTION_DAY = '2026-11-29';

export function daysToElection(now: Date = new Date()): number {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return Math.round((Date.parse(`${ELECTION_DAY}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
