import type { MetadataRoute } from 'next';

import { api } from '@/lib/api';

/**
 * Sitemap for holapolitica.org.
 *
 * Strategy: every static route is hardcoded; the dynamic detail
 * routes (/votes/[id], /initiatives/[id], /persons/[id],
 * /topics/[slug], /groups/[slug]) are enumerated server-side from the
 * public API at build / regenerate time. We deliberately limit the
 * /votes/[id] enumeration to the most recent 500 because Google does
 * not need every 2024 procedural micro-vote indexed individually —
 * the /votes hub aggregates them. Topic and group routes are small
 * enough to enumerate fully.
 *
 * The sitemap is server-rendered on demand (Next.js MetadataRoute)
 * and respects the same revalidate=300 we use on aggregate endpoints,
 * so a single user hit warms the cache for everyone else within five
 * minutes.
 */

const BASE_URL = 'https://holapolitica.org';

export const revalidate = 300;

const STATIC_ROUTES: { path: string; priority: number; changeFreq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1.0, changeFreq: 'daily' },
  { path: '/votes', priority: 0.9, changeFreq: 'daily' },
  { path: '/persons', priority: 0.8, changeFreq: 'weekly' },
  { path: '/groups', priority: 0.7, changeFreq: 'weekly' },
  { path: '/topics', priority: 0.7, changeFreq: 'weekly' },
  { path: '/agenda-2030', priority: 0.6, changeFreq: 'weekly' },
  { path: '/stats', priority: 0.7, changeFreq: 'daily' },
  { path: '/recorregut', priority: 0.5, changeFreq: 'monthly' },
  { path: '/about', priority: 0.5, changeFreq: 'monthly' },
  { path: '/about/data', priority: 0.5, changeFreq: 'monthly' },
  { path: '/apidocs', priority: 0.5, changeFreq: 'monthly' },
  { path: '/journalists', priority: 0.5, changeFreq: 'monthly' },
  { path: '/notifications', priority: 0.4, changeFreq: 'monthly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static routes — always present, deterministic.
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFreq,
    priority: r.priority,
  }));

  // Dynamic routes. Every fetch is wrapped so a single backend hiccup
  // can't blank the sitemap.
  const [topics, groups, votesPage, initiativesPage] = await Promise.all([
    api.topics.list().catch(() => []),
    api.groups.list().catch(() => []),
    api.votes.list({ page: 1, page_size: 100 }).catch(() => null),
    // We don't have a paginated /initiatives list endpoint yet; we
    // skip the full enumeration and lean on the /votes coverage to
    // surface the related initiative pages via internal linking.
    Promise.resolve(null),
  ]);

  const topicEntries: MetadataRoute.Sitemap = topics.map((t) => ({
    url: `${BASE_URL}/topics/${t.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  const groupEntries: MetadataRoute.Sitemap = groups.map((g) => ({
    url: `${BASE_URL}/groups/${g.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Most recent 100 votes — Google can use the /votes hub to discover
  // older ones via pagination. Surfacing every individual vote would
  // bloat the sitemap (~1800 rows today) without measurable SEO win.
  const voteEntries: MetadataRoute.Sitemap = (votesPage?.items ?? []).map(
    (v) => ({
      url: `${BASE_URL}/votes/${v.id}`,
      lastModified: new Date(v.voted_at),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }),
  );
  // Each linked initiative also gets its own canonical /initiatives/<id>
  // entry derived from the same vote feed.
  const initiativeIds = new Set<number>();
  for (const v of votesPage?.items ?? []) {
    if (v.initiative_id != null) initiativeIds.add(v.initiative_id);
  }
  const initiativeEntries: MetadataRoute.Sitemap = [...initiativeIds].map(
    (id) => ({
      url: `${BASE_URL}/initiatives/${id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }),
  );

  // Linter wants ``initiativesPage`` referenced; we keep the slot for
  // when the backend grows a paginated /initiatives endpoint.
  void initiativesPage;

  return [
    ...staticEntries,
    ...topicEntries,
    ...groupEntries,
    ...voteEntries,
    ...initiativeEntries,
  ];
}
