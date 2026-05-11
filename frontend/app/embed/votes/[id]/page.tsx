import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';

/**
 * Embed widget for media outlets.
 *
 * A media outlet pastes this URL into an iframe in their CMS:
 *   <iframe src="https://monitor.example.org/embed/votes/123"
 *           width="100%" height="320" frameborder="0"></iframe>
 *
 * Strict rules (see CLAUDE.md):
 * - Sub-1s render. CSS inline. No third-party scripts or trackers.
 * - Only factual data.
 * - Attribution and link back to the source.
 * - Accessible: contrast WCAG AA, semantic HTML.
 */
export default async function EmbedVotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('embed_vote');
  const locale = await getLocale();
  let vote;
  try {
    vote = await api.votes.get(Number(id));
  } catch {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>{t('not_found')}</div>;
  }

  const resultStyles: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: '#DCFCE7', fg: '#14532D', label: t('result_approved') },
    rejected: { bg: '#FEE2E2', fg: '#7F1D1D', label: t('result_rejected') },
    tie: { bg: '#FEF3C7', fg: '#78350F', label: t('result_tie') },
  };
  const result = resultStyles[vote.result] ?? resultStyles.approved!;

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
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                {new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'long' })}
              </p>
              <h1 style={{ margin: '4px 0 0', fontSize: 18, lineHeight: 1.3 }}>
                {vote.title}
              </h1>
            </div>
            <span
              style={{
                background: result.bg,
                color: result.fg,
                fontWeight: 700,
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {result.label.toUpperCase()}
            </span>
          </header>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              margin: 0,
              padding: '12px 0',
              borderTop: '1px solid #E2E8F0',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <Stat label={t('label_aye')} value={vote.ayes} />
            <Stat label={t('label_no')} value={vote.noes} />
            <Stat label={t('label_abst')} value={vote.abstentions} />
            <Stat label={t('label_absent')} value={vote.absent} />
          </dl>

          <footer
            style={{
              marginTop: 12,
              fontSize: 12,
              color: '#64748B',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <a
              href={`/votes/${vote.id}`}
              target="_top"
              style={{ color: '#1E40AF', textDecoration: 'none' }}
            >
              {t('see_detail')}
            </a>
            <span>
              {t('source_label')}{' '}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                target="_top"
                style={{ color: '#64748B', textDecoration: 'underline' }}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{label}</dt>
      <dd style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{value}</dd>
    </div>
  );
}
