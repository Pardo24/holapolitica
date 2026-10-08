import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Hola Política · què vota el Congrés';

/**
 * The link preview of the site: what a shared holapolitica.org looks like
 * in a chat or a feed. Brand and promise on the left, the sections in their
 * colours, and on the right a law card drawn as an illustration (shapes,
 * not figures: a preview must never show a vote that didn't happen).
 */
const SECTIONS: { key: string; color: string }[] = [
  { key: 'og_sec_lleis', color: '#3D4FD1' },
  { key: 'og_sec_plens', color: '#D9692A' },
  { key: 'og_sec_diputats', color: '#13998A' },
  { key: 'og_sec_dades', color: '#C4920E' },
  { key: 'og_sec_jocs', color: '#D6457F' },
];
const PARTY_DOTS = ['#1E88E5', '#E53935', '#43A047', '#8E24AA', '#00ACC1', '#FB8C00', '#7CB342', '#00897B'];

/** Inter from Google Fonts as TTF (what the image renderer reads), or
 *  nothing: the preview still renders, in the default face. */
async function inter(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function HomeOg() {
  const t = await getTranslations('og');
  const [bold, regular] = await Promise.all([inter(800), inter(500)]);
  const fonts = [
    ...(bold ? [{ name: 'Inter', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Inter', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: '56px 64px',
          fontFamily: fonts.length ? 'Inter' : 'sans-serif',
          color: '#fff',
          background: 'linear-gradient(135deg, #141A2B 0%, #1F2A5E 55%, #3D4FD1 100%)',
          position: 'relative',
        }}
      >
        {/* Soft rings, for depth. */}
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -140,
            width: 520,
            height: 520,
            borderRadius: 999,
            border: '70px solid rgba(255,255,255,0.05)',
            display: 'flex',
          }}
        />

        {/* Left: brand, promise, sections. */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 620, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: '3.5px solid #141A2B',
                  borderRadius: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '6px 4px 0',
                }}
              >
                <div style={{ height: 3.5, background: '#141A2B', marginBottom: 5, display: 'flex' }} />
                <div style={{ height: 3.5, background: '#141A2B', display: 'flex' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em' }}>Hola Política</span>
              <span style={{ fontSize: 18, fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>{t('motto')}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.03em' }}>
              {t('og_home_line_1')}
            </span>
            <span
              style={{
                fontSize: 70,
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: '-0.03em',
                color: '#FDBA74',
                marginTop: 4,
              }}
            >
              {t('og_home_line_2')}
            </span>
            <span style={{ fontSize: 25, lineHeight: 1.35, color: 'rgba(255,255,255,0.82)', marginTop: 22, maxWidth: 560 }}>
              {t('og_home_sub')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {SECTIONS.map((s) => (
              <span
                key={s.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.1)',
                  fontSize: 19,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: s.color, display: 'flex' }} />
                {t(s.key as 'og_sec_lleis')}
              </span>
            ))}
          </div>
        </div>

        {/* Right: a law card, as an illustration. */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: 390,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 28,
              background: '#fff',
              overflow: 'hidden',
              boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
              transform: 'rotate(-3deg)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 22px',
                background: '#DDF1E4',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: '#3D4FD1', display: 'flex' }} />
                <span style={{ width: 110, height: 12, borderRadius: 6, background: '#9AA6B8', display: 'flex' }} />
              </span>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.08em', color: '#1B6B3A' }}>
                {t('og_card_approved')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 22px 24px', gap: 12 }}>
              <span style={{ height: 20, width: '92%', borderRadius: 8, background: '#141A2B', display: 'flex' }} />
              <span style={{ height: 20, width: '64%', borderRadius: 8, background: '#141A2B', display: 'flex' }} />
              <span style={{ height: 11, width: '96%', borderRadius: 6, background: '#C9D0DC', display: 'flex', marginTop: 6 }} />
              <span style={{ height: 11, width: '80%', borderRadius: 6, background: '#C9D0DC', display: 'flex' }} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  marginTop: 8,
                  padding: '16px 16px',
                  borderRadius: 16,
                  background: '#F3F4F7',
                }}
              >
                <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden' }}>
                  <span style={{ width: '64%', background: '#2E9E5B', display: 'flex' }} />
                  <span style={{ width: '6%', background: '#D7A93B', display: 'flex' }} />
                  <span style={{ width: '30%', background: '#D2453B', display: 'flex' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PARTY_DOTS.map((c) => (
                    <span key={c} style={{ width: 30, height: 30, borderRadius: 9, background: c, display: 'flex' }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <span
          style={{
            position: 'absolute',
            right: 64,
            bottom: 34,
            fontSize: 20,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          holapolitica.org
        </span>
      </div>
    ),
    { ...size, fonts },
  );
}
