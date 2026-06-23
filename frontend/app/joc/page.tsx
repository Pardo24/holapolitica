import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame, type RivalResult } from '@/components/TriviaGame';
import { api, type GameQuestion } from '@/lib/api';
import { bankQuestions, fromGameQuestion, type Cat, type DuelQuestion } from '@/lib/triviaBank';

/**
 * "Trivia" — the game-first front door. An async 1v1 duel: spin a roulette for a
 * category (or the golden Corona), answer a timed question to win its quesito,
 * with 3 lives and comodins per turn. Vote categories (Lleis / Partits) come
 * from real votes; the Veritat-o-fals and Món categories come from a curated
 * neutral knowledge bank. ?repte=<seed> + ?rq/?ru carry a challenger's result.
 */
export const dynamic = 'force-dynamic';

const POOL_PER_CATEGORY = 8;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('game');
  return { title: t('meta_title'), description: t('meta_description') };
}

interface SearchParams {
  repte?: string;
  rq?: string;
  ru?: string;
}

export default async function JocPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('game');
  const locale = await getLocale();
  const { repte, rq, ru } = await searchParams;

  const seed =
    repte && /^\d+$/.test(repte) ? Number(repte) : Math.floor(Math.random() * 1_000_000_000);

  const rival: RivalResult | null =
    rq && /^\d+$/.test(rq) ? { quesitos: Number(rq), used: ru && /^\d+$/.test(ru) ? Number(ru) : 0 } : null;

  // Vote-based categories from the API; general-knowledge from the curated bank.
  const empty: GameQuestion[] = [];
  const [lleisApi, partitsApi] = await Promise.all(
    (['lleis', 'partits'] as const).map((cat) =>
      api.game.questions(POOL_PER_CATEGORY, seed, undefined, locale, cat).catch(() => empty),
    ),
  );

  const pools: Record<Cat, DuelQuestion[]> = {
    lleis: (lleisApi ?? empty).map(fromGameQuestion),
    partits: (partitsApi ?? empty).map(fromGameQuestion),
    vf: bankQuestions(locale, 'vf', seed),
    mon: bankQuestions(locale, 'mon', seed),
  };

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
          pools={pools}
          seed={seed}
          rival={rival}
          labels={{
            category_partits: t('category_partits'),
            category_lleis: t('category_lleis'),
            category_vf: t('category_vf'),
            category_mon: t('category_mon'),
            corona: t('corona'),
            explore: t('explore'),
            unavailable: t('unavailable'),
            challenge: t('challenge'),
            challenge_copied: t('challenge_copied'),
            challenge_text: t('challenge_text'),
            play_again: t('play_again'),
            spin_cta: t('spin_cta'),
            continue: t('continue'),
            time_up: t('time_up'),
            correct: t('correct'),
            wrong: t('wrong'),
            quesitos_count: t('quesitos_count'),
            turn_won_title: t('turn_won_title'),
            turn_over_title: t('turn_over_title'),
            corona_win: t('corona_win'),
            corona_pick: t('corona_pick'),
            fifty: t('fifty'),
            skip: t('skip'),
            add_time: t('add_time'),
            duel_intro: t('duel_intro'),
            duel_you: t('duel_you'),
            duel_rival: t('duel_rival'),
            duel_win: t('duel_win'),
            duel_lose: t('duel_lose'),
            duel_tie: t('duel_tie'),
          }}
        />
      </div>
    </div>
  );
}
