import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Gamepad2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame, type RivalResult } from '@/components/TriviaGame';
import { TopicPickRow } from '@/components/TopicPickRow';
import { TriviaStart } from '@/components/TriviaStart';
import { api, type GameQuestion, type Topic } from '@/lib/api';
import { bankQuestions, fromGameQuestion, type Cat, type DuelQuestion } from '@/lib/triviaBank';

/**
 * "Trivia" — an async 1v1 duel: spin a roulette for a category (or the golden
 * Corona), answer a timed question to win its quesito, with 3 lives + comodins.
 * Vote categories (Lleis / Partits) come from real votes; Veritat-o-fals and Món
 * from a curated neutral bank.
 *
 * With no params the page shows a start screen (play solo / invite friends).
 * ?solo=1 plays a fresh solo round; ?repte=<seed> drops you (or an invited
 * friend) onto the same round; ?rq/?ru carry a challenger's result to compare.
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
  solo?: string;
  /** Play the round on one subject, as the alignment quiz already allows. */
  tema?: string;
}

export default async function JocPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('game');
  const locale = await getLocale();
  const { repte, rq, ru, solo, tema } = await searchParams;
  const topicSlug = tema && /^[a-z0-9-]+$/.test(tema) ? tema : undefined;

  const hasRepte = Boolean(repte && /^\d+$/.test(repte));
  // Show the start screen unless we're entering an actual round (solo or a seed).
  const showStart = !hasRepte && solo !== '1';

  const header = (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      icon={<Gamepad2 size={20} strokeWidth={1.8} aria-hidden="true" />}
      bordered
    />
  );

  if (showStart) {
    // Only offer subjects the bank can actually fill, so a chip never leads
    // to an empty round.
    const allTopics = await api.topics.list().catch(() => [] as Topic[]);
    return (
      <div style={{ maxWidth: 620, marginInline: 'auto' }}>
        {header}
        <TopicPickRow
          topics={allTopics}
          locale={locale}
          basePath="/joc"
          activeSlug={topicSlug}
          label={t('topic_picker')}
          anyLabel={t('topic_any')}
        />
        <div style={{ paddingTop: 22 }}>
          <TriviaStart
            topicSlug={topicSlug ?? null}
            labels={{
              solo_title: t('start_solo_title'),
              solo_sub: t('start_solo_sub'),
              solo_cta: t('start_solo_cta'),
              invite_title: t('start_invite_title'),
              invite_sub: t('start_invite_sub'),
              invite_cta: t('start_invite_cta'),
              invite_hint: t('start_invite_hint'),
              copy: t('start_copy'),
              copied: t('start_copied'),
              share: t('start_share'),
              start: t('start_begin'),
            }}
          />
        </div>
      </div>
    );
  }

  const seed = hasRepte ? Number(repte) : Math.floor(Math.random() * 1_000_000_000);

  const rival: RivalResult | null =
    rq && /^\d+$/.test(rq) ? { quesitos: Number(rq), used: ru && /^\d+$/.test(ru) ? Number(ru) : 0 } : null;

  // Vote-based categories from the API; general-knowledge from the curated bank.
  const empty: GameQuestion[] = [];
  const [lleisApi, partitsApi] = await Promise.all(
    (['lleis', 'partits'] as const).map((cat) =>
      api.game
        .questions(POOL_PER_CATEGORY, seed, undefined, locale, cat, topicSlug)
        .catch(() => empty),
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
      {header}
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
            challenge_text: t.raw('challenge_text'),
            play_again: t('play_again'),
            spin_cta: t('spin_cta'),
            continue: t('continue'),
            time_up: t('time_up'),
            correct: t('correct'),
            wrong: t('wrong'),
            quesitos_count: t.raw('quesitos_count'),
            turn_won_title: t('turn_won_title'),
            turn_over_title: t('turn_over_title'),
            corona_win: t('corona_win'),
            corona_pick: t('corona_pick'),
            fifty: t('fifty'),
            skip: t('skip'),
            add_time: t('add_time'),
            duel_intro: t.raw('duel_intro'),
            duel_you: t('duel_you'),
            duel_rival: t('duel_rival'),
            duel_win: t('duel_win'),
            duel_lose: t('duel_lose'),
            duel_tie: t('duel_tie'),
            daily_badge: t('daily_badge'),
            best_label: t.raw('best_label'),
            streak_label: t.raw('streak_label'),
          }}
        />
      </div>
    </div>
  );
}
