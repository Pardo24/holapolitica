import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';

/**
 * Embed widget for a parliamentary group.
 *
 *   <iframe src="https://holapolitica.org/embed/groups/sumar"
 *           width="100%" height="220" frameborder="0"></iframe>
 *
 * Same rules as `/embed/votes/[id]` — see CLAUDE.md:
 *   sub-1s render, inline CSS, no third-party scripts, factual only,
 *   attribution and link back. Metrics are hardcoded to legislature 1
 *   (XV) for now; the widget is meant for Spanish national coverage
 *   and we'll re-evaluate when phase 2 (autonomies) lands.
 */
export default async function EmbedGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('embed_group');
  const locale = await getLocale();

  let group;
  let summary = null as Awaited<ReturnType<typeof api.metrics.groupSummary>>[number] | null;
  try {
    group = await api.groups.get(slug);
    const all = await api.metrics.groupSummary(1).catch(() => []);
    summary = all.find((r) => r.group_slug === slug) ?? null;
  } catch {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>{t('not_found')}</div>;
  }

  const cohesion = summary?.avg_cohesion;
  const attendance = summary?.avg_attendance;
  const color = group.color_hex ?? '#0F172A';

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
              marginBottom: 14,
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: 10,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: color,
                flex: 'none',
                display: 'inline-block',
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 16,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {group.name_long}
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>
                {group.name_short}
              </p>
            </div>
            <span
              style={{
                background: `${color}1A`,
                color: '#0F172A',
                fontWeight: 700,
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {group.members_active} {t('label_members').toLowerCase()}
            </span>
          </header>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              margin: 0,
              padding: '4px 0 10px',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <Stat
              label={t('label_cohesion')}
              value={cohesion != null ? `${Math.round(cohesion * 100)}%` : '—'}
              hint={
                summary && summary.cohesion_votes_counted > 0
                  ? `${summary.cohesion_votes_counted} ${t('label_votes_counted')}`
                  : null
              }
              color="#1E40AF"
            />
            <Stat
              label={t('label_attendance')}
              value={attendance != null ? `${Math.round(attendance * 100)}%` : '—'}
              hint={null}
              color="#0E7490"
            />
          </dl>

          <p style={{ margin: '8px 0 0', fontSize: 10, color: '#94A3B8', lineHeight: 1.4 }}>
            {t('caveat')}
          </p>

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
              href={`/groups/${group.slug}`}
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

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string | null;
  color: string;
}) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{label}</dt>
      <dd
        style={{
          fontSize: 26,
          fontWeight: 600,
          margin: 0,
          color,
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </dd>
      {hint && (
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8' }}>{hint}</p>
      )}
    </div>
  );
}
