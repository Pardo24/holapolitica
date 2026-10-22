import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowUpRight } from '@/components/icons';

import { api, type ElectionNewsItem } from '@/lib/api';
import { daysToElection, electionParty, type ElectionParty } from '@/lib/electionParties';

/**
 * Press coverage of the 29 November 2026 election, newest first, grouped by
 * day. A pass-through of Google News (backend app/services/topic_news.py,
 * ``fetch_election_news``): we neither pick nor summarise the articles. The
 * party tags say which parties a headline names, nothing more.
 */
export async function ElectionNewsList({
  items,
  locale,
  activeParty,
}: {
  items: ElectionNewsItem[];
  locale: string;
  activeParty?: string | null;
}) {
  const t = await getTranslations('pacts');
  const days = new Map<string, ElectionNewsItem[]>();
  for (const it of items) {
    const key = it.published_at ? dayKey(new Date(it.published_at)) : '';
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(it);
  }
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const fullDate = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  return (
    <div className="enews">
      {[...days.entries()].map(([key, list]) => {
        const relative = key === today ? t('today') : key === yesterday ? t('yesterday') : null;
        return (
          <section key={key || 'undated'} className="enews__day">
            {key && (
              <h2 className="enews__date">
                {relative && <span className="enews__date-rel">{relative}</span>}
                <span className="enews__date-full">{fullDate(key)}</span>
                <span className="enews__date-count tabular">{list.length}</span>
              </h2>
            )}
            <ul className="enews__list">
              {list.map((it) => (
                <NewsItem key={it.url} item={it} locale={locale} newTab={t('new_tab')} activeParty={activeParty} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function NewsItem({
  item,
  locale,
  newTab,
  activeParty,
}: {
  item: ElectionNewsItem;
  locale: string;
  newTab: string;
  activeParty?: string | null;
}) {
  const time = item.published_at
    ? new Date(item.published_at).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Madrid',
      })
    : null;
  const parties = (item.parties ?? []).map(electionParty).filter((p): p is ElectionParty => p !== null);
  return (
    <li className="enews__item">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="enews__link">
        <span className="enews__outlet-mark" aria-hidden="true">
          {outletInitials(item.source)}
        </span>
        <span className="enews__body">
          <span className="enews__title">{item.title}</span>
          <span className="enews__meta">
            <span className="enews__source">{item.source}</span>
            {time && <span className="enews__time tabular">{time}</span>}
            <ArrowUpRight size={13} aria-hidden="true" className="enews__ext" />
            <span className="sr-only">({newTab})</span>
          </span>
          {parties.length > 0 && (
            <span className="enews__parties">
              {parties.map((p) => (
                <PartyTag key={p.slug} party={p} active={p.slug === activeParty} />
              ))}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

function PartyTag({ party, active }: { party: ElectionParty; active?: boolean }) {
  return (
    <span
      className={active ? 'party-tag party-tag--active' : 'party-tag'}
      style={{ ['--party' as string]: party.color }}
    >
      <span className="party-tag__dot" aria-hidden="true" />
      {party.name}
    </span>
  );
}

/** Party filter: "All" and one chip per party, as plain links (no JS). */
export async function PartyFilter({ parties, active }: { parties: ElectionParty[]; active: string | null }) {
  const t = await getTranslations('pacts');
  return (
    <nav className="pfilter" aria-label={t('filter_label')}>
      <span className="pfilter__label">{t('filter_label')}</span>
      <ul className="pfilter__chips">
        <li>
          <Link
            href={'/pactes' as Route}
            className={active ? 'pchip' : 'pchip pchip--on'}
            aria-current={active ? undefined : 'page'}
            scroll={false}
          >
            {t('filter_all')}
          </Link>
        </li>
        {parties.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/pactes?partit=${p.slug}` as Route}
              className={p.slug === active ? 'pchip pchip--on' : 'pchip'}
              aria-current={p.slug === active ? 'page' : undefined}
              style={{ ['--party' as string]: p.color }}
              scroll={false}
            >
              <span className="pchip__dot" aria-hidden="true" />
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Falten 38 dies" up to election day, "Avui es vota" on it, nothing after. */
export async function Countdown({ variant = 'card' }: { variant?: 'card' | 'pill' }) {
  const t = await getTranslations('pacts');
  const n = daysToElection();
  if (n < 0) return null;
  if (variant === 'pill') {
    return <span className="ecount-pill tabular">{n === 0 ? t('countdown_today') : t('countdown_pill', { n })}</span>;
  }
  return (
    <div className="ecount" role="note">
      {n === 0 ? (
        <span className="ecount__today">{t('countdown_today')}</span>
      ) : (
        <>
          <span className="ecount__label">{t('countdown_before', { n })}</span>
          <span className="ecount__n tabular">{n}</span>
          <span className="ecount__label">{t('countdown_after', { n })}</span>
        </>
      )}
      <span className="ecount__date">{t('election_date')}</span>
    </div>
  );
}

/** Home block: the three latest election headlines and a way to the rest. */
export async function ElectionNewsTeaser({ locale }: { locale: string }) {
  const t = await getTranslations('pacts');
  const items = await api.news.elections(locale).catch(() => [] as ElectionNewsItem[]);
  if (items.length === 0) return null;
  return (
    <section className="enews-teaser" aria-labelledby="enews-teaser-title">
      <div className="enews-teaser__head">
        <div className="enews-teaser__heading">
          <span className="enews-teaser__eyebrow">
            {t('teaser_eyebrow')}
            <Countdown variant="pill" />
          </span>
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
      {/* On a phone the way on sits under the headlines, not above them. */}
      <Link href={'/pactes' as Route} className="enews-teaser__more enews-teaser__more--below">
        {t('teaser_cta')} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}

/** YYYY-MM-DD of a date in Madrid time: a "day" of news is a Spanish day. */
function dayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/** "El País" → "EP", "RTVE.es" → "RT": a neutral mark, no outlet logos. */
function outletInitials(source: string): string {
  const words = source
    .replace(/\.(es|cat|com|eus|gal)$/i, '')
    .split(/[\s-]+/)
    .filter((w) => /^[\p{L}\d]/u.test(w) && !/^(el|la|les|los|las|de|del|i|y|the|l')$/i.test(w));
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? source).slice(0, 2).toUpperCase();
}
