/**
 * Macro-category grouping for the newsletter topic picker.
 *
 * Maps the 34 fine-grained topic slugs (17 editorial themes + 17 SDGs)
 * into 6 broad umbrellas. The picker presents these as collapsible
 * sections — a user can pick individual themes inside a category or
 * subscribe to the whole category at once.
 *
 * Slugs referenced here must match the canonical taxonomy served by
 * ``api.topics.list()``. Topics that don't appear in any category are
 * still selectable via the underlying topic list — but they won't show
 * up under any umbrella. Keep this file in sync with the backend
 * taxonomy if new topics are added.
 *
 * Source of truth for slugs: backend ``classify/topics.py`` (themes)
 * and ``classify/sdgs.py`` (SDG labels). Hardcoded here to avoid a
 * round trip and to make the grouping editorial (the umbrellas are a
 * UX choice, not a taxonomy fact).
 */

export interface TopicCategory {
  /** kebab-case identifier; used only for React keys + analytics. */
  slug: string;
  label_ca: string;
  label_es: string;
  label_en: string;
  /**
   * Full list of fine-grained topic slugs that belong to this umbrella.
   * Order matters — themes first, SDGs last, so the chips read most
   * recognisable label → most abstract.
   */
  topic_slugs: string[];
}

export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    slug: 'drets-justicia',
    label_ca: 'Drets i justícia',
    label_es: 'Derechos y justicia',
    label_en: 'Rights & justice',
    topic_slugs: [
      'drets-civils',
      'dones-igualtat',
      'justicia',
      'immigracio',
      'sdg-05',
      'sdg-10',
      'sdg-16',
    ],
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
      'sdg-08',
      'sdg-09',
    ],
  },
  {
    slug: 'medi-ambient-clima',
    label_ca: 'Medi ambient i clima',
    label_es: 'Medio ambiente y clima',
    label_en: 'Environment & climate',
    topic_slugs: [
      'medi-ambient',
      'energia',
      'transport-mobilitat',
      'sdg-06',
      'sdg-07',
      'sdg-11',
      'sdg-12',
      'sdg-13',
      'sdg-14',
      'sdg-15',
    ],
  },
  {
    slug: 'salut-benestar',
    label_ca: 'Salut i benestar',
    label_es: 'Salud y bienestar',
    label_en: 'Health & wellbeing',
    topic_slugs: ['salut', 'drogues', 'sdg-03'],
  },
  {
    slug: 'educacio-cultura',
    label_ca: 'Educació i cultura',
    label_es: 'Educación y cultura',
    label_en: 'Education & culture',
    topic_slugs: ['educacio', 'cultura', 'sdg-04'],
  },
  {
    slug: 'territori-estat',
    label_ca: 'Territori i Estat',
    label_es: 'Territorio y Estado',
    label_en: 'Territory & state',
    topic_slugs: ['territoris', 'administracions', 'exterior', 'defensa', 'sdg-17'],
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
