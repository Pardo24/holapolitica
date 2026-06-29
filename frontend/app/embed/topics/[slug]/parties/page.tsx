import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, type GroupVoteStat, type Topic } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Embed widget: who votes IN FAVOUR and AGAINST on a topic.
 *
 *   <iframe src="https://holapolitica.org/embed/topics/habitatge/parties"
 *           width="100%" height="420" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * The inverse view of the group snapshot: pick a topic, see every
 * parliamentary group ranked by how often it votes Sí vs No on that
 * topic. Each row is a diverging aye/no bar; the list is ordered by
 * the share in favour (most-favourable on top, most-opposed at the
 * bottom) so "who's for and who's against" reads top-to-bottom.
 *
 * Same embed contract as the rest of /embed/* — sub-1s render, inline
 * styles, no JS, factual only, attribution + canonical link back.
 */
export default async function EmbedTopicPartiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('embed_topic_parties');
  const locale = await getLocale();

  let topic: Topic;
  let stats: GroupVoteStat[];
  try {
    topic = await api.topics.get(slug);
    stats = await api.topics.groupStats(slug);
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

  const name =
    (locale === 'es' ? topic.name_es : locale === 'en' ? topic.name_en : topic.name_ca) ||
    topic.name_ca;
  const color = topic.color_hex ?? 'var(--ink)';

  // Only groups that actually voted Sí or No carry a for/against signal.
  // Rank by share in favour: most-favourable first, most-opposed last.
  const rows = stats
    .map((s) => ({ ...s, decided: s.ayes + s.noes }))
    .filter((s) => s.decided > 0)
    .sort((a, b) => b.ayes / b.decided - a.ayes / a.decided || b.decided - a.decided);

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${color}`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: color,
            flex: 'none',
            display: 'inline-block',
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--ink-3)',
              fontWeight: 700,
            }}
          >
            {t('eyebrow')}
          </p>
          <h1
            className="serif"
            style={{
              margin: '2px 0 0',
              fontSize: 16,
              lineHeight: 1.2,
              fontWeight: 700,
              color: 'var(--ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </h1>
        </div>
        <span
          style={{
            display: 'inline-flex',
            gap: 10,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: 'var(--aye)' }}>{t('aye_label')}</span>
          <span style={{ color: 'var(--no)' }}>{t('no_label')}</span>
        </span>
      </header>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0' }}>{t('no_data')}</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
          }}
        >
          {rows.map((row) => {
            const ayePct = Math.round((row.ayes / row.decided) * 100);
            return (
              <li
                key={row.group_slug}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: 96,
                    flex: 'none',
                    minWidth: 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: row.group_color_hex ?? 'var(--ink-3)',
                      flex: 'none',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayGroupShort(row.group_name_short)}
                  </span>
                </span>
                <span
                  role="img"
                  aria-label={`${ayePct}% ${t('aye_label')} (${row.ayes} ${t('aye_label')}, ${row.noes} ${t('no_label')})`}
                  style={{
                    display: 'flex',
                    flex: 1,
                    height: 9,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'var(--rule)',
                  }}
                >
                  <span
                    style={{
                      width: `${(row.ayes / row.decided) * 100}%`,
                      background: 'var(--aye)',
                    }}
                  />
                  <span
                    style={{
                      width: `${(row.noes / row.decided) * 100}%`,
                      background: 'var(--no)',
                    }}
                  />
                </span>
                <span
                  className="tabular"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink-3)',
                    width: 36,
                    textAlign: 'right',
                    flex: 'none',
                  }}
                >
                  {ayePct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}

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
          href={`/topics/${topic.slug}`}
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
