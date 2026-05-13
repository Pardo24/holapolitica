import { getLocale, getTranslations } from 'next-intl/server';

import { api, type Topic, type TopicGlobalStat } from '@/lib/api';

/**
 * Embed widget for a topic / SDG.
 *
 *   <iframe src="https://holapolitica.org/embed/topics/habitatge"
 *           width="100%" height="220" frameborder="0"></iframe>
 *
 * Same rules as `/embed/votes/[id]` — see CLAUDE.md.
 *
 * The widget surfaces only the factual breakdown of initiatives that
 * touch this topic (total / approved / rejected / in debate / other).
 * Citizens and journalists can drop it next to an article that quotes
 * a single law and contextualize it against the topic as a whole.
 */
export default async function EmbedTopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('embed_topic');
  const locale = await getLocale();

  let topic: Topic | undefined;
  let stat: TopicGlobalStat | null = null;
  try {
    topic = await api.topics.get(slug);
    const all = await api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]);
    stat = all.find((s) => s.topic_slug === slug) ?? null;
  } catch {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>{t('not_found')}</div>;
  }

  const name =
    (locale === 'es' ? topic.name_es : locale === 'en' ? topic.name_en : topic.name_ca) ||
    topic.name_ca;
  const color = topic.color_hex ?? '#0F172A';
  const kindLabel = topic.kind === 'sdg' ? t('kind_sdg') : t('kind_theme');

  const total = stat?.initiatives_total ?? 0;
  const approved = stat?.initiatives_approved ?? 0;
  const rejected = stat?.initiatives_rejected ?? 0;
  const inDebate = stat?.initiatives_in_debate ?? 0;
  const other = stat?.initiatives_other ?? 0;

  return (
    <html lang={locale}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{t('embed_title')}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 16,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'transparent',
          color: '#0F172A',
        }}
      >
        <article
          style={{
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: 16,
            background: 'white',
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: 10,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
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
                  letterSpacing: '0.08em',
                  color: '#64748B',
                  fontWeight: 600,
                }}
              >
                {kindLabel}
              </p>
              <h1
                style={{
                  margin: '2px 0 0',
                  fontSize: 17,
                  lineHeight: 1.2,
                  fontWeight: 700,
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
                background: `${color}1A`,
                color: '#0F172A',
                fontWeight: 700,
                fontSize: 14,
                padding: '6px 12px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {total}
            </span>
          </header>

          <SegBar
            segments={[
              { n: approved, color: '#16A34A', label: t('label_approved') },
              { n: rejected, color: '#DC2626', label: t('label_rejected') },
              { n: inDebate, color: '#CA8A04', label: t('label_in_debate') },
              { n: other, color: '#CBD5E1', label: t('label_other') },
            ]}
          />

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              margin: 0,
              padding: '10px 0',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <Cell n={approved} color="#16A34A" label={t('label_approved')} />
            <Cell n={rejected} color="#DC2626" label={t('label_rejected')} />
            <Cell n={inDebate} color="#CA8A04" label={t('label_in_debate')} />
            <Cell n={other} color="#94A3B8" label={t('label_other')} />
          </dl>

          <footer
            style={{
              marginTop: 10,
              fontSize: 11,
              color: '#64748B',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <a
              href={`/topics/${topic.slug}`}
              target="_top"
              style={{ color: '#1E40AF', textDecoration: 'none', fontWeight: 600 }}
            >
              {t('see_detail')}
            </a>
            <span>
              {t('source_label')}{' '}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                target="_top"
                style={{ color: '#0F172A', textDecoration: 'underline', fontWeight: 600 }}
              >
                Hola Política
              </a>
            </span>
          </footer>
        </article>
      </body>
    </html>
  );
}

function Cell({ n, color, label }: { n: number; color: string; label: string }) {
  return (
    <div>
      <dt style={{ fontSize: 10, color: '#64748B', margin: 0 }}>{label}</dt>
      <dd style={{ fontSize: 20, fontWeight: 600, margin: 0, color }}>{n}</dd>
    </div>
  );
}

function SegBar({
  segments,
}: {
  segments: { n: number; color: string; label: string }[];
}) {
  const total = segments.reduce((acc, s) => acc + s.n, 0);
  if (total === 0) return null;
  return (
    <div
      role="img"
      aria-label={segments
        .filter((s) => s.n > 0)
        .map((s) => `${s.label}: ${s.n}`)
        .join(', ')}
      style={{
        display: 'flex',
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
        background: '#F1F5F9',
        margin: '4px 0 10px',
      }}
    >
      {segments.map((s) =>
        s.n > 0 ? (
          <span
            key={s.label}
            title={`${s.label}: ${s.n}`}
            style={{
              width: `${(s.n / total) * 100}%`,
              background: s.color,
              height: '100%',
              display: 'block',
            }}
          />
        ) : null,
      )}
    </div>
  );
}
