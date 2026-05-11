/**
 * Per-group "fact cards" computed from the topic-stats endpoint. Each
 * group contributes the same number of facts to the rotation (symmetric
 * — CLAUDE.md "regla de simetria"): top-supported topic + top-rejected
 * topic, both with min-N >= 5 votes.
 *
 * The output is a flat list of cards. The carousel rotates through it in
 * the order returned (which is grouped by group, so the user sees PP-yes,
 * PP-no, PSOE-yes, PSOE-no, … never just one group).
 */

import type { ParliamentaryGroupSummary, TopicVoteStat } from '@/lib/api';

export type HighlightKind = 'most_aye' | 'most_no' | 'most_abst';

export interface Highlight {
  group_slug: string;
  group_name_short: string;
  group_color_hex: string | null;
  kind: HighlightKind;
  topic_slug: string;
  topic_name_ca: string;
  topic_color_hex: string | null;
  pct: number;
  /** Cast = Sí + No + Abst (excludes no-vote). The denominator. */
  cast_total: number;
}

const MIN_N = 5;
const STRONG_THRESHOLD = 0.7; // 70%

/** For a single group's per-topic stats, pick the topic with the most Sí, the
 *  most No, and (only if it crosses the strong threshold) the most Abstenció.
 */
function pickHighlightsForGroup(
  group: ParliamentaryGroupSummary,
  rows: TopicVoteStat[],
): Highlight[] {
  const eligible = rows.filter((r) => r.cast >= MIN_N);
  if (eligible.length === 0) return [];

  type Scored = { row: TopicVoteStat; pct: number };
  const ayeRanked: Scored[] = eligible
    .map((row) => ({ row, pct: row.ayes / row.cast }))
    .sort((a, b) => b.pct - a.pct);
  const noRanked: Scored[] = eligible
    .map((row) => ({ row, pct: row.noes / row.cast }))
    .sort((a, b) => b.pct - a.pct);
  const abstRanked: Scored[] = eligible
    .map((row) => ({ row, pct: row.abstentions / row.cast }))
    .sort((a, b) => b.pct - a.pct);

  const out: Highlight[] = [];
  const top = (kind: HighlightKind, list: Scored[]): Highlight | null => {
    if (list.length === 0) return null;
    const { row, pct } = list[0]!;
    return {
      group_slug: group.slug,
      group_name_short: group.name_short,
      group_color_hex: group.color_hex,
      kind,
      topic_slug: row.topic_slug,
      topic_name_ca: row.topic_name_ca,
      topic_color_hex: row.topic_color_hex,
      pct,
      cast_total: row.cast,
    };
  };
  const a = top('most_aye', ayeRanked);
  const n = top('most_no', noRanked);
  if (a) out.push(a);
  if (n) out.push(n);

  // Only include "most abstaining" if it crosses the strong threshold —
  // otherwise it's just statistical noise.
  const ab = top('most_abst', abstRanked);
  if (ab && ab.pct >= STRONG_THRESHOLD) out.push(ab);

  return out;
}

/** Interleave so consecutive cards alternate groups, not pile up by group. */
function interleave(perGroup: Highlight[][]): Highlight[] {
  const out: Highlight[] = [];
  const max = Math.max(...perGroup.map((g) => g.length), 0);
  for (let i = 0; i < max; i++) {
    for (const group of perGroup) {
      const card = group[i];
      if (card) out.push(card);
    }
  }
  return out;
}

export function buildHighlights(
  groups: ParliamentaryGroupSummary[],
  topicStatsByGroup: Map<string, TopicVoteStat[]>,
): Highlight[] {
  const perGroup = groups
    .map((g) => pickHighlightsForGroup(g, topicStatsByGroup.get(g.slug) ?? []))
    .filter((g) => g.length > 0);
  return interleave(perGroup);
}

export function highlightHeadline(h: Highlight): string {
  switch (h.kind) {
    case 'most_aye':
      return 'Tema amb més suport';
    case 'most_no':
      return 'Tema amb més rebuig';
    case 'most_abst':
      return 'Tema amb més abstenció';
  }
}
