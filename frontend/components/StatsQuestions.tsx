import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ChevronRight, Landmark, Tags } from 'lucide-react';

import { BottomSheet } from '@/components/BottomSheet';
import { GroupBadge } from '@/components/GroupBadge';
import { PairCoincidenceClient } from '@/components/PairCoincidenceClient';
import type {
  CoincidenceCell,
  GroupSnapshot,
  GroupSummaryRow,
  InitiativeStatusCount,
  ParliamentaryGroupSummary,
  Topic,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { STATUS_COLOR } from '@/lib/lawStatus';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * Dades, as four questions. Each card answers one thing with one picture
 * and one sentence: who votes with whom, what gets approved, how united
 * each group votes, what each group talks about. The detail (a topic, a
 * group) is one tap away, in the views the filters open.
 *
 * Symmetric by construction: every group appears in every card, ordered by
 * size (seats), never by the score being shown, so no card reads as a
 * ranking of parties.
 */
const STATUS_ORDER = ['approved', 'rejected', 'in_debate', 'submitted', 'withdrawn', 'expired'];

export async function StatsQuestions({
  byStatus,
  groupSummary,
  allGroups,
  allTopics,
  coincidence,
  snapshots,
  pairA,
  pairB,
  locale,
}: {
  byStatus: InitiativeStatusCount[];
  groupSummary: GroupSummaryRow[];
  allGroups: ParliamentaryGroupSummary[];
  allTopics: Topic[];
  coincidence: CoincidenceCell[];
  /** group slug → its snapshot (most proposed topic), null on failure. */
  snapshots: Map<string, GroupSnapshot | null>;
  pairA: string;
  pairB: string;
  locale: string;
}) {
  const t = await getTranslations('stats_q');
  const tDash = await getTranslations('dashboard');

  const bySeats = [...allGroups].sort((a, b) => b.members_active - a.members_active);
  const topicBySlug = new Map(allTopics.map((tp) => [tp.slug, tp] as const));

  // Q2: what gets approved.
  const statusRows = STATUS_ORDER.map((status) => ({
    status,
    count: byStatus.find((r) => r.status === status)?.count ?? 0,
  })).filter((r) => r.count > 0);
  const total = statusRows.reduce((n, r) => n + r.count, 0);
  const approved = statusRows.find((r) => r.status === 'approved')?.count ?? 0;

  // Q3: cohesion per group. Most groups sit above 99%, so the figure has
  // one decimal (100% for everyone said nothing) and the lede says what
  // the column shows: how many vote as a bloc.
  const cohesion = new Map(groupSummary.map((r) => [r.group_slug, r.avg_cohesion] as const));
  const withCohesion = bySeats.filter((g) => cohesion.get(g.slug) != null);
  const blocs = withCohesion.filter((g) => (cohesion.get(g.slug) ?? 0) >= 0.99).length;

  const topicsSheet = (
    <ul className="sheet-list">
      {allTopics
        .filter((tp) => tp.kind !== 'sdg')
        .map((tp) => {
          const Icon = topicIcon(tp.icon);
          return (
            <li key={tp.slug}>
              <Link href={`/stats?topic=${tp.slug}` as Route}>
                <span
                  className="sheet-row__icon"
                  aria-hidden="true"
                  style={{
                    background: `color-mix(in oklch, ${tp.color_hex ?? 'var(--ink-3)'} 16%, var(--paper))`,
                    color: tp.color_hex ?? 'var(--ink-2)',
                  }}
                >
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="sheet-row__label">{pickTopicName(tp, locale)}</span>
                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
              </Link>
            </li>
          );
        })}
    </ul>
  );
  const groupsSheet = (
    <ul className="sheet-list">
      {bySeats.map((g) => (
        <li key={g.slug}>
          <Link href={`/stats?group=${g.slug}` as Route}>
            <span style={{ flex: 'none', display: 'inline-flex', width: 34, justifyContent: 'center' }}>
              <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={g.logo_url} size="sm" link={false} />
            </span>
            <span className="sheet-row__label">{displayGroupShort(g.name_short)}</span>
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="sq">
      <div className="sq-grid">
        {/* 1. Who votes with whom. */}
        <section className="sq-card sq-card--wide" aria-labelledby="sq-1">
          <h2 id="sq-1" className="sq-card__title">{t('q1_title')}</h2>
          <p className="sq-card__lede">{t('q1_lede')}</p>
          <PairCoincidenceClient
            allGroups={allGroups}
            coincidence={coincidence}
            initialPairA={pairA}
            initialPairB={pairB}
          />
        </section>

        {/* 2. What gets approved. */}
        {total > 0 && (
          <section className="sq-card" aria-labelledby="sq-2">
            <h2 id="sq-2" className="sq-card__title">{t('q2_title')}</h2>
            <p className="sq-big">
              <span className="tabular">{approved.toLocaleString(locale)}</span>
              <span className="sq-big__of">
                {t('q2_of', { total: total.toLocaleString(locale) })}
              </span>
            </p>
            <p className="sq-card__lede">{t('q2_lede')}</p>
            <div className="sq-bar" role="img" aria-label={statusRows.map((r) => `${tDash(`status_${r.status}` as 'status_approved')} ${r.count}`).join(', ')}>
              {statusRows.map((r) => (
                <span
                  key={r.status}
                  style={{ flexGrow: r.count, background: STATUS_COLOR[r.status] ?? 'var(--nv)' }}
                />
              ))}
            </div>
            <ul className="sq-legend">
              {statusRows.map((r) => (
                <li key={r.status}>
                  <span className="sq-dot" style={{ background: STATUS_COLOR[r.status] ?? 'var(--nv)' }} />
                  {tDash(`status_${r.status}` as 'status_approved')}
                  <b className="tabular">{r.count.toLocaleString(locale)}</b>
                </li>
              ))}
            </ul>
            <Link href={'/lleis?result=approved&sort=voted' as Route} className="sq-link">
              {t('q2_link')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>
        )}

        {/* 3. How united each group votes. */}
        <section className="sq-card" aria-labelledby="sq-3">
          <h2 id="sq-3" className="sq-card__title">{t('q3_title')}</h2>
          <p className="sq-card__lede">
            {t('q3_lede_bloc', { n: blocs, total: withCohesion.length })} {t('q3_lede')}
          </p>
          <ul className="sq-rows">
            {bySeats.map((g) => {
              const c = cohesion.get(g.slug);
              const pct = c == null ? null : Math.round(c * 1000) / 10;
              return (
                <li key={g.slug}>
                  <Link href={`/stats?group=${g.slug}` as Route} className="sq-row">
                    <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={g.logo_url} size="sm" link={false} />
                    <span className="sq-row__name">{displayGroupShort(g.name_short)}</span>
                    <span className="sq-meter" aria-hidden="true">
                      <span style={{ width: `${pct ?? 0}%`, background: g.color_hex ?? 'var(--ink-3)' }} />
                    </span>
                    <span className="sq-row__value tabular">
                      {pct == null ? '-' : `${pct.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="sq-note">{t('q3_order_note')}</p>
        </section>

        {/* 4. What each group talks about. */}
        <section className="sq-card" aria-labelledby="sq-4">
          <h2 id="sq-4" className="sq-card__title">{t('q4_title')}</h2>
          <p className="sq-card__lede">{t('q4_lede')}</p>
          <ul className="sq-rows">
            {bySeats.map((g) => {
              const fact = snapshots.get(g.slug)?.most_proposed ?? null;
              const tp = fact ? topicBySlug.get(fact.topic_slug) : undefined;
              const name = tp ? pickTopicName(tp, locale) : fact?.topic_name_ca;
              return (
                <li key={g.slug}>
                  <Link
                    href={(fact ? `/stats?group=${g.slug}&topic=${fact.topic_slug}` : `/stats?group=${g.slug}`) as Route}
                    className="sq-row"
                  >
                    <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={g.logo_url} size="sm" link={false} />
                    <span className="sq-row__name">{displayGroupShort(g.name_short)}</span>
                    {fact && name ? (
                      <span className="sq-topic" style={{ ['--topic' as string]: fact.topic_color_hex ?? 'var(--ink-3)' }}>
                        {name}
                      </span>
                    ) : (
                      <span className="sq-row__value">-</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* The detail: a topic or a group, in the filtered views. */}
      <section className="sq-explore" aria-labelledby="sq-explore">
        <div>
          <h2 id="sq-explore">{t('explore_title')}</h2>
          <p>{t('explore_lede')}</p>
        </div>
        <div className="sq-explore__actions">
          <BottomSheet
            trigger={
              <>
                <Tags size={16} strokeWidth={2} aria-hidden="true" />
                {t('explore_topic')}
              </>
            }
            triggerClassName="sq-explore__btn"
            title={t('explore_topic')}
            closeLabel={t('close')}
          >
            {topicsSheet}
          </BottomSheet>
          <BottomSheet
            trigger={
              <>
                <Landmark size={16} strokeWidth={2} aria-hidden="true" />
                {t('explore_group')}
              </>
            }
            triggerClassName="sq-explore__btn"
            title={t('explore_group')}
            closeLabel={t('close')}
          >
            {groupsSheet}
          </BottomSheet>
        </div>
      </section>
    </div>
  );
}
