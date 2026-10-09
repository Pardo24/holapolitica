import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Route } from 'next';
import { Gamepad2, User, UserPlus } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { TriviaGame, type RivalResult } from '@/components/TriviaGame';
import { GameTopicStart } from '@/components/GameTopicStart';
import { api, type GameQuestion, type Topic } from '@/lib/api';
import { lawBankQuestions, interleave } from '@/lib/lawBank';
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

// A quesito takes three right answers, and a miss sends you back to the
// wheel: a category can be visited several times in one round.
const POOL_PER_CATEGORY = 14;

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
  /** Start screen: "amics" = play with friends (invite before the first spin). */
  mode?: string;
  /** In a round: show the invite step before the first spin. */
  convida?: string;
}

export default async function JocPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('game');
  const locale = await getLocale();
  const { repte, rq, ru, solo, tema, mode, convida } = await searchParams;
  const topicSlug = tema && /^[a-z0-9-]+$/.test(tema) ? tema : undefined;

  const hasRepte = Boolean(repte && /^\d+$/.test(repte));
  // Show the start screen unless we're entering an actual round (solo or a seed).
  const showStart = !hasRepte && solo !== '1';

  const header = (
    <PageHeader
        hue="var(--hue-jocs)"
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
    // With friends, every tile starts a shared round (one seed for the page)
    // that opens on the invite step; the link it shows drops the friends
    // onto the same questions.
    const friends = mode === 'amics';
    const shared = Math.floor(Math.random() * 1_000_000_000);
    return (
      <GameTopicStart
        hue="var(--hue-jocs)"
        icon={<Gamepad2 size={26} strokeWidth={2} />}
        title={t('title')}
        hook={t('start_hook')}
        meta={[t('start_meta_wedges'), t('start_meta_lives'), t('start_meta_time')]}
        pickLabel={t('start_pick')}
        anyTitle={t('start_any_title')}
        anySub={t('start_any_sub')}
        topics={allTopics}
        locale={locale}
        hrefFor={(slug) =>
          friends
            ? `/joc?repte=${shared}&convida=1${slug ? `&tema=${slug}` : ''}`
            : slug
              ? `/joc?solo=1&tema=${slug}`
              : '/joc?solo=1'
        }
        before={
          <>
            <nav className="seg-tabs game-mode" aria-label={t('mode_aria')}>
              <Link href={'/joc' as Route} className={!friends ? 'is-active' : undefined} scroll={false}>
                <User size={15} strokeWidth={2.2} aria-hidden="true" />
                {t('mode_solo')}
              </Link>
              <Link href={'/joc?mode=amics' as Route} className={friends ? 'is-active' : undefined} scroll={false}>
                <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                {t('mode_friends')}
              </Link>
            </nav>
            {friends && <p className="game-mode__hint">{t('mode_friends_hint')}</p>}
          </>
        }
      />
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
    // Real votes and questions about laws themselves (how they are made,
    // well-known laws), alternating: laws are what the site is about.
    lleis: interleave((lleisApi ?? empty).map(fromGameQuestion), lawBankQuestions(locale, seed)),
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
          inviteLink={
            hasRepte && convida === '1'
              ? `https://www.holapolitica.org/joc?repte=${seed}${topicSlug ? `&tema=${topicSlug}` : ''}`
              : null
          }
          invited={hasRepte && convida !== '1' && !rival}
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
            progress: t.raw('progress'),
            wedge_won: t('wedge_won'),
            next_question: t('next_question'),
            back_to_wheel: t('back_to_wheel'),
            invite_title: t('invite_title'),
            invite_sub: t('invite_sub'),
            invite_start: t('invite_start'),
            invite_share: t('invite_share'),
            invite_copy: t('invite_copy'),
            invite_copied: t('invite_copied'),
            invited_banner: t('invited_banner'),
          }}
        />
      </div>
    </div>
  );
}
