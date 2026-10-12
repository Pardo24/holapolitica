import type { AbstractIntlMessages } from 'next-intl';

/**
 * The message namespaces client components read, the only part of the
 * locale file that has to travel to the browser.
 *
 * NextIntlClientProvider serialises whatever it is given into every page's
 * payload. The whole locale file is ~130 KB, sent on every page and on every
 * client navigation; server components translate on the server and need
 * none of it in the browser. Keep this list in step with the
 * ``useTranslations('…')`` / ``useMessages()`` calls in 'use client' files:
 *
 *   grep -l "^'use client'" -r app components | xargs grep -oh "useTranslations('[a-z_]*')"
 *
 * An entry is a whole namespace, or one key of it ('votes.show_original')
 * where client code reads a handful of keys from a large namespace. A
 * namespace or key missing here shows up as the raw key on screen.
 */
export const CLIENT_NAMESPACES = [
  'app_bar',
  'coincidence_progressive',
  'common.how_we_use_ai', // LawOriginalToggle, LawSummaryPanel
  'common.plain_summary_caveat',
  'daily',
  // HighlightsCarousel; PairCoincidenceClient's keys come with the stats route
  'dashboard.highlights_cast_caption',
  'dashboard.highlights_empty_body',
  'dashboard.highlights_empty_eyebrow',
  'dashboard.highlights_next_aria',
  'dashboard.highlights_of_separator',
  'dashboard.highlights_paused',
  'dashboard.highlights_prev_aria',
  'dashboard.highlights_stance',
  'dashboard.highlights_temporality',
  'error_page',
  'footer',
  'glossary', // GlossaryTerm reads it through useMessages()
  'groups',
  'hemicycle',
  'initiative_detail.follow_off', // FollowLawButton
  'initiative_detail.follow_on',
  'install_prompt',
  'jocs',
  'mobile_back',
  'nav',
  'newsletter',
  'onboarding',
  'persons',
  'persons_autocomplete',
  'profiles',
  'share',
  'site',
  'stats_filter',
  'summary_hover',
  'votes.plain_summary_ai_badge', // LawOriginalToggle, LawSummaryPanel
  'votes.plain_summary_title',
  'votes.show_original',
  'welcome',
  'whats_new',
] as const;

/**
 * Namespaces only one route's client components read. They are added by a
 * nested provider on that route (components/RouteMessages.tsx) instead of
 * riding along on every page of the site.
 */
export const ROUTE_NAMESPACES = {
  notifications: ['notifications'], // NotificationsManager, NewsletterPreferencesManager
  stats: ['stats', 'dashboard'], // PairCoincidenceClient
  group: ['group'], // GroupCompositionFilter
} as const;

export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const entry of namespaces) {
    const dot = entry.indexOf('.');
    if (dot < 0) {
      const value = messages[entry];
      if (value !== undefined) out[entry] = value;
      continue;
    }
    const ns = entry.slice(0, dot);
    const source = messages[ns];
    if (typeof source !== 'object') continue;
    const value = source[entry.slice(dot + 1)];
    if (value === undefined) continue;
    // A whole namespace picked as well (a route adding it) wins over keys.
    const target = out[ns];
    if (typeof target === 'object') {
      if (target !== source) target[entry.slice(dot + 1)] = value;
    } else {
      out[ns] = { [entry.slice(dot + 1)]: value };
    }
  }
  return out;
}
