import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { api, ApiError, type ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupFullName } from '@/lib/groups';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Grup parlamentari al Congrés';

export default async function GroupOg({
  params,
}: {
  params: { slug: string };
}) {
  const t = await getTranslations('og');

  let group: ParliamentaryGroupSummary | null = null;
  try {
    group = await api.groups.get(params.slug);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }

  if (!group) {
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

  const fullName = displayGroupFullName(group.slug, group.name_long);
  const fullNameShort = fullName.length > 60 ? fullName.slice(0, 57) + '…' : fullName;
  const accent = group.color_hex ?? '#1a2138';
  // Use the first two letters of the short name as the badge text.
  const initials = group.name_short.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 4).toUpperCase();

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
            Grup parlamentari
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
          {/* Group badge — big circle with initials, accent colour */}
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: 999,
              background: accent,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: initials.length > 3 ? 48 : 64,
              fontWeight: 800,
              letterSpacing: '0.02em',
              flex: 'none',
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <span
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: '#1a2138',
                letterSpacing: '-0.015em',
                fontFamily: 'serif',
                lineHeight: 1.1,
              }}
            >
              {group.name_short}
            </span>
            <span
              style={{
                fontSize: 20,
                color: '#3f4c66',
                lineHeight: 1.3,
              }}
            >
              {fullNameShort}
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
              Diputats actius
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
              {group.members_active}
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
