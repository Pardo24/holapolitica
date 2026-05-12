/**
 * Display the parliamentary group's short name without the "GP " prefix —
 * with one principled exception. The "GP Mixto" group (the catch-all for
 * deputies who don't form their own group) is the ONLY case where keeping
 * the prefix is meaningful: "Mixto" alone reads as an adjective, while
 * "GP Mixto" makes it clear it's a parliamentary GROUP, not a vote choice.
 */
export function displayGroupShort(nameShort: string): string {
  if (nameShort === 'GP Mixto') return nameShort;
  return nameShort.startsWith('GP ') ? nameShort.slice(3) : nameShort;
}

/**
 * User-facing full name for a parliamentary group. The Congreso publishes
 * each group's procedural name (e.g. "Grupo Parlamentario Popular en el
 * Congreso") which reads as bureaucratic; for the public-facing UI we
 * substitute the underlying party / coalition's common-use full name with
 * its abbreviation in parentheses, mirroring how mainstream Spanish media
 * cites them.
 *
 * Caveat: a "parliamentary group" is technically not the same as a
 * "political party" — coalitions like Plurinacional Sumar contain several
 * parties under one group. We pick the recognisable umbrella label rather
 * than the procedural one.
 */
const GROUP_FULL_NAME: Record<string, string> = {
  'gp-popular': 'Partido Popular (PP)',
  'gp-socialista': 'Partido Socialista Obrero Español (PSOE)',
  'gp-vox': 'Vox (VOX)',
  'gp-plurinacional-sumar': 'Sumar',
  'gp-junts-per-catalunya': 'Junts per Catalunya (Junts)',
  'gp-euskal-herria-bildu': 'Euskal Herria Bildu (EH Bildu)',
  'gp-republicano': 'Esquerra Republicana de Catalunya (ERC)',
  'gp-vasco-eaj-pnv': 'Eusko Alderdi Jeltzalea — Partido Nacionalista Vasco (EAJ-PNV)',
  'gp-mixto': 'Grupo Mixto',
};

export function displayGroupFullName(slug: string, fallbackNameLong: string): string {
  return GROUP_FULL_NAME[slug] ?? fallbackNameLong;
}

/**
 * Static "infobox-lite" metadata for each parliamentary group, hardcoded
 * because the open-data feed publishes none of this. Kept short and
 * verifiable from public sources (Wikipedia, party websites). When in
 * doubt about ideology framing we leave the field empty rather than pick
 * a contested label.
 */
export interface GroupInfo {
  founded_year: number | null;
  scope: string;        // territorial or thematic scope, neutral
  website: string | null;
  wikipedia_url: string | null;
}

const GROUP_INFO: Record<string, GroupInfo> = {
  'gp-popular': {
    founded_year: 1989,
    scope: 'Estatal',
    website: 'https://www.pp.es',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Partido_Popular',
  },
  'gp-socialista': {
    founded_year: 1879,
    scope: 'Estatal',
    website: 'https://www.psoe.es',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Partido_Socialista_Obrero_Español',
  },
  'gp-vox': {
    founded_year: 2013,
    scope: 'Estatal',
    website: 'https://www.voxespana.es',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Vox_(partido_político)',
  },
  'gp-plurinacional-sumar': {
    founded_year: 2022,
    scope: 'Estatal — coalició plurinacional',
    website: 'https://www.movimientosumar.es',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Sumar_(coalición_electoral)',
  },
  'gp-junts-per-catalunya': {
    founded_year: 2020,
    scope: 'Catalunya',
    website: 'https://junts.cat',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Junts_per_Catalunya',
  },
  'gp-euskal-herria-bildu': {
    founded_year: 2012,
    scope: 'País Basc + Navarra',
    website: 'https://www.ehbildu.eus',
    wikipedia_url: 'https://es.wikipedia.org/wiki/EH_Bildu',
  },
  'gp-republicano': {
    founded_year: 1931,
    scope: 'Catalunya',
    website: 'https://esquerra.cat',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Esquerra_Republicana_de_Catalunya',
  },
  'gp-vasco-eaj-pnv': {
    founded_year: 1895,
    scope: 'País Basc',
    website: 'https://www.eaj-pnv.eus',
    wikipedia_url: 'https://es.wikipedia.org/wiki/Partido_Nacionalista_Vasco',
  },
  'gp-mixto': {
    founded_year: null,
    scope: 'Diputats sense grup propi',
    website: null,
    wikipedia_url: 'https://es.wikipedia.org/wiki/Grupo_Mixto',
  },
};

export function groupInfo(slug: string): GroupInfo | null {
  return GROUP_INFO[slug] ?? null;
}

/**
 * Canonical brand abbreviation for each group's slug. We don't ship the
 * official party SVG logos (licensing is murky and the official PP/PSOE
 * marks would feel partisan in a civic project), so we render a colored
 * disc with this 2-4 letter mark instead. The result reads as a logo at a
 * glance while keeping the project visually neutral.
 *
 * Slugs not listed here fall back to ``???`` — surface the gap rather than
 * silently making something up.
 */
const GROUP_ABBREVIATION: Record<string, string> = {
  'gp-popular': 'PP',
  'gp-socialista': 'PSOE',
  'gp-vox': 'VOX',
  'gp-plurinacional-sumar': 'Sumar',
  'gp-junts-per-catalunya': 'Junts',
  'gp-euskal-herria-bildu': 'EHB',
  'gp-republicano': 'ERC',
  'gp-vasco-eaj-pnv': 'PNV',
  'gp-mixto': 'Mx',
};

export function groupAbbreviation(slug: string | null | undefined): string {
  if (!slug) return '???';
  return GROUP_ABBREVIATION[slug] ?? '???';
}

/**
 * Foreground color (white or near-black) that contrasts with a given hex
 * background. We use a simplified WCAG luminance threshold — good enough
 * for the muted palette in migration 0006.
 */
/**
 * Parse a free-text initiative ``submitted_by`` string and resolve which
 * parliamentary groups appear in it. The Congreso feed publishes proposers
 * verbatim — most commonly as a single group's full procedural name
 * (e.g. ``"Grupo Parlamentario Popular en el Congreso"``), but occasionally
 * as several groups joined with commas / "y" / "and" for co-signed
 * initiatives. Government bills come through as ``"Gobierno"`` (or a near
 * variant).
 *
 * Strategy: case-insensitive substring match against each group's
 * ``name_long`` (which is what the feed itself uses). Mirrors the backend's
 * ``resolve_proposing_group`` heuristic but returns *all* matches instead of
 * just the longest, so co-signed proposals can render multiple badges.
 *
 * Government detection runs separately: if the trimmed string starts with
 * "Gobierno" / "Govern" we flag it (the UI renders a neutral grey "Govern"
 * badge instead of any party badge).
 *
 * Returns a typed shape so the caller can pick the rendering:
 *   - ``isGovernment``: government-proposed (cabinet, not a party group)
 *   - ``groups``: ordered list of matched groups (deduped)
 *   - ``raw``: the original input, trimmed — fallback when nothing matches
 */
export interface ParsedProposer {
  isGovernment: boolean;
  groups: { slug: string; color_hex: string | null; name_short: string }[];
  raw: string;
}

export function parseProposer(
  submittedBy: string | null | undefined,
  knownGroups: Array<{
    slug: string;
    color_hex: string | null;
    name_short: string;
    name_long: string;
  }>,
): ParsedProposer {
  const raw = (submittedBy ?? '').trim();
  if (raw === '') {
    return { isGovernment: false, groups: [], raw };
  }
  const lower = raw.toLowerCase();
  // Government — recognised in the two main UI languages plus the Catalan
  // form "Govern" the project uses in its own labelling.
  const isGovernment =
    /^(gobierno|govern|government)\b/i.test(raw) || lower === 'gobierno';

  // Match each known group whose name_long appears as a substring. Sort
  // matches longest-name-first so "Vasco (EAJ-PNV)" beats "Vasco" when both
  // would match. Dedupe by slug.
  const matches = knownGroups
    .filter((g) => g.name_long && lower.includes(g.name_long.toLowerCase()))
    .sort((a, b) => b.name_long.length - a.name_long.length);
  const seen = new Set<string>();
  const groups: ParsedProposer['groups'] = [];
  for (const g of matches) {
    if (seen.has(g.slug)) continue;
    // Skip overlapping shorter matches — if a longer name already covered
    // the same span (e.g. "Grupo Parlamentario Vasco (EAJ-PNV)" before
    // "Grupo Parlamentario Vasco"), the shorter one is redundant.
    if (groups.some((picked) => picked.name_short.includes(g.name_short))) {
      continue;
    }
    seen.add(g.slug);
    groups.push({
      slug: g.slug,
      color_hex: g.color_hex,
      name_short: g.name_short,
    });
  }
  return { isGovernment, groups, raw };
}

export function readableTextOn(bg: string | null | undefined): string {
  if (!bg) return '#111827';
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return '#111827';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Relative luminance approximation
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? '#111827' : '#ffffff';
}
