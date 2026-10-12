import type {
  HemicycleLayout,
  HemicycleSeat,
  VoteHemicycleLayout,
  VoteHemicycleSeat,
} from '@/lib/api';

/**
 * The seat fields components/Hemicycle.tsx reads. The chart is a client
 * component, so the layout it is given travels in the page payload: 350
 * seats, where every unused field costs ~350 copies. Pages hand it
 * ``chartLayout(layout)`` rather than the API row.
 */
export type ChartSeat = Omit<HemicycleSeat, 'role_title' | 'role_kind'>;
export type ChartVoteSeat = ChartSeat & Pick<VoteHemicycleSeat, 'vote_choice'>;
export type ChartLayout = Omit<HemicycleLayout, 'seats'> & { seats: ChartSeat[] };
export type ChartVoteLayout = Omit<VoteHemicycleLayout, 'seats'> & { seats: ChartVoteSeat[] };

function chartSeat(s: HemicycleSeat): ChartSeat {
  return {
    person_id: s.person_id,
    full_name: s.full_name,
    photo_url: s.photo_url,
    group_slug: s.group_slug,
    group_short: s.group_short,
    group_color: s.group_color,
    seat_x: s.seat_x,
    seat_y: s.seat_y,
    constituency: s.constituency,
  };
}

export function chartLayout(layout: HemicycleLayout): ChartLayout {
  return { ...layout, seats: layout.seats.map(chartSeat) };
}

export function chartVoteLayout(layout: VoteHemicycleLayout): ChartVoteLayout {
  return {
    ...layout,
    seats: layout.seats.map((s) => ({ ...chartSeat(s), vote_choice: s.vote_choice })),
  };
}
