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
      icon: <Gamepad2 size={24} strokeWidth={1.8} aria-hidden="true" />,
      title: t('joc_title'),
      sub: t('joc_sub'),
      color: '#7F77DD',
    },
    {
      href: '/com-et-representen' as Route,
      icon: <Scale size={24} strokeWidth={1.8} aria-hidden="true" />,
      title: t('align_title'),
      sub: t('align_sub'),
      color: '#1D9E75',
    },
    {
      href: '/el-teu-diputat' as Route,
      icon: <MapPin size={24} strokeWidth={1.8} aria-hidden="true" />,
      title: t('deputy_title'),
      sub: t('deputy_sub'),
      color: '#EF9F27',
    },
    {
      href: '/mapa' as Route,
      icon: <MapIcon size={24} strokeWidth={1.8} aria-hidden="true" />,
      title: t('map_title'),
      sub: t('map_sub'),
      color: '#378ADD',
    },
  ];

  return (
    <section style={{ paddingTop: 20, paddingBottom: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="focal-card"
            style={{
              display: 'block',
              padding: '18px 18px 16px',
              borderRadius: 14,
              background: 'var(--paper-2)',
              border: '1px solid var(--rule)',
              borderTop: `3px solid ${c.color}`,
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
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `color-mix(in srgb, ${c.color} 16%, var(--paper))`,
                color: c.color,
                marginBottom: 12,
              }}
            >
              {c.icon}
            </span>
            <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              {c.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.45 }}>
              {c.sub}
            </div>
          </Link>
        ))}
      </div>
      <style>{`.focal-card:hover, .focal-card:focus-visible { border-color: var(--rule-strong); outline: none; }`}</style>
    </section>
  );
}
