/**
 * Macro-category grouping for the newsletter / push topic picker.
 *
 * Maps the editorial theme topic slugs into 6 broad umbrellas. The
 * picker presents these as collapsible sections — a user can pick
 * individual themes inside a category or subscribe to the whole
 * category at once.
 *
 * Slugs referenced here must match the canonical taxonomy served by
 * ``api.topics.list({ kind: 'theme' })``. Topics that don't appear in
 * any category fall into the "Altres" bucket the consumer composes
 * on the fly so the picker never silently drops a theme.
 *
 * The SDG (Agenda 2030) slugs that used to live here are gone for the
 * launch — the taxonomy is disabled site-wide while no initiative is
 * classified against it. Restore them from git history once the
 * classifier ships SDG coverage.
 *
 * Source of truth for theme slugs: backend ``classify/topics.py``.
 * Hardcoded here on purpose: the umbrellas are a UX grouping, not a
 * taxonomy fact, and shouldn't change by round-trip.
 */

export interface TopicCategory {
  /** kebab-case identifier; used only for React keys + analytics. */
  slug: string;
  label_ca: string;
  label_es: string;
  label_en: string;
  /** Full list of theme topic slugs that belong to this umbrella. */
  topic_slugs: string[];
}

export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    slug: 'drets-justicia',
    label_ca: 'Drets i justícia',
    label_es: 'Derechos y justicia',
    label_en: 'Rights & justice',
    topic_slugs: ['drets-civils', 'dones-igualtat', 'justicia', 'immigracio'],
  },
  {
    slug: 'economia-treball',
    label_ca: 'Economia i treball',
    label_es: 'Economía y trabajo',
    label_en: 'Economy & labour',
    topic_slugs: [
      'economia',
      'fiscalitat-pressupostos',
      'drets-laborals',
      'industria',
      'comerc',
    ],
  },
  {
    slug: 'medi-ambient-clima',
    label_ca: 'Medi ambient i clima',
    label_es: 'Medio ambiente y clima',
    label_en: 'Environment & climate',
    topic_slugs: ['medi-ambient', 'energia', 'transport-mobilitat'],
  },
  {
    slug: 'salut-benestar',
    label_ca: 'Salut i benestar',
    label_es: 'Salud y bienestar',
    label_en: 'Health & wellbeing',
    topic_slugs: ['salut', 'drogues'],
  },
  {
    slug: 'educacio-cultura',
    label_ca: 'Educació i cultura',
    label_es: 'Educación y cultura',
    label_en: 'Education & culture',
    topic_slugs: ['educacio', 'cultura'],
  },
  {
    slug: 'territori-estat',
    label_ca: 'Territori i Estat',
    label_es: 'Territorio y Estado',
    label_en: 'Territory & state',
    topic_slugs: ['territoris', 'administracions', 'exterior', 'defensa'],
  },
];

type LocaleKey = 'ca' | 'es' | 'en';

/** Resolve the localised label for a category, falling back to Catalan. */
export function categoryLabel(cat: TopicCategory, locale: string): string {
  const key = (
    locale === 'es' || locale === 'en' ? locale : 'ca'
  ) as LocaleKey;
  if (key === 'es') return cat.label_es;
  if (key === 'en') return cat.label_en;
  return cat.label_ca;
}

/**
 * Group a flat list of theme topics by macro-category. Topics that
 * aren't listed in any category land in the final ``other`` bucket so
 * the picker never silently loses a theme. Used by the newsletter /
 * push topic picker on /notifications.
 */
export function groupTopicsByCategory<T extends { slug: string }>(
  topics: T[],
): { category: TopicCategory | null; topics: T[] }[] {
  const bySlug = new Map(topics.map((tp) => [tp.slug, tp] as const));
  const used = new Set<string>();
  const out: { category: TopicCategory | null; topics: T[] }[] = [];
  for (const category of TOPIC_CATEGORIES) {
    const bucket: T[] = [];
    for (const slug of category.topic_slugs) {
      const tp = bySlug.get(slug);
      if (tp) {
        bucket.push(tp);
        used.add(slug);
      }
    }
    if (bucket.length > 0) out.push({ category, topics: bucket });
  }
  const leftover = topics.filter((tp) => !used.has(tp.slug));
  if (leftover.length > 0) out.push({ category: null, topics: leftover });
  return out;
}
