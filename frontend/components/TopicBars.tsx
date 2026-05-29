import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import type { Topic, TopicVoteStat } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { resolveTopicName } from '@/lib/topics';

const C_AYE = '#16a34a';

// Below this many casts a topic is too thin to mean much — shown, but
// tagged with an n= badge so the reader knows the % is shaky.
const MIN_N_RELIABLE = 15;
const MIN_N_TO_SHOW = 5;

/**
 * Per-topic support for a group, as a grid of cards.
 *
 * Each card: topic icon + name + the group's % "a favor" (ayes / votes
 * cast) for that topic. Cards are ordered by that percentage descending,
 * so the most-supported topics lead and the least-supported close the
 * grid — both extremes visible, which keeps it symmetric (CLAUDE.md)
 * without us editorialising a single "highlight". No stacked bars.
 *
 * Methodology (docs/research-stats-methodology.md): denominator is votes
 * CAST (Sí+No+Abst); absent/no-vote excluded. Topics with cast < 5 are
 * hidden; 5–14 show with an n= badge and aren't statistically firm.
 */
export async function TopicBars({
  rows,
  emptyHint,
  groupSlug,
  allTopics,
}: {
  rows: TopicVoteStat[];
  emptyHint?: string;
  /** When set, cards link to /topics/<slug>?group=<groupSlug>. */
  groupSlug?: string;
  /** Full catalogue — supplies localised names + per-topic icons. */
  allTopics?: Topic[];
}) {
  const t = await getTranslations('topic_bars');
  const locale = await getLocale();

  const significant = rows.filter((r) => r.cast >= MIN_N_TO_SHOW);
  if (significant.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        {emptyHint ?? t('empty_default')}
      </p>
    );
  }

  const iconBySlug = new Map((allTopics ?? []).map((tp) => [tp.slug, tp.icon]));
  const nameOf = (r: TopicVoteStat) =>
    resolveTopicName(r.topic_slug, allTopics, locale, r.topic_name_ca);

  // Order by the group's % a favor, descending.
  const ordered = [...significant].sort(
    (a, b) => b.ayes / b.cast - a.ayes / a.cast,
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 12,
        marginTop: 14,
      }}
    >
      {ordered.map((r) => {
        const pct = Math.round((r.ayes / r.cast) * 100);
        const Icon = topicIcon(iconBySlug.get(r.topic_slug));
        const color = r.topic_color_hex ?? 'var(--ink-3)';
        const thin = r.cast < MIN_N_RELIABLE;
        const name = nameOf(r);

        const inner = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  flex: 'none',
                  color,
                  background: `color-mix(in oklch, ${color} 16%, var(--paper))`,
                }}
              >
                <Icon size={15} strokeWidth={2} aria-hidden="true" />
              </span>
              <span
                className="line-clamp-2"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  lineHeight: 1.25,
                  minWidth: 0,
                }}
              >
                {name}
              </span>
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="tabular"
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: C_AYE,
                  lineHeight: 1,
                }}
              >
                {pct}%
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {t('favor_caption')}
              </span>
              {thin && (
                <span
                  className="tabular"
                  aria-label={t('low_confidence_aria')}
                  title={t('low_confidence_aria')}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ink-3)',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    flex: 'none',
                  }}
                >
                  n={r.cast}
                </span>
              )}
            </div>
          </>
        );

        const cardStyle: React.CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          padding: 14,
          borderRadius: 12,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          minWidth: 0,
        };

        return groupSlug ? (
          <Link
            key={r.topic_slug}
            href={`/topics/${r.topic_slug}?group=${encodeURIComponent(groupSlug)}` as Route}
            className="topic-card-link"
            style={{ ...cardStyle, color: 'inherit', textDecoration: 'none' }}
          >
            {inner}
          </Link>
        ) : (
          <div key={r.topic_slug} style={cardStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
