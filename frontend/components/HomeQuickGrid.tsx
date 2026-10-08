import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarDays, Gamepad2, Map as MapIcon, Scale, Sparkles, Users, type LucideIcon } from 'lucide-react';

/**
 * The home's first screen: what you can do here, as six tiles.
 *
 * Plenty of people open the app for one thing (the game, the map, their
 * deputies) and the home used to make them scroll past the news to find
 * it. The tiles come first; the latest plenary and the content follow.
 *
 * Two of the tiles know a little about the reader, with nothing stored on
 * our side: the deputies tile names the province picked last time (the
 * same cookie the deputies tab uses), the plenary tile the next sitting.
 *
 * Neutral by construction: every tile is a place, none is a pick of ours.
 * "Laws that matter" scrolls to the everyday-topics block lower down.
 */
export async function HomeQuickGrid({
  province,
  nextSession,
  locale,
}: {
  /** The reader's remembered province (cookie), if any. */
  province: string | null;
  /** YYYY-MM-DD of the next convened sitting, if any. */
  nextSession: string | null;
  locale: string;
}) {
  const t = await getTranslations('home_grid');

  const tiles: { href: string; Icon: LucideIcon; hue: string; title: string; sub: string }[] = [
    {
      href: '/jocs',
      Icon: Gamepad2,
      hue: '#6E4F8E',
      title: t('play_title'),
      sub: t('play_sub'),
    },
    {
      href: '/com-et-representen',
      Icon: Sparkles,
      hue: '#2F807A',
      title: t('align_title'),
      sub: t('align_sub'),
    },
    {
      href: '/el-teu-diputat',
      Icon: Users,
      hue: 'var(--hue-partits)',
      title: t('deputies_title'),
      sub: province ?? t('deputies_sub'),
    },
    {
      href: '/mapa',
      Icon: MapIcon,
      hue: '#475189',
      title: t('map_title'),
      sub: t('map_sub'),
    },
    {
      href: '/avui',
      Icon: CalendarDays,
      hue: 'var(--hue-plens)',
      title: t('plens_title'),
      sub: nextSession
        ? t('plens_next', {
            date: new Date(`${nextSession}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
          })
        : t('plens_sub'),
    },
    {
      href: '#lleis-que-importen',
      Icon: Scale,
      hue: 'var(--hue-lleis)',
      title: t('laws_title'),
      sub: t('laws_sub'),
    },
  ];

  return (
    <nav className="home-grid" aria-label={t('aria')}>
      {tiles.map(({ href, Icon, hue, title, sub }) => (
        <Link key={href} href={href as Route} className="home-grid__tile" style={{ ['--tile' as string]: hue }}>
          <span className="home-grid__icon" aria-hidden="true">
            <Icon size={19} strokeWidth={1.9} />
          </span>
          <span className="home-grid__title">{title}</span>
          <span className="home-grid__sub">{sub}</span>
        </Link>
      ))}
    </nav>
  );
}
