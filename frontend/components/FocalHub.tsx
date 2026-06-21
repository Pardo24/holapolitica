import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { Gamepad2, Map as MapIcon, MapPin, Scale } from 'lucide-react';

/**
 * The home's visual front door — four big cards for the things we want people
 * to do, game-first. Surfaces the focal experiences (incl. "Què votaries tu?",
 * the alignment game) above the data, so the homepage reads as an invitation,
 * not a list.
 */
export async function FocalHub() {
  const t = await getTranslations('hub');

  const cards: {
    href: Route;
    icon: React.ReactNode;
    title: string;
    sub: string;
    color: string;
  }[] = [
    {
      href: '/joc' as Route,
      icon: <Gamepad2 size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: t('joc_title'),
      sub: t('joc_sub'),
      color: '#7F77DD',
    },
    {
      href: '/com-et-representen' as Route,
      icon: <Scale size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: t('align_title'),
      sub: t('align_sub'),
      color: '#1D9E75',
    },
    {
      href: '/el-teu-diputat' as Route,
      icon: <MapPin size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: t('deputy_title'),
      sub: t('deputy_sub'),
      color: '#EF9F27',
    },
    {
      href: '/mapa' as Route,
      icon: <MapIcon size={19} strokeWidth={1.8} aria-hidden="true" />,
      title: t('map_title'),
      sub: t('map_sub'),
      color: '#378ADD',
    },
  ];

  // Desktop-only (`hidden sm:block`): on mobile these surfaces live in the
  // dashboard tile grid instead, so the hub here would duplicate them. The
  // styling is deliberately quiet — a compact row of links with a small
  // colored glyph, not big marketing cards — so it reads as a calm menu
  // above the editorial home, not a landing page.
  return (
    <section className="hidden sm:block" style={{ paddingTop: 16, paddingBottom: 4 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="focal-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 10,
              background: 'var(--paper)',
              border: '1px solid var(--rule)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `color-mix(in srgb, ${c.color} 12%, var(--paper))`,
                color: c.color,
                flex: 'none',
              }}
            >
              {c.icon}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                className="serif"
                style={{
                  display: 'block',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  lineHeight: 1.2,
                }}
              >
                {c.title}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  marginTop: 1,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.sub}
              </span>
            </span>
          </Link>
        ))}
      </div>
      <style>{`.focal-card:hover, .focal-card:focus-visible { border-color: var(--rule-strong); background: var(--paper-2); outline: none; }`}</style>
    </section>
  );
}
