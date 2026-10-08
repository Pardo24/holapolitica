import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ChevronDown } from 'lucide-react';

import type { Topic } from '@/lib/api';
import { CHANGE_PAIRS, changeTagIcon } from '@/lib/changeTags';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * "Laws that matter": a way in for someone who doesn't know where to
 * start, without us deciding which laws are important.
 *
 * Two doors. The subjects of everyday life, each opening the laws voted
 * on it, latest first. And what a law changes, in the symmetric pairs
 * read from each bill's own text (raises / lowers taxes, expands /
 * restricts rights…), both sides drawn alike. "Rights that were turned
 * down" is then "expands rights" + "rejected", a question the reader asks
 * of the record rather than a label we put on it.
 *
 * The subject list is fixed and broad on purpose: it is the list of
 * things a household budget, a job, a rent or a school is made of, not a
 * selection of laws.
 *
 * On a phone the home has to breathe: there the change pairs fold behind
 * one row (`foldChanges`), and the subjects alone fill the card.
 */
const EVERYDAY_TOPICS = [
  'habitatge',
  'drets-laborals',
  'economia',
  'sanitat',
  'educacio',
  'medi-ambient',
  'justicia',
  'energia',
  'igualtat',
];

export async function LawsThatMatter({
  topics,
  locale,
  foldChanges = false,
}: {
  topics: Topic[];
  locale: string;
  foldChanges?: boolean;
}) {
  const t = await getTranslations('laws_that_matter');
  const tTags = await getTranslations('change_tags');
  const bySlug = new Map(topics.map((tp) => [tp.slug, tp] as const));
  const everyday = EVERYDAY_TOPICS.map((slug) => bySlug.get(slug)).filter((tp): tp is Topic => tp != null);

  const pairs = (
    <div className="ltm__pairs">
      {CHANGE_PAIRS.map((pair) => (
        <div key={pair.key} className="ltm__pair">
          {pair.tags.map((tag) => {
            const Icon = changeTagIcon(tag);
            return (
              <Link key={tag} href={`/lleis?change=${tag}&sort=voted` as Route} className="change-chip change-chip--link">
                <Icon size={13} strokeWidth={2} aria-hidden="true" />
                {tTags(tag)}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <section className="ltm" aria-labelledby="ltm-title">
      <div className="ltm__head">
        <h2 id="ltm-title">{t('title')}</h2>
        <p>{t('subtitle')}</p>
      </div>

      <div className="ltm__topics">
        {everyday.map((tp) => {
          const Icon = topicIcon(tp.icon);
          return (
            <Link
              key={tp.slug}
              href={`/lleis?topic_slug=${tp.slug}&result=approved,rejected&sort=voted` as Route}
              className="ltm__topic"
              style={{ ['--topic' as string]: tp.color_hex ?? 'var(--accent)' }}
            >
              <span className="ltm__topic-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              {/* The everyday word ("Feina"), not the taxonomy's full name
                  ("Drets laborals i ocupació"): it is a door, and the full
                  name is on the page it opens. */}
              <span className="ltm__topic-name" title={pickTopicName(tp, locale)}>
                {t(`topic_${tp.slug.replace(/-/g, '_')}` as 'title')}
              </span>
            </Link>
          );
        })}
      </div>

      {foldChanges ? (
        <details className="ltm__fold">
          <summary>
            {t('changes_title')}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p className="ltm__changes-note">{t('changes_note')}</p>
          {pairs}
        </details>
      ) : (
        <>
          <div className="ltm__changes-head">
            <span className="eyebrow">{t('changes_title')}</span>
            <span className="ltm__changes-note">{t('changes_note')}</span>
          </div>
          {pairs}
        </>
      )}

      <Link href={'/lleis' as Route} className="ltm__all">
        {t('all')} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
