/**
 * The parties' official 29 November 2026 manifestos, by election party slug
 * (lib/electionParties.ts). Only the party's own document, linked, never
 * summarised: a summary would be ours.
 *
 * None was published when this was written (2026-10-26; the PP's
 * "Contrato con España" is a manifesto of commitments, which the party
 * itself says is not its programme). Add each URL the day it is out; the
 * "your vote" page lists them and each group's page links its own.
 */
export const PROGRAMS_2026: Record<string, { url: string; published: string } | undefined> = {
  // pp: { url: 'https://...', published: '2026-11-..' },
};

/** The election party behind each parliamentary group (the Mixed group
 *  holds several, so it has none). */
export const PARTY_OF_GROUP: Record<string, string> = {
  'gp-popular': 'pp',
  'gp-socialista': 'psoe',
  'gp-vox': 'vox',
  'gp-plurinacional-sumar': 'frente-amplio',
  'gp-republicano': 'erc',
  'gp-junts-per-catalunya': 'junts',
  'gp-euskal-herria-bildu': 'bildu',
  'gp-vasco-eaj-pnv': 'pnv',
};
