import '@/app/styles/comparar.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Scale } from '@/components/icons';

import { PageHeader } from '@/components/PageHeader';
import { stanceLabel } from '@/components/PartyStanceRow';
import { api, type GroupVoteStat, type Topic } from '@/lib/api';
import { groupLogoUrl } from '@/lib/groupLogos';
import { ballotName2026 } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('compare');
  return { title: t('meta_title'), description: t('meta_description') };
}

/**
 * Compare the parties, topic by topic: pick a subject and see, for every
 * group, the share of its deputies' votes that were yes, no or abstention
 * on the votes classified under it this legislature (backend
 * /topics/{slug}/group-stats, the "who's for, who's against" widget).
 *
 * Groups in the order of their size, never ranked by how they voted, and
 * every one links to its page. Facts of record, not a party's stated
 * position: the method line under the chart says so.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  const t = await getTranslations('compare');
  const tLleis = await getTranslations('lleis');
  const locale = await getLocale();
  const topics: Topic[] = (await api.topics.list({ kind: 'theme' }).catch(() => [] as Topic[])).sort((a, b) =>
    pickTopicName(a, locale).localeCompare(pickTopicName(b, locale), locale),
  );
  const asked = (await searchParams).tema;
  const topic = topics.find((tp) => tp.slug === asked) ?? topics.find((tp) => tp.slug === 'habitatge') ?? topics[0];
  const stats: GroupVoteStat[] = topic
    ? (await api.topics.groupStats(topic.slug).catch(() => [] as GroupVoteStat[])).filter((g) => g.cast > 0)
    : [];
  stats.sort((a, b) => b.cast - a.cast);
  const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

  return (
    <div className="cmp">
      <PageHeader
        hue="var(--hue-partits)"
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      <nav className="cmp__topics" aria-label={t('topics_aria')}>
        {topics.map((tp) => (
          <Link
            key={tp.slug}
            href={`/comparar?tema=${tp.slug}` as Route}
            className={tp.slug === topic?.slug ? 'cmp__topic cmp__topic--on' : 'cmp__topic'}
            aria-current={tp.slug === topic?.slug ? 'page' : undefined}
            style={{ ['--topic' as string]: tp.color_hex ?? 'var(--ink-3)' }}
            scroll={false}
          >
            {pickTopicName(tp, locale)}
          </Link>
        ))}
      </nav>

      {topic && (
        <section className="cmp__panel" aria-labelledby="cmp-title">
          <h2 id="cmp-title" className="cmp__title">
            {t('topic_title', { topic: pickTopicName(topic, locale) })}
          </h2>
          <p className="cmp__legend">
            <span className="cmp__key cmp__key--aye" /> {tLleis('card_in_favour')}
            <span className="cmp__key cmp__key--abst" /> {tLleis('card_abstention')}
            <span className="cmp__key cmp__key--no" /> {tLleis('card_against')}
          </p>
          {stats.length === 0 ? (
            <p className="cmp__empty">{t('empty')}</p>
          ) : (
            <ul className="cmp__rows">
              {stats.map((g) => {
                const logo = groupLogoUrl(g.group_slug);
                const ballot = ballotName2026(g.group_slug);
                const aye = pct(g.ayes, g.cast);
                const no = pct(g.noes, g.cast);
                const abst = Math.max(0, 100 - aye - no);
                return (
                  <li key={g.group_slug}>
                    <Link href={`/groups/${g.group_slug}` as Route} className="cmp__row">
                      <span className="cmp__party">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" width={24} height={24} loading="lazy" decoding="async" />
                        ) : (
                          <span
                            className="cmp__disc"
                            style={{ background: g.group_color_hex ?? 'var(--ink-3)' }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="cmp__name">
                          {stanceLabel({ slug: g.group_slug, name_short: g.group_name_short })}
                          {ballot && <span className="cmp__ballot">{t('ballot', { name: ballot })}</span>}
                        </span>
                      </span>
                      <span className="cmp__bar" role="img" aria-label={t('bar_aria', { aye, abst, no })}>
                        <span className="cmp__seg cmp__seg--aye" style={{ width: `${aye}%` }}>
                          {aye >= 12 && `${aye}%`}
                        </span>
                        <span className="cmp__seg cmp__seg--abst" style={{ width: `${abst}%` }}>
                          {abst >= 12 && `${abst}%`}
                        </span>
                        <span className="cmp__seg cmp__seg--no" style={{ width: `${no}%` }}>
                          {no >= 12 && `${no}%`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="cmp__method">{t('method')}</p>
          <Link href={`/topics/${topic.slug}` as Route} className="cmp__more">
            {t('see_topic', { topic: pickTopicName(topic, locale) })} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
