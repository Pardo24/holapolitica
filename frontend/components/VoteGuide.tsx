import '@/app/styles/el-teu-vot.css';
import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from '@/components/icons';

import { VoteGuideNext } from '@/components/VoteGuideNext';
import { GUIDE_HOME, GUIDE_STEPS, guideHref, type GuideStep } from '@/lib/voteGuide';

/** Top of a step opened from the guide: where the reader is, and the
 *  other steps one tap away. */
export async function VoteGuideBar({ step }: { step: GuideStep }) {
  const t = await getTranslations('elections');
  return (
    <nav className="vguide" aria-label={t('guide_aria')}>
      <Link href={GUIDE_HOME as Route} className="vguide__home">
        <ChevronLeft size={15} aria-hidden="true" />
        {t('vote_title')}
      </Link>
      <div className="vguide__row">
        <ol className="vguide__steps">
          {GUIDE_STEPS.map((s) => (
            <li key={s.n}>
              <Link
                href={guideHref(s.n) as Route}
                className={s.n === step ? 'vguide__dot vguide__dot--on' : s.n < step ? 'vguide__dot vguide__dot--done' : 'vguide__dot'}
                aria-current={s.n === step ? 'step' : undefined}
                aria-label={`${t('guide_step', { n: s.n, total: GUIDE_STEPS.length })}: ${t(`step${s.n}_title`)}`}
              >
                {s.n}
              </Link>
            </li>
          ))}
        </ol>
        <p className="vguide__now">
          <span className="vguide__count">{t('guide_step', { n: step, total: GUIDE_STEPS.length })}</span>
          <span className="vguide__title">{t(`step${step}_title`)}</span>
        </p>
      </div>
    </nav>
  );
}

/** Bottom of a step opened from the guide: the next step, or the end. */
export async function VoteGuideFooter({ step, circ }: { step: GuideStep; circ?: string | null }) {
  const t = await getTranslations('elections');
  if (step < GUIDE_STEPS.length) {
    const next = (step + 1) as GuideStep;
    return <VoteGuideNext {...await guideNextProps(next)} />;
  }
  return (
    <section className="vdone" aria-labelledby="vdone-title">
      <h2 id="vdone-title" className="vdone__title">
        {t('guide_done_title')}
      </h2>
      <p className="vdone__body">{t('guide_done_body')}</p>
      <div className="vdone__links">
        <Link
          href={(circ ? `/eleccions?circ=${encodeURIComponent(circ)}` : '/eleccions') as Route}
          className="btn-ink btn-sm"
        >
          {t('guide_done_candidacies')}
        </Link>
        <Link href={GUIDE_HOME as Route} className="vdone__back">
          {t('guide_done_back')}
        </Link>
      </div>
    </section>
  );
}

/** What the "next step" card says for step ``next``. */
export async function guideNextProps(next: GuideStep) {
  const t = await getTranslations('elections');
  return {
    href: guideHref(next),
    eyebrow: t('guide_next_eyebrow', { n: next, total: GUIDE_STEPS.length }),
    title: t(`step${next}_title`),
    body: t(`step${next}_body`),
    cta: t('guide_next_cta'),
  };
}
