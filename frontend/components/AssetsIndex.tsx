'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Search, User, X } from 'lucide-react';

import type { AssetDeclarant } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * The way into the deputies' asset declarations: everyone who has filed
 * one, by name, with a search and a group filter. Each row opens that
 * deputy's "Béns" tab.
 *
 * Neutrality: names and dates only. No amounts and no counts of what they
 * own, so the list cannot be read (or sorted) as who is richest.
 */
export function AssetsIndex({ declarants, locale }: { declarants: AssetDeclarant[]; locale: string }) {
  const t = useTranslations('assets');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const by = new Map<string, { slug: string; short: string; color: string | null; n: number }>();
    for (const d of declarants) {
      if (!d.group_slug || !d.group_short) continue;
      const g = by.get(d.group_slug);
      if (g) g.n += 1;
      else by.set(d.group_slug, { slug: d.group_slug, short: d.group_short, color: d.group_color, n: 1 });
    }
    return [...by.values()].sort((a, b) => b.n - a.n);
  }, [declarants]);

  const shown = useMemo(() => {
    const needle = normalize(q.trim());
    return declarants.filter(
      (d) => (!group || d.group_slug === group) && (!needle || normalize(d.full_name).includes(needle)),
    );
  }, [declarants, q, group]);

  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <section className="assets-index" aria-labelledby="assets-index-title">
      <h2 id="assets-index-title" className="assets-index__title">
        {t('index_title')}
      </h2>
      <p className="assets-index__dek">{t('index_intro')}</p>

      <div className="assets-index__search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('index_search')}
          aria-label={t('index_search')}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={t('index_clear')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {groups.length > 1 && (
        <div className="party-filter" role="group" aria-label={t('index_groups')}>
          <button type="button" className={!group ? 'is-active' : undefined} onClick={() => setGroup(null)}>
            {t('index_all')}
            <span className="tabular">{declarants.length}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g.slug}
              type="button"
              className={group === g.slug ? 'is-active' : undefined}
              onClick={() => setGroup(group === g.slug ? null : g.slug)}
              style={{ ['--party' as string]: g.color ?? 'var(--ink-3)' }}
            >
              <span className="party-filter__dot" aria-hidden="true" />
              {displayGroupShort(g.short)}
              <span className="tabular">{g.n}</span>
            </button>
          ))}
        </div>
      )}

      <p className="assets-index__count" aria-live="polite">
        {t('index_count', { n: shown.length })}
      </p>

      {shown.length === 0 ? (
        <p className="assets-index__empty">{t('index_empty')}</p>
      ) : (
        <ul className="assets-index__grid">
          {shown.map((d) => (
            <li key={d.person_id}>
              <Link
                href={`/persons/${d.person_id}?tab=qui-es#bens` as Route}
                className="assets-index__card"
                style={{ ['--party' as string]: d.group_color ?? 'var(--rule-strong)' }}
              >
                <span className="assets-index__photo" aria-hidden="true">
                  {d.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photo_url} alt="" width={44} height={44} loading="lazy" />
                  ) : (
                    <User size={19} strokeWidth={1.8} />
                  )}
                </span>
                <span className="assets-index__body">
                  <span className="assets-index__name">{d.full_name}</span>
                  <span className="assets-index__meta">
                    {[d.group_short && displayGroupShort(d.group_short), d.constituency].filter(Boolean).join(' · ')}
                  </span>
                  <span className="assets-index__meta tabular">
                    {t('index_latest', { date: day(d.latest_declared_on), n: d.declarations })}
                  </span>
                </span>
                <ChevronRight size={17} strokeWidth={2} aria-hidden="true" className="assets-index__chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
