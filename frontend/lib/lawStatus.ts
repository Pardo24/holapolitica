/**
 * Lifecycle-status presentation for initiatives, shared by the compact row
 * ({@link InitiativeRow}) and the big card ({@link LawCard}) so the two can
 * never disagree about what "approved" looks like.
 *
 * A status is a STATE ("submitted", "in_debate"), not a tally. When the
 * state is non-terminal but a linked vote exists, callers prefer the vote
 * result: the portal's imported status is unreliable for Reial Decret Llei,
 * whose rows stay "submitted" forever even after convalidation.
 */

export const STATUS_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

export const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

/** States that are a real verdict; for these the status IS the outcome. */
export const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'withdrawn', 'expired']);

/** Whether to show the linked vote's result instead of the lifecycle status. */
export function prefersVoteResult(status: string, latestVoteResult: string | null): boolean {
  return latestVoteResult != null && !TERMINAL_STATUSES.has(status);
}

/** Which list an initiative belongs in: still going, decided, or neither. */
export type LawBucket = 'pending' | 'voted' | 'other';

/** Terminal states that are not a verdict: nothing was decided, but it is over. */
const CLOSED_WITHOUT_VERDICT = new Set(['withdrawn', 'expired']);

/**
 * The outcome to show for an initiative, and the list it belongs in.
 *
 * These exist because the two used to be decided by different rules. A
 * card called {@link prefersVoteResult} and printed "Aprovada" when the
 * portal's status was stale; the topic page sorted the very same row into
 * its "Per votar" tab by reading the status alone. The reader met a card
 * marked "Aprovada" inside a list headed "still to be voted", which is not
 * a subtlety about procedure, it is the page contradicting itself.
 *
 * One rule now: if a roll call has happened, the initiative is voted, and
 * the result of that roll call is what both the chip and the tab honour.
 */
export function lawBucket(status: string, latestVoteResult: string | null): LawBucket {
  if (status === 'approved' || status === 'rejected') return 'voted';
  if (CLOSED_WITHOUT_VERDICT.has(status)) return 'other';
  return latestVoteResult != null ? 'voted' : 'pending';
}

/**
 * The verdict a reader should be shown, or null while nothing is decided.
 * Mirrors {@link lawBucket}: a row is 'voted' exactly when this is non-null.
 */
export function effectiveResult(
  status: string,
  latestVoteResult: string | null,
): 'approved' | 'rejected' | 'tie' | null {
  if (status === 'approved' || status === 'rejected') return status;
  if (CLOSED_WITHOUT_VERDICT.has(status)) return null;
  if (latestVoteResult === 'approved' || latestVoteResult === 'rejected') return latestVoteResult;
  return latestVoteResult === 'tie' ? 'tie' : null;
}
