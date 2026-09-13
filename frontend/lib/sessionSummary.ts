import type { Vote } from '@/lib/api';

/**
 * Collapse a set of votes into the INITIATIVES they decided and report
 * each one's real fate.
 *
 * Why this exists: a Proyecto de Ley is voted once per amendment. The
 * 14 July 2026 disability bill took 50 votes: 47 amendments voted down
 * one by one, then the whole text approved 179-33. Counting raw vote rows
 * made the session read "50 puntos · aprobado 5 · rechazado 45", i.e.
 * "Congress rejected 45 things", when the truth was "one law, and it
 * passed". Amendment and item-by-item votes are procedure; what a
 * citizen is owed is the count of MATTERS and how each ended.
 *
 * An initiative's fate is its LAST vote (chronological, then sequence),
 * the whole-text vote that follows the amendments. Votes without an
 * expediente each count as their own matter.
 *
 * Shared by the pleno sheet (lede, topic sections) and the home
 * "último pleno" card so every summary of a session counts the same way.
 */
export function summariseLaws(votes: readonly Vote[]): {
  laws: number;
  approved: number;
  rejected: number;
  tie: number;
} {
  const byLaw = new Map<string, Vote[]>();
  for (const v of votes) {
    const key = v.expediente_raw ?? `vote-${v.id}`;
    const list = byLaw.get(key);
    if (list) list.push(v);
    else byLaw.set(key, [v]);
  }
  let approved = 0;
  let rejected = 0;
  let tie = 0;
  for (const list of byLaw.values()) {
    const final = [...list].sort(
      (a, b) =>
        a.voted_at.localeCompare(b.voted_at) ||
        (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
    )[list.length - 1]!;
    if (final.result === 'approved') approved += 1;
    else if (final.result === 'rejected') rejected += 1;
    else tie += 1;
  }
  return { laws: byLaw.size, approved, rejected, tie };
}
