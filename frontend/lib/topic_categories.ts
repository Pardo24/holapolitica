/**
 * Macro-category grouping for the newsletter / push topic picker.
 *
 * Maps the 17 editorial theme topic slugs into 6 broad umbrellas so
 * the picker on /notifications doesn't dump all themes in a single
 * wall of checkboxes. The slugs here MUST match the canonical
 * taxonomy seeded in ``backend/alembic/versions/0002_seed.py``.
 * Adding a new topic on the backend requires updating this file too
 * or the topic falls through to the "Altres" bucket.
 *
 * The umbrellas are an editorial UX choice, not a taxonomy fact —
 * they exist to chunk the picker, nothing more. They are NOT
 * surfaced on votes, on /stats, or on any analytics surface.
 *
 * Previous SDG slugs are gone: the Agenda 2030 taxonomy is disabled
 * site-wide for the launch.
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
    slug: 'serveis-publics',
    label_ca: 'Serveis públics',
    label_es: 'Servicios públicos',
    label_en: 'Public services',
    topic_slugs: ['habitatge', 'sanitat', 'transport'],
  },
  {
    slug: 'drets-justicia',
    label_ca: 'Drets i justícia',
    label_es: 'Derechos y justicia',
    label_en: 'Rights & justice',
    topic_slugs: ['igualtat', 'justicia', 'immigracio', 'tecnologia-drets'],
  },
  {
    slug: 'economia-treball',
    label_ca: 'Economia i treball',
    label_es: 'Economía y trabajo',
    label_en: 'Economy & labour',
    topic_slugs: ['economia', 'drets-laborals'],
  },
  {
    slug: 'medi-ambient-clima',
    label_ca: 'Medi ambient i clima',
    label_es: 'Medio ambiente y clima',
    label_en: 'Environment & climate',
    topic_slugs: ['medi-ambient', 'energia'],
  },
  {
    slug: 'educacio-cultura',
    label_ca: 'Educació i cultura',
    label_es: 'Educación y cultura',
    label_en: 'Education & culture',
    topic_slugs: ['educacio', 'cultura-llengua', 'memoria'],
  },
  {
    slug: 'estat-institucions',
    label_ca: 'Estat i institucions',
    label_es: 'Estado e instituciones',
    label_en: 'State & institutions',
    topic_slugs: ['institucions', 'internacional', 'seguretat'],
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
 * the picker never silently loses a theme.
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
