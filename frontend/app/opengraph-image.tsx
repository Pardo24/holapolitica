import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { MARK_DOT, MARK_RULE, markSeats } from '@/lib/brandMark';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Hola Política · què vota el Congrés';

/**
 * The link preview of the site: what a shared holapolitica.org looks like
 * in a chat or a feed. Same register as the site: newsprint paper, black
 * ink, a poster headline with its second line in reverse, and on the right
 * a page of the record with the clerk's stamp (shapes, not figures: a
 * preview must never show a vote that didn't happen).
 */
const INK = '#1c1c1a';
const INK_2 = '#4a4a46';
const PAPER = '#ecebe6';
const SHEET = '#f6f5f1';
const RULE = '#bdbcb6';
const AYE = '#2f7a4b';

/** A Google font as TTF (what the image renderer reads), or nothing: the
 *  preview still renders, in the default face. */
async function font(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function HomeOg() {
  const t = await getTranslations('og');
  const [poster, sans, mono] = await Promise.all([
    font('Anton', 400),
    font('Archivo', 500),
    font('IBM+Plex+Mono', 500),
  ]);
  const fonts = [
    ...(poster ? [{ name: 'Anton', data: poster, weight: 400 as const, style: 'normal' as const }] : []),
    ...(sans ? [{ name: 'Archivo', data: sans, weight: 500 as const, style: 'normal' as const }] : []),
    ...(mono ? [{ name: 'Plex', data: mono, weight: 500 as const, style: 'normal' as const }] : []),
  ];
  const posterFace = poster ? 'Anton' : 'sans-serif';
  const monoFace = mono ? 'Plex' : 'monospace';
  const lineStyle = {
    fontFamily: posterFace,
    fontSize: 96,
    lineHeight: 1,
    textTransform: 'uppercase' as const,
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: '52px 64px 44px',
          fontFamily: sans ? 'Archivo' : 'sans-serif',
          color: INK,
          background: PAPER,
          position: 'relative',
        }}
      >
        {/* Left: wordmark, poster headline, promise. */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 660, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                display: 'flex',
                fontFamily: posterFace,
                fontSize: 34,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                background: INK,
                color: PAPER,
                padding: '6px 14px 4px',
              }}
            >
              Hola Política
            </span>
            <span style={{ fontSize: 20, color: INK_2 }}>{t('motto')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={lineStyle}>{t('og_home_line_1')}</span>
            <span style={{ ...lineStyle, display: 'flex', background: INK, color: PAPER, padding: '6px 16px 0', marginTop: 10 }}>
              {t('og_home_line_2')}
            </span>
            <span style={{ fontSize: 25, lineHeight: 1.4, color: INK_2, marginTop: 28, maxWidth: 600 }}>
              {t('og_home_sub')}
            </span>
          </div>

          <span style={{ fontFamily: monoFace, fontSize: 19, letterSpacing: '0.08em', color: INK_2 }}>
            HOLAPOLITICA.ORG
          </span>
        </div>

        {/* Right: a page of the record, stamped. */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: 380,
              display: 'flex',
              flexDirection: 'column',
              background: SHEET,
              border: `2px solid ${INK}`,
              padding: '22px 24px 26px',
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: monoFace,
                fontSize: 15,
                color: INK_2,
                paddingBottom: 10,
                borderBottom: `2px solid ${INK}`,
              }}
            >
              <span>EXPT. 121/000000</span>
              <span>PLE</span>
            </div>
            <span style={{ height: 22, width: '94%', background: INK, display: 'flex', marginTop: 20 }} />
            <span style={{ height: 22, width: '66%', background: INK, display: 'flex', marginTop: 10 }} />
            <span style={{ height: 11, width: '96%', background: RULE, display: 'flex', marginTop: 20 }} />
            <span style={{ height: 11, width: '88%', background: RULE, display: 'flex', marginTop: 9 }} />
            <span style={{ height: 11, width: '72%', background: RULE, display: 'flex', marginTop: 9 }} />
            {/* The chamber, as on the site's mark. */}
            <div style={{ display: 'flex', marginTop: 18 }}>
              <svg width="120" height="80" viewBox="40 120 432 270">
                {markSeats().map((s, i) => (
                  <circle key={i} cx={s.x} cy={s.y} r={MARK_DOT} fill={INK} />
                ))}
                <rect {...MARK_RULE} fill={INK} />
              </svg>
            </div>
            <span
              style={{
                position: 'absolute',
                right: 22,
                bottom: 30,
                display: 'flex',
                transform: 'rotate(-8deg)',
                border: `4px solid ${AYE}`,
                color: AYE,
                fontFamily: monoFace,
                fontSize: 30,
                letterSpacing: '0.14em',
                padding: '6px 14px 4px',
              }}
            >
              {t('og_card_approved')}
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
