import { getLocale, getTranslations } from 'next-intl/server';

import { api, type PersonKPIs } from '@/lib/api';

/**
 * Embed widget for a member of parliament.
 *
 *   <iframe src="https://holapolitica.org/embed/persons/123"
 *           width="100%" height="220" frameborder="0"></iframe>
 *
 * Strict rules (CLAUDE.md): factual only, no editorial framing, no
 * trackers. We surface the same three KPIs as the public profile —
 * attendance %, dissidence %, total votes cast — and the current
 * group + constituency. For deputies holding an institutional role
 * (govern, mesa) we render a caveat explaining that attendance /
 * dissidence don't read like a regular MP's: they vote far less and
 * dissent much less by convention.
 */
export default async function EmbedPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  const t = await getTranslations('embed_person');
  const locale = await getLocale();

  if (!Number.isFinite(personId)) {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>{t('not_found')}</div>;
  }

  let person;
  let kpis: PersonKPIs | null = null;
  try {
    person = await api.persons.get(personId);
    kpis = await api.persons.kpis(personId).catch(() => null);
  } catch {
    return <div style={{ padding: 16, fontFamily: 'sans-serif' }}>{t('not_found')}</div>;
  }

  const groupColor = person.current_group_color ?? '#0F172A';
  const attendance = kpis?.attendance_pct;
  const dissidence = kpis?.dissidence_pct;
  const votesCast = kpis?.votes_cast ?? 0;

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
              paddingBottom: 12,
            }}
          >
            {person.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.photo_url}
                alt=""
                width={48}
                height={48}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  objectFit: 'cover',
                  border: `2px solid ${groupColor}`,
                  flex: 'none',
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: groupColor,
                  flex: 'none',
                  display: 'inline-block',
                }}
              />
            )}
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
                {person.full_name}
              </h1>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 11,
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                {person.current_group_short && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '1px 8px',
                      borderRadius: 999,
                      background: `${groupColor}1A`,
                      color: '#0F172A',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: groupColor,
                        display: 'inline-block',
                      }}
                    />
                    {person.current_group_short}
                  </span>
                )}
                {person.current_constituency && <span>· {person.current_constituency}</span>}
              </p>
            </div>
          </header>

          {kpis ? (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                margin: 0,
                padding: '4px 0 10px',
                borderBottom: '1px solid #E2E8F0',
              }}
            >
              <Cell
                label={t('label_attendance')}
                value={attendance != null ? `${Math.round(attendance * 100)}%` : '—'}
                color="#0E7490"
              />
              <Cell
                label={t('label_dissidence')}
                value={dissidence != null ? `${Math.round(dissidence * 100)}%` : '—'}
                color="#9333EA"
              />
              <Cell label={t('label_votes_total')} value={String(votesCast)} color="#0F172A" />
            </dl>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>
              {t('no_kpis')}
            </p>
          )}

          {person.role_kind && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 10,
                color: '#94A3B8',
                lineHeight: 1.4,
              }}
            >
              {t('caveat_role')}
            </p>
          )}

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
              href={`/persons/${person.id}`}
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

function Cell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <dt style={{ fontSize: 10, color: '#64748B', margin: 0 }}>{label}</dt>
      <dd
        style={{
          fontSize: 22,
          fontWeight: 600,
          margin: 0,
          color,
          letterSpacing: '-0.01em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
