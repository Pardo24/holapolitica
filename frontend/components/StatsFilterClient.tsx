'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { GroupCombobox } from '@/components/GroupCombobox';
import { TopicCombobox } from '@/components/TopicCombobox';
import type { ParliamentaryGroupSummary, Topic } from '@/lib/api';

/**
 * Client-side filter pickers used inside MobileStatsDashboard.
 *
 * Why: the previous ``<form method="GET">`` POSTed a full server navigation
 * and lost the user's scroll position. We now update the URL via
 * ``router.replace`` with ``{ scroll: false }`` so Next preserves scroll
 * while re-rendering the server components with the new searchParams.
 * The URL stays the single source of truth — these components keep no
 * React state of their own.
 */

const TOPIC_PARAM = 'topic';
const GROUP_PARAM = 'group';
const PAIR_A_PARAM = 'pair_a';
const PAIR_B_PARAM = 'pair_b';
const ALL_SENTINEL = 'all';

function buildHref(
  pathname: string,
  current: URLSearchParams,
  changes: Record<string, string>,
): Route {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value && value !== ALL_SENTINEL && value !== '') {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }
  const qs = next.toString();
  // typedRoutes can't infer dynamic query strings — same escape hatch used
  // in stats/page.tsx (see ``buildTabHref``).
  return (qs ? `${pathname}?${qs}` : pathname) as Route;
}

/** Topic picker shared by widgets 2 and 5; updates ``?topic=…`` in place. */
export function StatsTopicFilter({
  allTopics,
  selectedTopic,
  ariaLabel,
  placeholder,
  clearLabel,
}: {
  allTopics: Topic[];
  selectedTopic: string;
  ariaLabel?: string;
  placeholder?: string;
  clearLabel?: string;
}) {
  const t = useTranslations('stats_filter');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const handleChange = (slug: string) => {
    const href = buildHref(pathname, params, { [TOPIC_PARAM]: slug });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <TopicCombobox
      name={TOPIC_PARAM}
      value={selectedTopic}
      onChange={handleChange}
      topics={allTopics}
      emptyValue={ALL_SENTINEL}
      clearLabel={clearLabel ?? t('topic_clear')}
      placeholder={placeholder ?? t('topic_placeholder')}
      ariaLabel={ariaLabel ?? t('topic_aria')}
    />
  );
}

/** Group picker for the mobile dashboard — updates ``?group=…`` in place,
 *  mirroring {@link StatsTopicFilter}. Lets the phone user scope the
 *  initiatives view to one parliamentary group. */
export function StatsGroupFilter({
  allGroups,
  selectedGroup,
  ariaLabel,
  placeholder,
  clearLabel,
}: {
  allGroups: ParliamentaryGroupSummary[];
  selectedGroup: string;
  ariaLabel?: string;
  placeholder?: string;
  clearLabel?: string;
}) {
  const t = useTranslations('stats_filter');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const handleChange = (slug: string) => {
    const href = buildHref(pathname, params, { [GROUP_PARAM]: slug });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <GroupCombobox
      name={GROUP_PARAM}
      value={selectedGroup && selectedGroup !== ALL_SENTINEL ? selectedGroup : ''}
      onChange={handleChange}
      groups={allGroups}
      emptyValue=""
      clearLabel={clearLabel ?? t('group_clear')}
      placeholder={placeholder ?? t('group_placeholder')}
      ariaLabel={ariaLabel ?? t('group_aria')}
    />
  );
}

/** Pair picker for widget 4 — each combobox updates its param independently.
 *  The underlying coincidence cell is symmetric so order doesn't matter. */
export function StatsPairFilter({
  allGroups,
  pairA,
  pairB,
}: {
  allGroups: ParliamentaryGroupSummary[];
  pairA: string;
  pairB: string;
}) {
  const t = useTranslations('stats_filter');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = (key: string) => (slug: string) => {
    const href = buildHref(pathname, params, { [key]: slug });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={pickerLabel}>
        <span style={pickerLabelText}>{t('pair_group_a')}</span>
        <GroupCombobox
          name={PAIR_A_PARAM}
          value={pairA && pairA !== ALL_SENTINEL ? pairA : ''}
          onChange={set(PAIR_A_PARAM)}
          groups={allGroups}
          emptyValue=""
          clearLabel="—"
          placeholder={t('pair_pick_first_placeholder')}
          ariaLabel={t('pair_pick_first_aria')}
        />
      </label>
      <label style={pickerLabel}>
        <span style={pickerLabelText}>{t('pair_group_b')}</span>
        <GroupCombobox
          name={PAIR_B_PARAM}
          value={pairB && pairB !== ALL_SENTINEL ? pairB : ''}
          onChange={set(PAIR_B_PARAM)}
          groups={allGroups}
          emptyValue=""
          clearLabel="—"
          placeholder={t('pair_pick_second_placeholder')}
          ariaLabel={t('pair_pick_second_aria')}
        />
      </label>
    </div>
  );
}

const pickerLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const pickerLabelText: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};
