import { getLocale, getTranslations } from 'next-intl/server';
import { Scale } from 'lucide-react';

import { AlignQuiz } from '@/components/AlignQuiz';
import { PageHeader } from '@/components/PageHeader';
import { api, type AlignQuestion } from '@/lib/api';

// Questions rotate with the data; a short ISR window keeps them fresh without
// hammering the backend (the payload is also cached server-side).
export const revalidate = 300;

/**
 * "Com et representen?" — the participation centrepiece. The citizen answers
 * real past votes; the page mirrors back which groups voted the same way.
 * Neutral by construction: the criterion is the user's own, computed on-device.
 */
export default async function ComEtRepresentenPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const t = await getTranslations('align');
  const locale = await getLocale();
  // "Other questions" reshuffles the same eligible pool behind a seed, so a
  // reader who has answered these ten can keep going, and a shared link
  // always shows the same set.
  const { seed } = await searchParams;
  const seedNumber = seed && /^\d+$/.test(seed) ? Number(seed) : undefined;

  let questions: AlignQuestion[] = [];
  try {
    questions = await api.align.questions(10, undefined, seedNumber);
  } catch {
    questions = [];
  }

  return (
    <div style={{ maxWidth: 680, marginInline: 'auto' }}>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      <div style={{ paddingTop: 22 }}>
        {questions.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('unavailable')}</p>
        ) : (
          <AlignQuiz
            questions={questions}
            locale={locale}
            labels={{
              // Templated strings go through t.raw: the component fills the
              // placeholders itself, and t() would parse them as ICU
              // arguments and fail. Same pattern as the Trivia page.
              progress: t.raw('progress'),
              aye: t('stance_aye'),
              no: t('stance_no'),
              abstention: t('stance_abstention'),
              skip: t('skip'),
              back: t('back'),
              results_title: t('results_title'),
              results_intro: t.raw('results_intro'),
              coincidence_unit: t('coincidence_unit'),
              votes_compared: t.raw('votes_compared'),
              neutrality_note: t('neutrality_note'),
              restart: t('restart'),
              none_answered: t('none_answered'),
              view_vote: t('view_vote'),
              question_label: t('question_label'),
              official_title: t('official_title'),
              results_podium: t('results_podium'),
              results_rest: t('results_rest'),
              results_of_votes: t.raw('results_of_votes'),
              results_top_caption: t.raw('results_top_caption'),
              results_topics: t('results_topics'),
              share: t('share'),
              share_copied: t('share_copied'),
              share_text: t.raw('share_text'),
              // A real ICU plural, so one answer doesn't read "1 respostes".
              // t() with values is fine; it was t() WITHOUT them that broke.
              see_results: (n: number) => t('see_results', { count: n }),
              more_questions: t('more_questions'),
            }}
          />
        )}
      </div>
    </div>
  );
}
