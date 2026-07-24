import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarDays, Gamepad2, Scale } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';

/**
 * "Jocs" — the games hub. A single menu for every playful way into the
 * data: the daily question, the Trivia duel, the alignment game.
 *
 * Presented as a modern tile grid rather than a stacked list: each game
 * is a tall card carrying a big tinted icon disc, its own brand hue as a
 * top rail and a soft wash, so the hub reads as a set of distinct
 * "things to play" at a glance. All layout-critical styles are inline
 * (the party-card lesson) so an interfering extension or a stale
 * stylesheet can't collapse the grid.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('jocs');
  return { title: `${t('title')} · Hola Política`, description: t('subtitle') };
}

export default async function JocsPage() {
  const t = await getTranslations('jocs');
  const tHub = await getTranslations('hub');
  const tDaily = await getTranslations('daily');

  const cards: {
    href: Route;
    icon: React.ReactNode;
    title: string;
    sub: string;
    color: string;
  }[] = [
    {
      href: '/pregunta-del-dia' as Route,
      icon: <CalendarDays size={26} strokeWidth={1.8} aria-hidden="true" />,
      title: tDaily('page_title'),
      sub: t('daily_sub'),
      color: '#C7862B',
    },
    {
      href: '/joc' as Route,
      icon: <Gamepad2 size={26} strokeWidth={1.8} aria-hidden="true" />,
      title: tHub('joc_title'),
      sub: tHub('joc_sub'),
      color: '#6E4F8E',
    },
    {
      href: '/com-et-representen' as Route,
      icon: <Scale size={26} strokeWidth={1.8} aria-hidden="true" />,
      title: tHub('align_title'),
      sub: tHub('align_sub'),
      color: '#2F807A',
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
      <ul
        className="jocs-grid"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '20px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridAutoRows: '1fr',
          gap: 12,
        }}
      >
        {cards.map((c) => (
          <li key={c.href} style={{ minWidth: 0, display: 'flex' }}>
            <Link
              href={c.href}
              className="jocs-card"
              style={{
                ['--game' as string]: c.color,
                position: 'relative',
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '20px 16px 18px',
                minHeight: 168,
                borderRadius: 16,
                border: '1px solid var(--rule)',
                background: `color-mix(in oklch, ${c.color} 7%, var(--paper))`,
                color: 'inherit',
                textDecoration: 'none',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-2)',
              }}
            >
              {/* Brand-hue top rail. */}
              <span
                aria-hidden="true"
                style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: c.color }}
              />
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 52,
                  height: 52,
                  flex: 'none',
                  borderRadius: 14,
                  background: `color-mix(in oklch, ${c.color} 16%, var(--paper))`,
                  color: c.color,
                }}
              >
                {c.icon}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  className="serif"
                  style={{
                    display: 'block',
                    fontSize: 17,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    lineHeight: 1.2,
                    letterSpacing: '-0.01em',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {c.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    color: 'var(--ink-2)',
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {c.sub}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <style>{`
        .jocs-card { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
        .jocs-card:hover, .jocs-card:focus-visible {
          transform: translateY(-2px);
          box-shadow: var(--shadow-3);
          border-color: color-mix(in oklch, var(--game) 55%, var(--rule));
          outline: none;
        }
        /* An odd number of games leaves the last card alone on its row;
           let it span both columns so the grid never looks broken. */
        .jocs-grid > li:last-child:nth-child(odd) { grid-column: 1 / -1; }
        @media (prefers-reduced-motion: reduce) {
          .jocs-card { transition: none; }
          .jocs-card:hover, .jocs-card:focus-visible { transform: none; }
        }
      `}</style>
    </div>
  );
}
