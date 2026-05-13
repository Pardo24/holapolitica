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
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import type {
  CoincidenceCell,
  ParliamentaryGroupSummary,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

interface PairLabels {
  eyebrowSuffix: string;
  hintPick: string;
  hintSamePrefix: string;
  hintSameEm: string;
  hintSameSuffix: string;
  hintInsufficient: string;
  and: string;
  caption: (count: number) => string;
  sameDirection: string;
  divergent: (pct: number) => string;
  pickerLabelA: string;
  pickerLabelB: string;
  pickerPlaceholderA: string;
  pickerPlaceholderB: string;
  pickerAriaA: string;
  pickerAriaB: string;
}

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
  labels,
}: {
  allGroups: ParliamentaryGroupSummary[];
  coincidence: CoincidenceCell[];
  initialPairA: string;
  initialPairB: string;
  labels: PairLabels;
}) {
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
          <span style={pickerLabelText}>{labels.pickerLabelA}</span>
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
            placeholder={labels.pickerPlaceholderA}
            ariaLabel={labels.pickerAriaA}
          />
        </label>
        <label style={pickerLabel}>
          <span style={pickerLabelText}>{labels.pickerLabelB}</span>
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
            placeholder={labels.pickerPlaceholderB}
            ariaLabel={labels.pickerAriaB}
          />
        </label>
      </div>

      {!hasBoth && <p style={emptyHint}>{labels.hintPick}</p>}
      {sameGroup && (
        <p style={emptyHint}>
          {labels.hintSamePrefix}
          <em>{labels.hintSameEm}</em>
          {labels.hintSameSuffix}
        </p>
      )}
      {hasBoth && !sameGroup && pct == null && (
        <p style={emptyHint}>{labels.hintInsufficient}</p>
      )}
      {hasBoth && !sameGroup && pct != null && groupA && groupB && (
        <PairResult
          groupA={groupA}
          groupB={groupB}
          pct={pct}
          votesCompared={cell?.votes_compared ?? 0}
          labels={{
            and: labels.and,
            caption: labels.caption,
            sameDirection: labels.sameDirection,
            divergent: labels.divergent,
          }}
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
  labels,
}: {
  groupA: ParliamentaryGroupSummary;
  groupB: ParliamentaryGroupSummary;
  pct: number;
  votesCompared: number;
  labels: {
    and: string;
    caption: (count: number) => string;
    sameDirection: string;
    divergent: (pct: number) => string;
  };
}) {
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
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{labels.and}</span>
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
        {labels.caption(votesCompared)}
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
        <span>{labels.sameDirection}</span>
        <span>{labels.divergent(100 - pct)}</span>
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
