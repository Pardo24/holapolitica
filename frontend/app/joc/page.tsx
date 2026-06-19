import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame } from '@/components/TriviaGame';
import { api, type GameQuestion } from '@/lib/api';

/**
 * "Hola Política, el joc" — the game-first front door. A trivia round built
 * from real votes (who proposed / how a group voted / what was decided / which
 * topic), each question followed by a plain-language explanation of the law.
 * The data sits behind the questions, surfaced contextually — not as lists.
 *
 * Neutral by construction: questions are factual recall served by /game.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('meta_title'), description: t('meta_description') };
}

export default async function JocPage() {
  const t = await getTranslations('game');

  let questions: GameQuestion[] = [];
  try {
    questions = await api.game.questions(7);
  } catch {
    questions = [];
  }

  return (
    <div style={{ maxWidth: 620, marginInline: 'auto' }}>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Gamepad2 size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      <div style={{ paddingTop: 22 }}>
        <TriviaGame
          initialQuestions={questions}
          labels={{
            progress: t('progress'),
            category_partits: t('category_partits'),
            category_lleis: t('category_lleis'),
            category_temes: t('category_temes'),
            explore: t('explore'),
            next: t('next'),
            finish: t('finish'),
            score_title: t('score_title'),
            score_line: t('score_line'),
            play_again: t('play_again'),
            loading: t('loading'),
            unavailable: t('unavailable'),
          }}
        />
      </div>
    </div>
  );
}
