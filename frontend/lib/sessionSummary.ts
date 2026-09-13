import type { Vote, VoteResult } from '@/lib/api';

/**
 * Session-level reading of the Congreso's votes: what kind of item each
 * vote belongs to, where in its procedure it sits, which vote decides it,
 * and how it ended. Shared by the pleno sheet and the home "último pleno"
 * card so every summary of a sitting reads the data the same way.
 */

/**
 * Where in its procedure a vote sits, read from the Congreso's subject
 * line (``title``). Three stages change what "approved/rejected" means:
 *
 * - ``taking``: toma en consideración. Approving it only lets a bill
 *   START its passage; it is not a law yet.
 * - ``totality``: debate de totalidad. The vote is on the amendments to
 *   the whole text; rejecting them means the bill GOES AHEAD.
 * - ``convalidation``: a government decree-law kept (convalidado) or
 *   repealed (derogado). Its follow-up "Tramitación como Proyecto de
 *   Ley" vote is an ordinary one.
 */
export type VoteStage = 'taking' | 'totality' | 'convalidation' | 'other';

export function voteStage(v: Pick<Vote, 'title' | 'description'>): VoteStage {
  const title = (v.title ?? '').toLowerCase();
  if (title.startsWith('toma en consideración')) return 'taking';
  if (title.startsWith('debate de totalidad') || title.startsWith('debates de totalidad')) {
    return 'totality';
  }
  if (title.startsWith('convalidación o derogación')) {
    const desc = (v.description ?? '').toLowerCase();
    return desc.startsWith('tramitación como proyecto') ? 'other' : 'convalidation';
  }
  return 'other';
}

/**
 * The outcome for the INITIATIVE that a single vote implies. Only a
 * debate de totalidad inverts it: the vote is on the amendments, so
 * rejecting them means the bill carries on.
 */
export function stageOutcome(v: Vote): VoteResult {
  if (voteStage(v) === 'totality' && v.result !== 'tie') {
    return v.result === 'approved' ? 'rejected' : 'approved';
  }
  return v.result;
}

/**
 * What a vote can DO, which is how the pleno list is grouped:
 * ``laws`` create or change law, ``motions`` (mociones, PNL) state a
 * position without changing any law, ``procedures`` are everything
 * else (treaties, reports, committees). ``initiative_type`` decides when
 * present; older rows without it fall back on the subject line.
 */
export type VoteKind = 'laws' | 'motions' | 'procedures';

const LAW_SUBJECT_PREFIXES = [
  'presupuestos generales',
  'dictámenes de comisiones sobre iniciativas legislativas',
  'enmiendas del senado',
  'toma en consideración de proposiciones de ley',
  'debate de totalidad',
  'debates de totalidad',
  'convalidación o derogación',
  'tramitación directa y en lectura única de iniciativas',
  'acuerdo de tramitación directa y en lectura única de iniciativas',
  'avocación de iniciativas legislativas',
];

export function voteKind(v: Pick<Vote, 'initiative_type' | 'title'>): VoteKind {
  switch (v.initiative_type) {
    case 'proyecto_ley':
    case 'proposicion_ley':
    case 'real_decreto_ley':
      return 'laws';
    case 'mocion':
    case 'proposicion_no_ley':
    case 'interpelacion':
      return 'motions';
    default:
      break;
  }
  const title = (v.title ?? '').toLowerCase();
  if (title.startsWith('mociones') || title.startsWith('proposiciones no de ley')) {
    return 'motions';
  }
  if (LAW_SUBJECT_PREFIXES.some((p) => title.startsWith(p))) return 'laws';
  return 'procedures';
}

/** The item a vote belongs to: its expediente, else its initiative. */
export function initiativeKey(v: Vote): string {
  if (v.expediente_raw) return v.expediente_raw;
  return v.initiative_id != null ? `initiative-${v.initiative_id}` : `vote-${v.id}`;
}

const chronological = (a: Vote, b: Vote): number =>
  a.voted_at.localeCompare(b.voted_at) ||
  (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0);

/**
 * The vote that decides an item voted several times in one sitting:
 * normally the LAST one (the whole-text vote after the amendments); for a
 * decree-law, the convalidation vote, not the "tramitar como proyecto"
 * vote that follows it.
 */
export function fateVote(votes: readonly Vote[]): Vote {
  const ordered = [...votes].sort(chronological);
  const convalidations = ordered.filter((v) => voteStage(v) === 'convalidation');
  if (convalidations.length > 0) return convalidations[convalidations.length - 1]!;
  return ordered[ordered.length - 1]!;
}

/**
 * How an item ended in the sitting. A motion or PNL voted point by point
 * counts as approved when at least one point passed: the points that pass
 * become the chamber's position.
 */
export function fateResult(votes: readonly Vote[]): VoteResult {
  const first = votes[0];
  if (first && votes.length > 1 && voteKind(first) === 'motions') {
    if (votes.some((v) => v.result === 'approved')) return 'approved';
    return votes.every((v) => v.result === 'tie') ? 'tie' : 'rejected';
  }
  return stageOutcome(fateVote(votes));
}

/**
 * Collapse a set of votes into the ITEMS they decided and report each
 * one's real fate.
 *
 * Why this exists: a Proyecto de Ley is voted once per amendment. The
 * 14 July 2026 sitting had 5 items and 50 votes; counting raw vote rows
 * made it read "aprobado 5 · rechazado 45", i.e. "Congress rejected 45
 * things". Amendment and item-by-item votes are procedure; what a citizen
 * is owed is the count of MATTERS and how each ended (see ``fateResult``).
 */
export function summariseLaws(votes: readonly Vote[]): {
  laws: number;
  approved: number;
  rejected: number;
  tie: number;
} {
  const byItem = new Map<string, Vote[]>();
  for (const v of votes) {
    const key = initiativeKey(v);
    const list = byItem.get(key);
    if (list) list.push(v);
    else byItem.set(key, [v]);
  }
  let approved = 0;
  let rejected = 0;
  let tie = 0;
  for (const list of byItem.values()) {
    const result = fateResult(list);
    if (result === 'approved') approved += 1;
    else if (result === 'rejected') rejected += 1;
    else tie += 1;
  }
  return { laws: byItem.size, approved, rejected, tie };
}
