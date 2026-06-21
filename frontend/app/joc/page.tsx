import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame } from '@/components/TriviaGame';
import { api, type GameQuestion } from '@/lib/api';

/**
 * "Hola Política, el joc" — the game-first front door. A trivia round built
 * from real votes, each question followed by a plain-language explanation, with
 * a Trivial-Pursuit "quesito" that fills per correct answer. ?repte=<seed>
 * drops a challenged friend onto the exact same round to compare scores.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('meta_title'), description: t('meta_description') };
}

interface SearchParams {
  repte?: string;
  n?: string;
}

export default async function JocPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('game');
  const { repte, n } = await searchParams;

  // A seed makes the round reproducible so it can be shared; if a friend opened
  // a ?repte link we reuse that exact seed, otherwise we mint a fresh one.
  const seed =
    repte && /^\d+$/.test(repte)
      ? Number(repte)
      : Math.floor(Math.random() * 1_000_000_000);
  const count = n && /^\d+$/.test(n) ? Math.min(20, Math.max(3, Number(n))) : 7;

  let questions: GameQuestion[] = [];
  try {
    questions = await api.game.questions(count, seed);
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
          seed={seed}
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
            challenge: t('challenge'),
            challenge_copied: t('challenge_copied'),
            challenge_text: t('challenge_text'),
          }}
        />
      </div>
    </div>
  );
}
