'use client';

/**
 * Fully client-side variant of the pair-coincidence widget on /stats.
 *
 * Why this exists separately from the server-rendered widget:
 *   The original picker called ``router.replace(?pair_a=…)`` on every
 *   change, which forced a full SSR re-render of the (heavy) /stats
 *   route. Even with the 5-min fetch cache, that round-trip felt
 *   sluggish on mobile.
 *
 * This component owns ``pairA`` / ``pairB`` in local state. Changes
 * are reflected instantly from the already-loaded ``coincidence``
 * matrix; the URL is synced lazily through ``useTransition`` so the
 * page state remains shareable but the UI never blocks on the round
 * trip.
 */

import type { Route } from 'next';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import type {
  CoincidenceCell,
  ParliamentaryGroupSummary,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

function lookupCoincidence(
  cells: CoincidenceCell[],
  a: string,
  b: string,
): CoincidenceCell | null {
  for (const c of cells) {
    if (
      (c.group_a_slug === a && c.group_b_slug === b) ||
      (c.group_a_slug === b && c.group_b_slug === a)
    ) {
      return c;
    }
  }
  return null;
}

export function PairCoincidenceClient({
  allGroups,
  coincidence,
  initialPairA,
  initialPairB,
}: {
  allGroups: ParliamentaryGroupSummary[];
  coincidence: CoincidenceCell[];
  initialPairA: string;
  initialPairB: string;
}) {
  // useTranslations works in Client Components because the next-intl
  // provider is mounted at the root layout. The previous version
  // received a serialized ``labels`` object — including function refs
  // for the count-aware captions — but Next 15 refuses to ship
  // functions across the server/client boundary, which surfaced as a
  // generic 500 on /stats. Reading translations here keeps the bridge
  // serialization-clean (only the primitive props are crossed).
  const t = useTranslations('dashboard');
  const tFilter = useTranslations('stats_filter');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [pairA, setPairA] = useState(initialPairA);
  const [pairB, setPairB] = useState(initialPairB);

  const hasBoth = pairA && pairB && pairA !== 'all' && pairB !== 'all';
  const sameGroup = hasBoth && pairA === pairB;
  const cell = useMemo(
    () =>
      hasBoth && !sameGroup ? lookupCoincidence(coincidence, pairA, pairB) : null,
    [coincidence, hasBoth, pairA, pairB, sameGroup],
  );
  const pct =
    cell && cell.coincidence != null ? Math.round(cell.coincidence * 100) : null;
  const groupA = allGroups.find((g) => g.slug === pairA) ?? null;
  const groupB = allGroups.find((g) => g.slug === pairB) ?? null;

  // Sync the picked pair into the URL — lazy, non-blocking. The local
  // state above has already updated the widget; the URL update just
  // makes the state shareable / reloadable.
  function syncUrl(nextA: string, nextB: string) {
    const next = new URLSearchParams(sp.toString());
    if (nextA && nextA !== 'all') next.set('pair_a', nextA);
    else next.delete('pair_a');
    if (nextB && nextB !== 'all') next.set('pair_b', nextB);
    else next.delete('pair_b');
    const qs = next.toString();
    startTransition(() => {
      const url = (qs ? `${pathname}?${qs}` : pathname) as Route;
      router.replace(url, { scroll: false });
    });
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <label style={pickerLabel}>
          <span style={pickerLabelText}>{tFilter('pair_group_a')}</span>
          <GroupCombobox
            name="pair_a"
            value={pairA && pairA !== 'all' ? pairA : ''}
            onChange={(slug) => {
              setPairA(slug);
              syncUrl(slug, pairB);
            }}
            groups={allGroups}
            emptyValue=""
            clearLabel="—"
            placeholder={tFilter('pair_pick_first_placeholder')}
            ariaLabel={tFilter('pair_pick_first_aria')}
          />
        </label>
        <label style={pickerLabel}>
          <span style={pickerLabelText}>{tFilter('pair_group_b')}</span>
          <GroupCombobox
            name="pair_b"
            value={pairB && pairB !== 'all' ? pairB : ''}
            onChange={(slug) => {
              setPairB(slug);
              syncUrl(pairA, slug);
            }}
            groups={allGroups}
            emptyValue=""
            clearLabel="—"
            placeholder={tFilter('pair_pick_second_placeholder')}
            ariaLabel={tFilter('pair_pick_second_aria')}
          />
        </label>
      </div>

      {!hasBoth && <p style={emptyHint}>{t('pair_hint_pick')}</p>}
      {sameGroup && (
        <p style={emptyHint}>
          {t('pair_hint_same_prefix')}
          <em>{t('pair_hint_same_em')}</em>
          {t('pair_hint_same_suffix')}
        </p>
      )}
      {hasBoth && !sameGroup && pct == null && (
        <p style={emptyHint}>{t('pair_hint_insufficient')}</p>
      )}
      {hasBoth && !sameGroup && pct != null && groupA && groupB && (
        <PairResult
          groupA={groupA}
          groupB={groupB}
          pct={pct}
          votesCompared={cell?.votes_compared ?? 0}
        />
      )}
    </div>
  );
}

function PairResult({
  groupA,
  groupB,
  pct,
  votesCompared,
}: {
  groupA: ParliamentaryGroupSummary;
  groupB: ParliamentaryGroupSummary;
  pct: number;
  votesCompared: number;
}) {
  const t = useTranslations('dashboard');
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <GroupBadge slug={groupA.slug} color={groupA.color_hex} size="sm" link={false} />
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('pair_and')}</span>
        <GroupBadge slug={groupB.slug} color={groupB.color_hex} size="sm" link={false} />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>
          {displayGroupShort(groupA.name_short)} · {displayGroupShort(groupB.name_short)}
        </span>
      </div>
      <div
        className="serif tabular"
        style={{
          fontSize: 52,
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}
        <span style={{ fontSize: 22, marginLeft: 2 }}>%</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '8px 0 12px' }}>
        {t('pair_caption', { count: votesCompared })}
      </p>
      <div
        style={{
          display: 'flex',
          height: 14,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--paper-3)',
        }}
      >
        <span style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        <span style={{ width: `${100 - pct}%`, background: 'var(--paper-3)' }} />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--ink-3)',
          marginTop: 4,
        }}
      >
        <span>{t('pair_same_direction')}</span>
        <span>{t('pair_divergent', { pct: 100 - pct })}</span>
      </div>
    </div>
  );
}

// Glossary term re-exposed here so the eyebrow stays consistent with
// the server widget's wording.
export function PairCoincidenceEyebrow({ suffix }: { suffix: string }) {
  return (
    <>
      <GlossaryTerm term="Coincidència">Coincidència</GlossaryTerm> {suffix}
    </>
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
const emptyHint: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-3)',
  lineHeight: 1.4,
  margin: 0,
};
