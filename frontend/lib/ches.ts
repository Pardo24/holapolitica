/**
 * Expert-survey placement of the Spanish parties on two axes, from the
 * **Chapel Hill Expert Survey (CHES)** — an academic survey of political
 * scientists, widely used as a neutral reference. Values are approximate,
 * 0–10:
 *   - `lr` (lrgen): economic/general left (0) ↔ right (10).
 *   - `gt` (galtan): libertarian/progressive (0) ↔ authoritarian/traditional (10).
 *
 * Keyed by our group slug. This is an EXTERNAL placement (not ours), cited on
 * the page; the Grupo Mixto is deliberately omitted (it's not a single party).
 * Source: https://www.chesdata.eu
 */
export interface ChesScore {
  lr: number;
  gt: number;
}

export const CHES_SCORES: Record<string, ChesScore> = {
  'gp-socialista': { lr: 3.6, gt: 3.0 },
  'gp-popular': { lr: 7.1, gt: 7.2 },
  'gp-vox': { lr: 9.3, gt: 9.1 },
  'gp-plurinacional-sumar': { lr: 1.8, gt: 2.6 },
  'gp-confederal-de-unidas-podemos-en-comu-podem-galicia-en-comun': { lr: 1.6, gt: 2.5 },
  'gp-confederal-de-unidos-podemos-en-comu-podem-en-marea': { lr: 1.6, gt: 2.5 },
  'gp-podemos-en-comu-podem-en-marea': { lr: 1.6, gt: 2.5 },
  'gp-de-iu-icv-euia-cha-la-izquierda-plural': { lr: 1.5, gt: 2.6 },
  'gp-ciudadanos': { lr: 6.5, gt: 5.6 },
  'gp-de-union-progreso-y-democracia': { lr: 5.4, gt: 5.5 },
  'gp-republicano': { lr: 2.6, gt: 2.9 },
  'gp-de-esquerra-republicana': { lr: 2.6, gt: 2.9 },
  'gp-junts-per-catalunya': { lr: 5.7, gt: 5.1 },
  'gp-catalan-de-convergencia-i-d-unio': { lr: 6.0, gt: 5.4 },
  'gp-catalan-democracia-i-llibertat': { lr: 5.9, gt: 5.2 },
  'gp-euskal-herria-bildu': { lr: 1.6, gt: 2.6 },
  'gp-vasco-eaj-pnv': { lr: 5.3, gt: 5.0 },
};
