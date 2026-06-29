import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, type Topic } from '@/lib/api';

/**
 * Embed widget for a parliamentary group — a factual "snapshot".
 *
 * Usage:
 *   <iframe src="https://www.holapolitica.org/embed/groups/sumar"
 *           width="100%" height="300" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * Replaces the earlier demographic (gender + age) variant which Daniel
 * flagged as banal for newsrooms. The snapshot answers the three
 * questions an editor actually asks about a group, all by topic:
 *
 *   1. The topic the group PROPOSES most  (initiatives it tabled)
 *   2. The topic it votes IN FAVOUR of most often (ayes)
 *   3. The topic it votes AGAINST most often (noes)
 *
 * Same embed contract as the rest of /embed/*:
 *   - sub-1s render, inline styles, no JS / external assets
 *   - factual only (zero editorial framing)
 *   - attribution + link back to the canonical page
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Pick the localized topic name for the active locale, falling back
 *  to Catalan (the only name the stat endpoints return inline). */
function localizedTopicName(
  slug: string,
  fallbackCa: string,
  topicsBySlug: Map<string, Topic>,
  locale: string,
): string {
  const topic = topicsBySlug.get(slug);
  if (!topic) return fallbackCa;
  if (locale === 'es') return topic.name_es;
  if (locale === 'en') return topic.name_en;
  return topic.name_ca;
}

export default async function EmbedGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('embed_group');
  const locale = await getLocale();

  let group;
  let proposes;
  let topicStats;
  try {
    group = await api.groups.get(slug);
    [proposes, topicStats] = await Promise.all([
      api.groups.proposesByTopic(slug),
      api.groups.topicStats(slug),
    ]);
  } catch {
    return (
      <div
        style={{
          padding: 20,
          fontSize: 13,
          color: 'var(--ink-3)',
          textAlign: 'center',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        {t('not_found')}
      </div>
    );
  }

  // Localized topic names — the stat endpoints only return Catalan, so
  // we resolve the rest from the topics catalogue. Best-effort: if the
  // catalogue fails we just show the Catalan names inline.
  const topics = await api.topics.list().catch(() => []);
  const topicsBySlug = new Map(topics.map((topic) => [topic.slug, topic]));

  const color = group.color_hex ?? 'var(--ink)';

  // The three facts. proposesByTopic comes sorted desc by count; for the
  // vote stances we sort a copy by ayes / noes. Each can be absent (a
  // group that has never proposed, or never voted on anything).
  const mostProposed = proposes[0] ?? null;
  const mostAye =
    [...topicStats].filter((s) => s.ayes > 0).sort((a, b) => b.ayes - a.ayes)[0] ?? null;
  const mostNo =
    [...topicStats].filter((s) => s.noes > 0).sort((a, b) => b.noes - a.noes)[0] ?? null;

  const rows: {
    key: string;
    label: string;
    slug: string | null;
    name: string;
    colorHex: string | null;
    metric: string;
  }[] = [
    {
      key: 'proposes',
      label: t('snapshot_proposes'),
      slug: mostProposed?.topic_slug ?? null,
      name: mostProposed
        ? localizedTopicName(
            mostProposed.topic_slug,
            mostProposed.topic_name_ca,
            topicsBySlug,
            locale,
          )
        : t('no_data'),
      colorHex: mostProposed?.topic_color_hex ?? null,
      metric: mostProposed ? t('count_initiatives', { n: mostProposed.count }) : '',
    },
    {
      key: 'aye',
      label: t('snapshot_yes'),
      slug: mostAye?.topic_slug ?? null,
      name: mostAye
        ? localizedTopicName(mostAye.topic_slug, mostAye.topic_name_ca, topicsBySlug, locale)
        : t('no_data'),
      colorHex: mostAye?.topic_color_hex ?? null,
      metric: mostAye ? t('count_ayes', { n: mostAye.ayes }) : '',
    },
    {
      key: 'no',
      label: t('snapshot_no'),
      slug: mostNo?.topic_slug ?? null,
      name: mostNo
        ? localizedTopicName(mostNo.topic_slug, mostNo.topic_name_ca, topicsBySlug, locale)
        : t('no_data'),
      colorHex: mostNo?.topic_color_hex ?? null,
      metric: mostNo ? t('count_noes', { n: mostNo.noes }) : '',
    },
  ];

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${color}`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: color,
            flex: 'none',
            display: 'inline-block',
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            className="serif"
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.005em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {group.name_long}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>
            {group.name_short}
          </p>
        </div>
        <span
          className="tabular"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {group.members_active}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--ink-3)',
              marginLeft: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {t('label_seats')}
          </span>
        </span>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row) => (
          <section key={row.key}>
            <div
              style={{
                fontSize: 9.5,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {row.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: row.colorHex ?? 'var(--ink-3)',
                  flex: 'none',
                  opacity: row.slug ? 1 : 0.4,
                }}
              />
              <span
                className="serif"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: row.slug ? 'var(--ink)' : 'var(--ink-3)',
                  lineHeight: 1.2,
                  minWidth: 0,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.name}
              </span>
              {row.metric && (
                <span
                  className="tabular"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink-3)',
                    whiteSpace: 'nowrap',
                    flex: 'none',
                  }}
                >
                  {row.metric}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>

      <footer
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid var(--rule)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <a
          href={`/groups/${group.slug}`}
          target="_top"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            fontWeight: 600,
          }}
        >
          {t('see_detail')}
        </a>
        <span>
          {t('source_label')}{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            target="_top"
            style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 700 }}
          >
            Hola Política
          </a>
        </span>
      </footer>
    </article>
  );
}
