import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame, type RivalResult } from '@/components/TriviaGame';
import { api, type GameQuestion } from '@/lib/api';

/**
 * "Trivia" — the game-first front door. An async 1v1 duel: spin a roulette for a
 * category, answer a timed question to win its quesito, with 3 lives per turn.
 * ?repte=<seed> drops a challenged friend onto the same question pools, and
 * ?rq/?ru carry the challenger's result so the duel winner is shown.
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

  // A seed makes the round reproducible so the duel is fair: a challenged friend
  // reuses the challenger's seed and faces the same question pools.
  const seed =
    repte && /^\d+$/.test(repte) ? Number(repte) : Math.floor(Math.random() * 1_000_000_000);

  // The challenger's result rides in the URL (rq = quesitos, ru = questions used)
  // so the rival's screen can show who won.
  const rival: RivalResult | null =
    rq && /^\d+$/.test(rq) ? { quesitos: Number(rq), used: ru && /^\d+$/.test(ru) ? Number(ru) : 0 } : null;

  const empty: GameQuestion[] = [];
  const [lleis, partits, temes] = await Promise.all(
    (['lleis', 'partits', 'temes'] as const).map((cat) =>
      api.game.questions(POOL_PER_CATEGORY, seed, undefined, locale, cat).catch(() => empty),
    ),
  );

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
          pools={{ lleis: lleis ?? empty, partits: partits ?? empty, temes: temes ?? empty }}
          seed={seed}
          rival={rival}
          labels={{
            category_partits: t('category_partits'),
            category_lleis: t('category_lleis'),
            category_temes: t('category_temes'),
            explore: t('explore'),
            loading: t('loading'),
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
