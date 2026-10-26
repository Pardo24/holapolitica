import type { ReactNode } from 'react';

/**
 * The frame of the site's share images (1200x630): paper background, the
 * brand and motto on top, a rule, the body, a footer line. Same look as the
 * law and vote images (app/initiatives/[id]/opengraph-image.tsx).
 *
 * The image renderer (Satori) only lays out blocks with ``display: flex``
 * when they have more than one child; every container here sets it.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const INK = '#1a2138';
export const INK_2 = '#3f4c66';
export const PAPER = '#fbf9f4';
export const RULE = '#d2cdbc';

export function OgFrame({
  motto,
  eyebrow,
  footer,
  children,
}: {
  motto: string;
  eyebrow: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: PAPER,
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
          borderBottom: `2px solid ${INK}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: INK }}>Hola Política</span>
          <span style={{ fontSize: 14, color: INK_2, fontStyle: 'italic' }}>{motto}</span>
        </div>
        <div style={{ display: 'flex', fontSize: 13, color: INK_2, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {eyebrow}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 18,
          borderTop: `1px solid ${RULE}`,
          fontSize: 15,
          color: INK_2,
        }}
      >
        <span>{footer}</span>
        <span style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontSize: 13 }}>holapolitica.org</span>
      </div>
    </div>
  );
}

export function ogLocale(raw: string | null): 'ca' | 'es' | 'en' {
  return raw === 'ca' || raw === 'en' ? raw : 'es';
}
