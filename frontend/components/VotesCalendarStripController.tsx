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
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

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

  const handleSelect = useCallback(
    (date: string | null) => {
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
      router.push(qs ? `/votes?${qs}` : '/votes');
    },
    [router, sp],
  );

  return (
    <VotesCalendarStrip
      days={days}
      activeDate={activeDate}
      onSelect={handleSelect}
      allLabel={allLabel}
      countSuffix={countSuffix}
    />
  );
}
