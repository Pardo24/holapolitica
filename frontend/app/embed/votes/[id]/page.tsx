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
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
                {new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'long' })}
                {vote.expediente_raw ? ` · ${vote.expediente_raw}` : ''}
              </p>
              <h1
                style={{
                  margin: '4px 0 0',
                  fontSize: 18,
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {vote.description?.trim() || vote.title}
              </h1>
              {(vote.proposed_by_government || vote.proposing_group_short) && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 11,
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>{t('proposed_by_label')}</span>
                  {vote.proposed_by_government && !vote.proposing_group_short ? (
                    <strong style={{ color: '#0F172A' }}>{t('proposed_government')}</strong>
                  ) : vote.proposing_group_short ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '1px 8px',
                        borderRadius: 999,
                        background: vote.proposing_group_color
                          ? `${vote.proposing_group_color}1A`
                          : '#F1F5F9',
                        color: '#0F172A',
                        fontWeight: 600,
                      }}
                    >
                      {vote.proposing_group_color && (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: vote.proposing_group_color,
                            display: 'inline-block',
                          }}
                        />
                      )}
                      {vote.proposing_group_short}
                    </span>
                  ) : null}
                </p>
              )}
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
                flex: 'none',
              }}
            >
              {result.label.toUpperCase()}
            </span>
          </header>

          <StackedBar
            ayes={vote.ayes}
            noes={vote.noes}
            abstentions={vote.abstentions}
            absent={vote.absent}
          />

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              margin: 0,
              padding: '10px 0',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <Stat label={t('label_aye')} value={vote.ayes} color="#16A34A" />
            <Stat label={t('label_no')} value={vote.noes} color="#DC2626" />
            <Stat label={t('label_abst')} value={vote.abstentions} color="#CA8A04" />
            <Stat label={t('label_absent')} value={vote.absent} color="#94A3B8" />
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
              href={`/votes/${vote.id}`}
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
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{label}</dt>
      <dd style={{ fontSize: 20, fontWeight: 600, margin: 0, color }}>{value}</dd>
    </div>
  );
}

/**
 * Inline stacked bar — used inside the embed widget. Inlined here
 * (rather than importing the canonical StackedBar component) because
 * the embed is rendered as a standalone HTML document and pulling in
 * the global CSS for ``.bar`` would defeat the sub-1s budget. The
 * fragment is purely inline-styled so it works in any iframe host.
 */
function StackedBar({
  ayes,
  noes,
  abstentions,
  absent,
}: {
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
}) {
  const total = ayes + noes + abstentions + absent;
  if (total === 0) return null;
  const segs: { n: number; color: string; label: string }[] = [
    { n: ayes, color: '#16A34A', label: 'Sí' },
    { n: noes, color: '#DC2626', label: 'No' },
    { n: abstentions, color: '#CA8A04', label: 'Abstenció' },
    { n: absent, color: '#CBD5E1', label: 'Absent' },
  ];
  return (
    <div
      role="img"
      aria-label={segs
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
      {segs.map((s) =>
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
