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
            gap: 44,
            paddingTop: 30,
            paddingBottom: 30,
          }}
        >
          {/* Accent tile carries real information: the SDG number for an
              SDG topic, otherwise the count of classified initiatives —
              never a placeholder dot. The "·" fallback only appears if
              the count is genuinely zero. */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 28,
              background: accent,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              fontFamily: 'sans-serif',
              padding: '0 12px',
            }}
          >
            <span
              style={{
                fontSize: isSdg ? 88 : 96,
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}
            >
              {isSdg ? sdgNumber || '·' : initiativeCount}
            </span>
            {!isSdg && (
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  opacity: 0.85,
                  marginTop: 8,
                }}
              >
                {t('topic_count_label')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <span
              style={{
                fontSize: 60,
                fontWeight: 600,
                color: '#1a2138',
                letterSpacing: '-0.015em',
                fontFamily: 'serif',
                lineHeight: 1.05,
              }}
            >
              {topic.name_ca}
            </span>
            <span
              style={{
                fontSize: 22,
                color: '#3f4c66',
                lineHeight: 1.35,
              }}
            >
              {topic.description_ca?.slice(0, 150) ?? ''}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 30,
            paddingTop: 18,
            borderTop: '1px solid #d2cdbc',
            fontSize: 16,
            color: '#3f4c66',
          }}
        >
          <span>{t('topic_footer')}</span>
          <span style={{ fontWeight: 600 }}>holapolitica.org ↗</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
