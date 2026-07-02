/**
 * Static map from parliamentary-group slug to its party logo under
 * ``public/logos/`` (official logos, Wikimedia Commons — see
 * ``public/logos/SOURCES.txt`` for provenance). Nominative use: the
 * logos identify the parties, nothing else.
 *
 * GP Mixto is deliberately absent — it is a bag of unaligned deputies
 * with no shared brand, so it keeps the neutral colour disc.
 *
 * The DB also has a ``parliamentary_groups.logo_url`` column (NULL in
 * production); when that gets populated it takes precedence at the
 * call sites — this map is the local fallback that makes logos work
 * without a backend deploy.
 */
const GROUP_LOGOS: Record<string, string> = {
  'gp-socialista': '/logos/gp-socialista.svg',
  'gp-popular': '/logos/gp-popular.svg',
  'gp-vox': '/logos/gp-vox.svg',
  'gp-plurinacional-sumar': '/logos/gp-plurinacional-sumar.svg',
  'gp-republicano': '/logos/gp-republicano.svg',
  'gp-junts-per-catalunya': '/logos/gp-junts-per-catalunya.svg',
  'gp-vasco-eaj-pnv': '/logos/gp-vasco-eaj-pnv.svg',
  'gp-euskal-herria-bildu': '/logos/gp-euskal-herria-bildu.svg',
};

export function groupLogoUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return GROUP_LOGOS[slug] ?? null;
}
