'use client';

/**
 * Client-side controller for :file:`VotesCalendarStrip` that owns the
 * "tap a date → navigate" wiring.
 *
 * Lives in its own file (instead of merging into the strip) so the strip
 * stays pure UI and the navigation policy is reusable in other surfaces.
 *
 * The active date and the days list come from the server. The
 * controller drives router navigation only.
 *
 * Optimistic UI: tapping a cell flips `optimisticDate` immediately so
 * the visual selection happens on the same frame as the touch. The
 * navigation itself runs inside a transition so React keeps the page
 * interactive; while `isPending` is true we mark the next sibling —
 * the votes list — as busy, dimming it and letting the parent show
 * its skeleton overlay. The router's eventual server response
 * replaces the prop, which we sync back into local state.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  VotesCalendarStrip,
  type CalendarDay,
} from '@/components/VotesCalendarStrip';

export function VotesCalendarStripController({
  days,
  activeDate,
  allLabel,
  countSuffix,
}: {
  days: CalendarDay[];
  activeDate: string | null;
  allLabel: string;
  countSuffix: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [optimisticDate, setOptimisticDate] = useState<string | null>(activeDate);
  const [isPending, startTransition] = useTransition();

  // When the server re-renders (after router.push completes) the
  // ``activeDate`` prop is the source of truth; sync the optimistic
  // mirror so a /votes refresh started elsewhere (browser back, link
  // tap) is reflected here too.
  useEffect(() => {
    setOptimisticDate(activeDate);
  }, [activeDate]);

  // Toggle a body-level class while the transition is pending so any
  // downstream consumer (the votes list, the active-filter chips) can
  // dim or show a skeleton without needing context plumbing.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('hp-filter-pending', isPending);
    return () => {
      document.body.classList.remove('hp-filter-pending');
    };
  }, [isPending]);

  const handleSelect = useCallback(
    (date: string | null) => {
      // Instant visual feedback: the strip flips to the new selection
      // on the same frame as the tap. The navigation below runs inside
      // a transition, so React keeps the rest of the page interactive
      // even while the new server data is in flight.
      setOptimisticDate(date);
      // Preserve every existing search param (topic, proposing_group_slug,
      // result, q) so the calendar tap stacks with the other filters
      // instead of resetting them.
      const next = new URLSearchParams(sp.toString());
      if (date) {
        next.set('date_from', date);
        next.set('date_to', date);
      } else {
        next.delete('date_from');
        next.delete('date_to');
      }
      // Tab must remain 'votes' so the user lands back on the list view,
      // even if they were on 'topics' when the calendar was rendered.
      next.set('tab', 'votes');
      // Reset pagination on any date change.
      next.delete('page');
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/votes?${qs}` : '/votes');
      });
    },
    [router, sp],
  );

  return (
    <VotesCalendarStrip
      days={days}
      activeDate={optimisticDate}
      onSelect={handleSelect}
      allLabel={allLabel}
      countSuffix={countSuffix}
    />
  );
}
