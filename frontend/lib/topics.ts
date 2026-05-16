/**
 * Locale-aware topic name resolution.
 *
 * The backend ships three language fields on `Topic` (`name_ca`,
 * `name_es`, `name_en`) but the lighter `TopicVoteStat`,
 * `TopicGlobalStat`, `TopicCount`, `Highlight` and similar aggregate
 * shapes only carry `topic_name_ca` to keep the matrix-shaped
 * responses small. The frontend therefore handles localisation in
 * two ways:
 *
 * 1. `pickTopicName(topic, locale)` — full `Topic` object available,
 *    pick the matching field with a Catalan fallback.
 * 2. `resolveTopicName(slug, allTopics, locale, fallback)` — only a
 *    slug is available (typical inside metrics responses). The
 *    caller passes the full `Topic[]` list (cheap, cached at
 *    /topics) plus the slug-bound Catalan fallback string that
 *    came alongside the slug. We look up the localised name when
 *    we have it and fall back to the bundled Catalan otherwise so
 *    a new topic that hasn't been re-fetched yet still renders.
 *
 * Both helpers never throw — a missing field falls through to
 * Catalan, then to the raw slug. Better to show the wrong language
 * than to crash on an unseen value.
 */

import type { Topic } from '@/lib/api';

export type LocaleLike = string;

interface TopicNameFields {
  name_ca: string;
  name_es?: string | null;
  name_en?: string | null;
}

/** Pick the localised name from a full {@link Topic} (or anything with the three name fields). */
export function pickTopicName(
  topic: TopicNameFields | null | undefined,
  locale: LocaleLike,
): string {
  if (!topic) return '';
  if (locale === 'es' && topic.name_es) return topic.name_es;
  if (locale === 'en' && topic.name_en) return topic.name_en;
  return topic.name_ca;
}

/**
 * Resolve a topic's localised name when we only carry the slug + the
 * Catalan-bundled fallback string from a metrics response.
 *
 * Caller examples: {@link TopicVoteStat} (`topic_slug`, `topic_name_ca`),
 * {@link TopicGlobalStat}, {@link TopicCount}, {@link Highlight}.
 */
export function resolveTopicName(
  slug: string,
  allTopics: readonly Topic[] | null | undefined,
  locale: LocaleLike,
  fallbackName: string,
): string {
  if (locale === 'ca') return fallbackName;
  const match = allTopics?.find((t) => t.slug === slug);
  return match ? pickTopicName(match, locale) : fallbackName;
}
