import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, CalendarDays, Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';

/**
 * "Jocs" — the games hub. A single menu for every playful way into the data:
 * the daily question, the Trivia duel, the alignment game, and the map. Each is
 * a card linking to its own experience (Trivia opens a solo/invite chooser).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('jocs');
  return { title: `${t('title')} · Hola Política`, description: t('subtitle') };
}

export default async function JocsPage() {
  const t = await getTranslations('jocs');
  const tHub = await getTranslations('hub');
  const tDaily = await getTranslations('daily');

  // Games only. "¿Qué votarías tú?" and "El Mapa" are analysis surfaces,
  // not games — the map now lives on the Diputados hub next to the
  // party-page gateway, per feedback ("en juegos solo queda jugar o
  // invitar a amigos").
  const cards: { href: Route; icon: React.ReactNode; title: string; sub: string; color: string }[] = [
    {
      href: '/pregunta-del-dia' as Route,
      icon: <CalendarDays size={22} strokeWidth={1.9} aria-hidden="true" />,
      title: tDaily('page_title'),
      sub: t('daily_sub'),
      color: '#EF9F27',
    },
    {
      href: '/joc' as Route,
      icon: <Gamepad2 size={22} strokeWidth={1.9} aria-hidden="true" />,
      title: tHub('joc_title'),
      sub: tHub('joc_sub'),
      color: '#7F77DD',
    },
  ];

  return (
    <div style={{ maxWidth: 620, marginInline: 'auto' }}>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Gamepad2 size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="jocs-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px',
              borderRadius: 14,
              border: '1px solid var(--rule-strong)',
              background: 'var(--paper-2)',
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
                flex: 'none',
                borderRadius: 12,
                background: `color-mix(in srgb, ${c.color} 15%, var(--paper))`,
                color: c.color,
              }}
            >
              {c.icon}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="serif" style={{ display: 'block', fontSize: 17, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25 }}>
                {c.title}
              </span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>
                {c.sub}
              </span>
            </span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
          </Link>
        ))}
      </div>
      <style>{`.jocs-card:hover, .jocs-card:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </div>
  );
}
