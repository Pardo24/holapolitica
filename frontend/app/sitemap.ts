import type { MetadataRoute } from 'next';

import { api } from '@/lib/api';

/**
 * Sitemap for holapolitica.org: every page a search engine should know.
 *
 * It used to list the last 100 votes and no deputy at all, out of ~16,000
 * votes, ~1,600 laws and ~1,250 deputies, and Google sent three visits in
 * three days (Caddy log, 2026-10-24). Now every vote, law, deputy and
 * plenary day is listed, from one cached backend call (/sitemap/ids), plus
 * the 29-N candidacies of each constituency and every "what affects you"
 * profile. ~20,000 URLs, well under the 50,000 a sitemap may hold.
 *
 * Every fetch is wrapped: a backend hiccup leaves the static routes, never
 * an empty sitemap.
 */

// Canonical host is the www subdomain — the apex 301-redirects to it,
// so listing the bare apex here costs Google a redirect hop per URL
// and (worse) can be read as two distinct sites for indexing purposes.
const BASE_URL = 'https://www.holapolitica.org';

export const revalidate = 21600;

type Freq = MetadataRoute.Sitemap[number]['changeFrequency'];

const STATIC_ROUTES: { path: string; priority: number; changeFreq: Freq }[] = [
  { path: '/', priority: 1.0, changeFreq: 'daily' },
  { path: '/eleccions', priority: 0.95, changeFreq: 'daily' },
  { path: '/pactes', priority: 0.8, changeFreq: 'hourly' },
  { path: '/lleis', priority: 0.9, changeFreq: 'daily' },
  { path: '/votes', priority: 0.9, changeFreq: 'daily' },
  { path: '/avui', priority: 0.9, changeFreq: 'daily' },
  { path: '/el-teu-diputat', priority: 0.9, changeFreq: 'weekly' },
  { path: '/com-et-representen', priority: 0.85, changeFreq: 'weekly' },
  { path: '/et-afecta', priority: 0.8, changeFreq: 'weekly' },
  { path: '/topics', priority: 0.7, changeFreq: 'weekly' },
  { path: '/stats', priority: 0.7, changeFreq: 'daily' },
  { path: '/mapa', priority: 0.6, changeFreq: 'weekly' },
  { path: '/jocs', priority: 0.6, changeFreq: 'weekly' },
  { path: '/pregunta-del-dia', priority: 0.6, changeFreq: 'daily' },
  { path: '/recorregut', priority: 0.5, changeFreq: 'monthly' },
  { path: '/legislatures', priority: 0.5, changeFreq: 'monthly' },
  { path: '/agenda-2030', priority: 0.5, changeFreq: 'monthly' },
  { path: '/about', priority: 0.5, changeFreq: 'monthly' },
  { path: '/about/data', priority: 0.4, changeFreq: 'monthly' },
  { path: '/apidocs', priority: 0.4, changeFreq: 'monthly' },
  { path: '/journalists', priority: 0.4, changeFreq: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entry = (path: string, priority: number, changeFrequency: Freq, lastModified: Date = now) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });

  const [ids, topics, groups, profiles, candidacies] = await Promise.all([
    api.sitemap.ids().catch(() => null),
    api.topics.list().catch(() => []),
    api.groups.list().catch(() => []),
    api.initiatives.profiles().catch(() => []),
    api.elections.candidacies().catch(() => null),
  ]);

  return [
    ...STATIC_ROUTES.map((r) => entry(r.path, r.priority, r.changeFreq)),
    // Who stands in each constituency on 29 November: what people search for now.
    ...(candidacies?.constituencies ?? []).map((c) =>
      entry(`/eleccions?circ=${encodeURIComponent(c.constituency)}`, 0.8, 'daily'),
    ),
    ...profiles.map((p) => entry(`/et-afecta/${p.key}`, 0.7, 'weekly')),
    ...topics.map((t) => entry(`/topics/${t.slug}`, 0.6, 'weekly')),
    ...groups.map((g) => entry(`/groups/${g.slug}`, 0.7, 'weekly')),
    ...(ids?.persons ?? []).map((id) => entry(`/persons/${id}`, 0.7, 'weekly')),
    ...(ids?.initiatives ?? []).map(([id, submitted]) =>
      entry(`/initiatives/${id}`, 0.6, 'monthly', submitted ? new Date(submitted) : now),
    ),
    ...(ids?.votes ?? []).map(([id, day]) => entry(`/votes/${id}`, 0.5, 'yearly', new Date(day))),
    // Past plenary days don't change.
    ...(ids?.days ?? []).map((day) => entry(`/avui/${day}`, 0.5, 'never', new Date(day))),
  ];
}
