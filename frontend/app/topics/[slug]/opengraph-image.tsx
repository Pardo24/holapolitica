import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { api, ApiError, type Topic } from '@/lib/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tema parlamentari';

export default async function TopicOg({
  params,
}: {
  params: { slug: string };
}) {
  const t = await getTranslations('og');

  let topic: Topic | null = null;
  let initiativeCount = 0;
  try {
    topic = await api.topics.get(params.slug);
    const globals = await api.stats.topicsGlobal().catch(() => []);
    initiativeCount =
      globals.find((g) => g.topic_slug === params.slug)?.initiatives_total ?? 0;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }

  if (!topic) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#fbf9f4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a2138',
            fontSize: 48,
            fontWeight: 600,
          }}
        >
          Hola Política
        </div>
      ),
      { ...size },
    );
  }

  const accent = topic.color_hex ?? '#1a2138';
  const isSdg = topic.kind === 'sdg';
  const sdgNumber = isSdg ? topic.slug.match(/^sdg-(\d{2})/)?.[1] ?? '' : '';

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
            justifyContent: 'space-between',
            paddingBottom: 18,
            borderBottom: '2px solid #1a2138',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: '2.5px solid #1a2138',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
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
              fontSize: 13,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            {isSdg ? `ODS ${sdgNumber}` : 'Tema'}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 40,
            paddingTop: 30,
            paddingBottom: 30,
          }}
        >
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 24,
              background: accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 80,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              flex: 'none',
              fontFamily: 'sans-serif',
            }}
          >
            {sdgNumber || '·'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <span
              style={{
                fontSize: 56,
                fontWeight: 600,
                color: '#1a2138',
                letterSpacing: '-0.015em',
                fontFamily: 'serif',
                lineHeight: 1.1,
              }}
            >
              {topic.name_ca}
            </span>
            <span
              style={{
                fontSize: 20,
                color: '#3f4c66',
                lineHeight: 1.3,
              }}
            >
              {topic.description_ca?.slice(0, 140) ?? ''}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 30,
            paddingTop: 18,
            borderTop: '1px solid #d2cdbc',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                color: '#3f4c66',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Iniciatives classificades
            </span>
            <span
              style={{
                fontSize: 60,
                fontWeight: 700,
                color: '#1a2138',
                letterSpacing: '-0.02em',
                fontFamily: 'monospace',
              }}
            >
              {initiativeCount}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            holapolitica.org
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
