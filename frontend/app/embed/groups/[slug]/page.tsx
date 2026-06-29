import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, type GroupSnapshotFact, type Topic } from '@/lib/api';

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
  let snapshot;
  try {
    group = await api.groups.get(slug);
    snapshot = await api.groups.snapshot(slug);
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

  // The three snapshot facts, computed server-side across the group's whole
  // history. Each can be absent (no proposals, or too few decided votes).
  const factRow = (
    key: string,
    label: string,
    fact: GroupSnapshotFact | null,
    metric: (fact: GroupSnapshotFact) => string,
  ) => ({
    key,
    label,
    slug: fact?.topic_slug ?? null,
    name: fact
      ? localizedTopicName(fact.topic_slug, fact.topic_name_ca, topicsBySlug, locale)
      : t('no_data'),
    colorHex: fact?.topic_color_hex ?? null,
    metric: fact ? metric(fact) : '',
  });

  const rows = [
    factRow('proposes', t('snapshot_proposes'), snapshot.most_proposed, (f) =>
      t('count_initiatives', { n: f.value }),
    ),
    factRow('aye', t('snapshot_yes'), snapshot.most_aye, (f) =>
      t('share_ayes', { pct: Math.round((f.share ?? 0) * 100) }),
    ),
    factRow('no', t('snapshot_no'), snapshot.most_no, (f) =>
      t('share_noes', { pct: Math.round((f.share ?? 0) * 100) }),
    ),
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
