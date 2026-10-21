import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { ElectionNewsList } from '@/components/ElectionNews';
import { api, type TopicNewsItem } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pacts');
  return { title: t('meta_title'), description: t('meta_description') };
}

/**
 * The run-up to the general election of 29 November 2026 as the press
 * tells it: pacts, coalitions, lists, candidates and, after the vote, the
 * investiture. Many outlets, newest first, at most three per outlet. We
 * neither pick nor summarise ("mirall, no megàfon").
 */
export default async function PactsPage() {
  const t = await getTranslations('pacts');
  const locale = await getLocale();
  const items = await api.news.elections(locale).catch(() => [] as TopicNewsItem[]);

  return (
    <div className="pacts">
      <header className="pacts-hero">
        <p className="pacts-hero__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="pacts-hero__intro">{t('intro')}</p>
        <p className="pacts-hero__source">{t('attribution')}</p>
      </header>
      {items.length === 0 ? (
        <p className="pacts-empty">{t('empty')}</p>
      ) : (
        <ElectionNewsList items={items} locale={locale} />
      )}
    </div>
  );
}
