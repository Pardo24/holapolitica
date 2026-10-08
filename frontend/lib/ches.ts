/**
 * Expert-survey placement of the Spanish parties on two axes, taken VERBATIM
 * from the **Chapel Hill Expert Survey (CHES)** — an academic survey of
 * political scientists, widely used as a neutral reference. Values are the
 * official party means (rounded to one decimal), 0–10:
 *   - `lr` (lrgen): economic/general left (0) ↔ right (10).
 *   - `gt` (galtan): libertarian/progressive (0) ↔ authoritarian/traditional (10).
 *
 * CHES runs in waves, so each legislature is matched to its closest wave rather
 * than reusing a single snapshot. Tables below are keyed by our group slug; the
 * value is that wave's reading for the party the group represents. Grupo Mixto
 * and Grupo Plural are omitted (they hold several parties — no single point).
 *
 * Sources: 1999–2019 trend file and the 2024 wave, https://www.chesdata.eu
 */
export interface ChesScore {
  lr: number;
  gt: number;
}

type Wave = '2010' | '2014' | '2019' | '2024';

const WAVES: Record<Wave, Record<string, ChesScore>> = {
  // CHES 2010 — legislature X (PP/PSOE majority era).
  '2010': {
    'gp-socialista': { lr: 3.7, gt: 2.3 },
    'gp-popular': { lr: 7.3, gt: 8.2 },
    'gp-catalan-de-convergencia-i-d-unio': { lr: 6.0, gt: 6.3 },
    'gp-de-iu-icv-euia-cha-la-izquierda-plural': { lr: 1.8, gt: 1.2 },
    'gp-de-union-progreso-y-democracia': { lr: 5.5, gt: 3.5 },
    'gp-vasco-eaj-pnv': { lr: 6.1, gt: 6.3 },
  },
  // CHES 2014 — legislatures XI and XII (rise of Podemos and Ciudadanos).
  '2014': {
    'gp-socialista': { lr: 3.8, gt: 2.2 },
    'gp-popular': { lr: 7.3, gt: 8.0 },
    'gp-ciudadanos': { lr: 5.6, gt: 3.2 },
    'gp-podemos-en-comu-podem-en-marea': { lr: 1.7, gt: 1.8 },
    'gp-confederal-de-unidos-podemos-en-comu-podem-en-marea': { lr: 1.7, gt: 1.8 },
    'gp-de-esquerra-republicana': { lr: 3.7, gt: 2.1 },
    'gp-catalan-democracia-i-llibertat': { lr: 6.2, gt: 6.2 },
    'gp-vasco-eaj-pnv': { lr: 6.3, gt: 6.4 },
  },
  // CHES 2019 — legislatures XIII and XIV (Vox enters; Cs at its peak).
  '2019': {
    'gp-socialista': { lr: 3.6, gt: 2.9 },
    'gp-popular': { lr: 8.1, gt: 8.0 },
    'gp-vox': { lr: 9.7, gt: 9.7 },
    'gp-ciudadanos': { lr: 7.2, gt: 5.5 },
    'gp-confederal-de-unidas-podemos-en-comu-podem-galicia-en-comun': { lr: 1.9, gt: 1.3 },
    'gp-republicano': { lr: 3.2, gt: 2.9 },
    'gp-euskal-herria-bildu': { lr: 1.3, gt: 1.8 },
    'gp-vasco-eaj-pnv': { lr: 6.0, gt: 5.7 },
  },
  // CHES 2024 — legislature XV (Sumar and Junts as such).
  '2024': {
    'gp-socialista': { lr: 3.8, gt: 2.9 },
    'gp-popular': { lr: 7.2, gt: 7.0 },
    'gp-vox': { lr: 9.4, gt: 9.5 },
    'gp-plurinacional-sumar': { lr: 2.3, gt: 1.2 },
    'gp-republicano': { lr: 3.4, gt: 2.6 },
    'gp-junts-per-catalunya': { lr: 6.6, gt: 5.9 },
    'gp-euskal-herria-bildu': { lr: 2.4, gt: 2.2 },
    'gp-vasco-eaj-pnv': { lr: 6.1, gt: 6.2 },
  },
};

/** The CHES wave whose fieldwork sits closest to a legislature's start year. */
function waveForYear(year: number): Wave {
  if (year <= 2012) return '2010';
  if (year <= 2017) return '2014';
  if (year <= 2021) return '2019';
  return '2024';
}

/**
 * The parties inside the Grupo Mixto that CHES places on their own. The
 * group as a whole has no single point, but its parties do: plotted apart,
 * sized by their deputies, linked to the group. CHES 2024 (CHES_2024_final_v2,
 * party means rounded to one decimal). Members of the group the survey does
 * not score are not drawn.
 */
export interface ChesMixedParty extends ChesScore {
  key: string;
  name: string;
  abbr: string;
  color: string;
  seats: number;
}

const MIXED: Partial<Record<Wave, ChesMixedParty[]>> = {
  '2024': [
    { key: 'podemos', name: 'Podemos', abbr: 'POD', color: '#6B2C91', seats: 4, lr: 1.6, gt: 1.4 },
    { key: 'bng', name: 'BNG', abbr: 'BNG', color: '#5DADE2', seats: 1, lr: 2.7, gt: 2.5 },
    { key: 'cc', name: 'Coalición Canaria', abbr: 'CC', color: '#E8B800', seats: 1, lr: 6.0, gt: 6.2 },
    { key: 'upn', name: 'UPN', abbr: 'UPN', color: '#2A52BE', seats: 1, lr: 7.6, gt: 7.2 },
  ],
};

/** The Mixto's parties with their own placement in the legislature's wave. */
export function chesMixedParties(legislatureStartYear: number): ChesMixedParty[] {
  return MIXED[waveForYear(legislatureStartYear)] ?? [];
}

/** Expert-survey position for a group in the legislature of the given start
 *  year, or null if that group has no single placement (e.g. Mixto, Plural). */
export function chesScore(slug: string, legislatureStartYear: number): ChesScore | null {
  return WAVES[waveForYear(legislatureStartYear)][slug] ?? null;
}
