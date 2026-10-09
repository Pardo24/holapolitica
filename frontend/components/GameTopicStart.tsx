import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, Shuffle } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Topic } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * The door to a game: what it is, what a round is like, and the subject
 * to play on, as big tiles. "Any subject" leads; the everyday themes come
 * first, then the rest. Every tile is a link straight into a round, so a
 * chosen subject is in the URL and can be shared.
 *
 * Shared by the Trivia and "how would you vote?", so both games open the
 * same way.
 */
const EVERYDAY_FIRST = [
  'habitatge',
  'drets-laborals',
  'sanitat',
  'educacio',
  'economia',
  'energia',
  'medi-ambient',
  'igualtat',
  'immigracio',
  'transport',
  'justicia',
  'seguretat',
  'tecnologia-drets',
];

export function GameTopicStart({
  hue,
  icon,
  title,
  hook,
  meta,
  pickLabel,
  anyTitle,
  anySub,
  topics,
  locale,
  hrefFor,
  children,
  before,
}: {
  /** The game's colour, a --hue-* token. */
  hue: string;
  icon: ReactNode;
  title: string;
  hook: string;
  meta: string[];
  pickLabel: string;
  anyTitle: string;
  anySub: string;
  topics: Topic[];
  locale: string;
  /** Where a tile leads: null = any subject. */
  hrefFor: (slug: string | null) => string;
  /** Anything after the topics. */
  children?: ReactNode;
  /** Anything between the hero and the topics (Trivia's solo / friends switch). */
  before?: ReactNode;
}) {
  const themes = topics.filter((tp) => tp.kind !== 'sdg');
  const rank = (slug: string) => {
    const i = EVERYDAY_FIRST.indexOf(slug);
    return i === -1 ? EVERYDAY_FIRST.length : i;
  };
  const ordered = [...themes].sort((a, b) => rank(a.slug) - rank(b.slug));

  return (
    <div className="gstart" style={{ ['--g' as string]: hue }}>
      <header className="gstart-hero">
        <span className="gstart-hero__icon" aria-hidden="true">
          {icon}
        </span>
        <h1 className="gstart-hero__title">{title}</h1>
        <p className="gstart-hero__hook">{hook}</p>
        <ul className="gstart-hero__meta">
          {meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </header>

      {before}
      <h2 className="gstart-pick">{pickLabel}</h2>
      <Link href={hrefFor(null) as Route} className="gstart-any">
        <span className="gstart-any__icon" aria-hidden="true">
          <Shuffle size={22} strokeWidth={2.2} />
        </span>
        <span className="gstart-any__text">
          <strong>{anyTitle}</strong>
          <span>{anySub}</span>
        </span>
        <ArrowRight size={20} strokeWidth={2.4} aria-hidden="true" />
      </Link>

      <ul className="gstart-topics">
        {ordered.map((tp) => {
          const Icon = topicIcon(tp.icon);
          return (
            <li key={tp.slug}>
              <Link
                href={hrefFor(tp.slug) as Route}
                className="gstart-topic"
                style={{ ['--t' as string]: tp.color_hex ?? 'var(--ink-3)' }}
              >
                <span className="gstart-topic__icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="gstart-topic__name">{pickTopicName(tp, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {children}
    </div>
  );
}
