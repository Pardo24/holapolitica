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
