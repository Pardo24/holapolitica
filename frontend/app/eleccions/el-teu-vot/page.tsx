import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/el-teu-vot.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import { ElectionsHeader } from '@/components/Elections';
import { GUIDE_STEPS, guideHref } from '@/lib/voteGuide';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('vote_meta_title'), description: t('vote_meta_description') };
}

/**
 * "Your vote": the way to decide, in four steps, each a page of its own
 * (lib/voteGuide.ts): the test, what the parties voted, what they propose,
 * and how a vote counts where you vote. Opened from here, every step leads
 * to the next one.
 *
 * The page never says what to vote; the steps show what the parties did and
 * say, and how the count works.
 */
export default async function YourVotePage() {
  const t = await getTranslations('elections');

  return (
    <div className="pacts">
      <ElectionsHeader active="vote" title={t('vote_title')} intro={t('vote_intro')} />

      <div className="vstart">
        <Link href={guideHref(1) as Route} className="btn-ink">
          {t('guide_start')} <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <span className="vstart__note">{t('guide_start_note')}</span>
      </div>

      <ol className="vsteps">
        {GUIDE_STEPS.map((s) => (
          <li key={s.n}>
            <Link href={guideHref(s.n) as Route} className="vsteps__item">
              <span className="vsteps__n" aria-hidden="true">
                {s.n}
              </span>
              <span className="vsteps__text">
                <span className="vsteps__title">{t(`step${s.n}_title`)}</span>
                <span className="vsteps__body">{t(`step${s.n}_body`)}</span>
                <span className="vsteps__cta">
                  {t(`step${s.n}_cta`)} <ArrowRight size={13} aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
