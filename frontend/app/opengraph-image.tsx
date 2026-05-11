import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Hola Política · què vota el Congrés';

export default async function HomeOg() {
  const t = await getTranslations('og');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fbf9f4',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 70px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            paddingBottom: 18,
            borderBottom: '2px solid #1a2138',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '2.5px solid #1a2138',
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0 0',
            }}
          >
            <div style={{ height: 2.5, background: '#1a2138', marginBottom: 5 }} />
            <div style={{ height: 2.5, background: '#1a2138' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#1a2138' }}>
              Hola Política
            </span>
            <span style={{ fontSize: 14, color: '#3f4c66', fontStyle: 'italic' }}>
              {t('motto')}
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            {t('home_eyebrow')}
          </span>
          <span
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#1a2138',
              letterSpacing: '-0.02em',
              fontFamily: 'serif',
              lineHeight: 1.0,
              maxWidth: 1000,
            }}
          >
            {t('home_title_line_1')}
          </span>
          <span
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#1e40af',
              letterSpacing: '-0.02em',
              fontFamily: 'serif',
              lineHeight: 1.0,
              marginTop: 10,
            }}
          >
            {t('home_title_line_2')}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 16,
            color: '#3f4c66',
            paddingTop: 18,
            borderTop: '1px solid #d2cdbc',
          }}
        >
          <span>{t('home_footer')}</span>
          <span style={{ fontWeight: 600 }}>monitor-parlamentari ↗</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
