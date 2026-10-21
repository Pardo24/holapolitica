import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowUpRight } from '@/components/icons';

import { api, type TopicNewsItem } from '@/lib/api';

/**
 * Press coverage of the 29 November 2026 election, newest first, grouped by
 * day. A pass-through of Google News (see backend app/services/topic_news.py
 * ``fetch_election_news``): we neither pick nor summarise the articles.
 */
export async function ElectionNewsList({
  items,
  locale,
}: {
  items: TopicNewsItem[];
  locale: string;
}) {
  const t = await getTranslations('pacts');
  const days = new Map<string, TopicNewsItem[]>();
  for (const it of items) {
    const key = it.published_at ? dayKey(new Date(it.published_at)) : '';
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(it);
  }
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const label = (key: string) => {
    if (key === today) return t('today');
    if (key === yesterday) return t('yesterday');
    if (!key) return '';
    return new Date(`${key}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="enews">
      {[...days.entries()].map(([key, list]) => (
        <section key={key || 'undated'} className="enews__day" aria-label={label(key) || undefined}>
          {label(key) && <h2 className="enews__date">{label(key)}</h2>}
          <ul className="enews__list">
            {list.map((it) => (
              <NewsItem key={it.url} item={it} locale={locale} newTab={t('new_tab')} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function NewsItem({ item, locale, newTab }: { item: TopicNewsItem; locale: string; newTab: string }) {
  const time = item.published_at
    ? new Date(item.published_at).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid',
      })
    : null;
  return (
    <li className="enews__item">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="enews__link">
        <span className="enews__title">{item.title}</span>
        <span className="enews__meta">
          <span className="enews__source">{item.source}</span>
          {time && <span className="tabular">{time}</span>}
          <ArrowUpRight size={13} aria-hidden="true" />
          <span className="sr-only">({newTab})</span>
        </span>
      </a>
    </li>
  );
}

/** YYYY-MM-DD of a date in Madrid time: a "day" of news is a Spanish day. */
function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** Home block: the three latest election headlines and a way to the rest. */
export async function ElectionNewsTeaser({ locale }: { locale: string }) {
  const t = await getTranslations('pacts');
  const items = await api.news.elections(locale).catch(() => [] as TopicNewsItem[]);
  if (items.length === 0) return null;
  return (
    <section className="enews-teaser" aria-labelledby="enews-teaser-title">
      <div className="enews-teaser__head">
        <div>
          <span className="enews-teaser__eyebrow">{t('teaser_eyebrow')}</span>
          <h2 id="enews-teaser-title" className="enews-teaser__title">
            {t('teaser_title')}
          </h2>
        </div>
        <Link href={'/pactes' as Route} className="enews-teaser__more">
          {t('teaser_cta')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="enews__list">
        {items.slice(0, 3).map((it) => (
          <NewsItem key={it.url} item={it} locale={locale} newTab={t('new_tab')} />
        ))}
      </ul>
    </section>
  );
}
