import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Split } from 'lucide-react';

import type { PersonVoteItem, PersonVotesPage } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';
import { topicIcon } from '@/lib/topic_icons';
import { localizeSubgroupText } from '@/lib/voteStage';

const CHOICE_TONE: Record<string, string> = {
  aye: 'var(--aye)',
  no: 'var(--no)',
  abstention: 'var(--abst)',
};

/**
 * A deputy's votes, one per row: the law in plain words, what they voted,
 * what their group voted, and how it ended. Rows where they broke with
 * their group say so in words, not only in colour.
 *
 * Shared by the "Votacions" and "Trenca amb el grup" tabs of the profile
 * (backend GET /persons/{id}/votes); the topic chips and the pager are
 * links, so the list works without JavaScript and can be shared.
 */
export async function PersonVotes({
  data,
  locale,
  baseHref,
  topicSlug,
  topics,
  dissentTab,
}: {
  data: PersonVotesPage | null;
  locale: string;
  /** The tab's URL, without page or topic. */
  baseHref: string;
  topicSlug: string | null;
  /** The deputy's busiest topics, already named in the reader's language. */
  topics: { slug: string; name: string; color: string | null }[];
  dissentTab: boolean;
}) {
  const t = await getTranslations('person');
  const tSession = await getTranslations('session_sheet');
  const tVotes = await getTranslations('votes');
  const tStage = await getTranslations('vote_stage');

  const href = (opts: { tema?: string | null; page?: number }) => {
    const qs = new URLSearchParams(baseHref.split('?')[1] ?? '');
    if (opts.tema) qs.set('tema', opts.tema);
    if (opts.page && opts.page > 1) qs.set('page', String(opts.page));
    return `${baseHref.split('?')[0]}?${qs.toString()}` as Route;
  };
  const choiceLabel = (c: string | null) =>
    c === 'aye'
      ? tSession('choice_aye')
      : c === 'no'
        ? tSession('choice_no')
        : c === 'abstention'
          ? tSession('choice_abstention')
          : tSession('choice_absent');

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="dep-votes">
      <p className="dep-votes__intro">
        {dissentTab ? t('dissent_intro') : t('votes_intro')}
      </p>

      {topics.length > 0 && (
        <nav className="dep-votes__topics" aria-label={t('filter_topics_aria')}>
          <Link href={href({})} className={!topicSlug ? 'is-active' : undefined}>
            {t('filter_all_topics')}
          </Link>
          {topics.map((tp) => (
            <Link
              key={tp.slug}
              href={href({ tema: tp.slug })}
              className={topicSlug === tp.slug ? 'is-active' : undefined}
              style={{ ['--topic' as string]: tp.color ?? 'var(--ink-3)' }}
            >
              {tp.name}
            </Link>
          ))}
        </nav>
      )}

      {!data || data.items.length === 0 ? (
        <p className="dep-votes__empty">
          {dissentTab && !topicSlug ? t('dissent_none') : t('votes_empty')}
        </p>
      ) : (
        <>
          <p className="dep-votes__count tabular">{t('votes_count', { n: data.total })}</p>
          <ul className="dep-votes__list">
            {data.items.map((v) => (
              <VoteRow
                key={v.vote_id}
                v={v}
                locale={locale}
                choiceLabel={choiceLabel}
                stageLabel={
                  v.stage === 'point'
                    ? localizeSubgroupText(v.subgroup_text, locale)
                    : v.stage && v.stage !== 'final'
                      ? tStage(v.stage)
                      : null
                }
                labels={{
                  voted: t('voted_label'),
                  group: t('group_label'),
                  dissent: t('dissent_badge'),
                  result: tVotes(`result.${v.result}` as 'result.approved'),
                }}
              />
            ))}
          </ul>
          {lastPage > 1 && (
            <nav className="profile-pager" aria-label={t('pager_aria')}>
              {data.page > 1 ? (
                <Link href={href({ tema: topicSlug, page: data.page - 1 })}>
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t('pager_prev')}
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular">
                {data.page} / {lastPage}
              </span>
              {data.page < lastPage ? (
                <Link href={href({ tema: topicSlug, page: data.page + 1 })}>
                  {t('pager_next')}
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function VoteRow({
  v,
  locale,
  choiceLabel,
  stageLabel,
  labels,
}: {
  v: PersonVoteItem;
  /** Which step of the law it was (consideration, point 3...), if not the final text. */
  stageLabel: string | null;
  locale: string;
  choiceLabel: (c: string | null) => string;
  labels: { voted: string; group: string; dissent: string; result: string };
}) {
  const title = (locale === 'es' ? v.title_es : v.title_ca) ?? v.title_ca ?? v.title_es ?? v.subject;
  const date = new Date(v.voted_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const Icon = v.topic ? topicIcon(v.topic.icon) : null;
  const cast = v.choice in CHOICE_TONE;
  return (
    <li className={v.dissent ? 'dep-vote is-dissent' : 'dep-vote'}>
      <div className="dep-vote__meta">
        <span className="tabular">{date}</span>
        {v.topic && (
          <span className="dep-vote__topic" style={{ ['--topic' as string]: v.topic.color_hex ?? 'var(--ink-3)' }}>
            {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
            {pickTopicName(v.topic, locale)}
          </span>
        )}
        {stageLabel && <span className="dep-vote__stage">{stageLabel}</span>}
        <span className={`dep-vote__result dep-vote__result--${v.result}`}>{labels.result}</span>
      </div>
      <Link href={`/votes/${v.vote_id}` as Route} className="dep-vote__title">
        {title}
      </Link>
      <div className="dep-vote__stances">
        <span
          className={cast ? 'dep-vote__choice' : 'dep-vote__choice is-absent'}
          style={{ ['--choice' as string]: CHOICE_TONE[v.choice] ?? 'var(--ink-3)' }}
        >
          {labels.voted}: <strong>{choiceLabel(v.choice)}</strong>
        </span>
        {v.group && v.group_majority && (
          <span className="dep-vote__group">
            <span className="dep-vote__dot" style={{ background: v.group.color_hex ?? 'var(--ink-3)' }} aria-hidden="true" />
            {labels.group} ({displayGroupShort(v.group.name_short)}): <strong>{choiceLabel(v.group_majority)}</strong>
          </span>
        )}
        {v.dissent && (
          <span className="dep-vote__dissent">
            <Split size={13} strokeWidth={2.2} aria-hidden="true" />
            {labels.dissent}
          </span>
        )}
      </div>
    </li>
  );
}
