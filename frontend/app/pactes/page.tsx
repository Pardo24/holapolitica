import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { ElectionsHeader } from '@/components/Elections';
import { ElectionNewsList, PartyFilter } from '@/components/ElectionNews';
import { api, type ElectionNewsItem } from '@/lib/api';
import { ELECTION_PARTIES, electionParty } from '@/lib/electionParties';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pacts');
  return { title: t('meta_title'), description: t('meta_description') };
}

/**
 * The run-up to the general election of 29 November 2026 as the press
 * tells it: pacts, coalitions, lists, candidates and, after the vote, the
 * investiture. Many outlets, newest first, at most three per outlet, and a
 * filter by the parties a headline names. We neither pick nor summarise
 * ("mirall, no megàfon").
 */
export default async function PactsPage({ searchParams }: { searchParams: Promise<{ partit?: string }> }) {
  const t = await getTranslations('pacts');
  const locale = await getLocale();
  const party = electionParty((await searchParams).partit);
  const items = await api.news.elections(locale, party?.slug).catch(() => [] as ElectionNewsItem[]);

  return (
    <div className="pacts">
      <ElectionsHeader active="pacts" title={t('title')} intro={t('intro')} />

      <PartyFilter parties={ELECTION_PARTIES} active={party?.slug ?? null} />

      <div className="pacts-results">
        <p className="pacts-results__head" aria-live="polite">
          {party ? t('filtered_title', { party: party.name }) : t('all_title')}
          {items.length > 0 && <span className="pacts-results__count tabular">{items.length}</span>}
        </p>
        {items.length === 0 ? (
          <p className="pacts-empty">{party ? t('party_empty', { party: party.name }) : t('empty')}</p>
        ) : (
          <ElectionNewsList items={items} locale={locale} activeParty={party?.slug} />
        )}
      </div>

      <details className="pacts-how">
        <summary>{t('how_title')}</summary>
        <ul>
          <li>{t('how_source')}</li>
          <li>{t('how_order')}</li>
          <li>{t('how_relevance')}</li>
          <li>{t('how_parties')}</li>
        </ul>
      </details>
    </div>
  );
}
