import type { VoteResult } from '@/lib/api';

const CLASS_BY_RESULT: Record<VoteResult, string> = {
  approved: 'badge badge-aye',
  rejected: 'badge badge-no',
  tie: 'badge badge-tie',
};

const COLOR_VAR_BY_RESULT: Record<VoteResult, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  tie: 'var(--abst)',
};

/**
 * Result pill for a vote outcome.
 *
 *  - Default (everywhere): the labeled soft pill ("Aprovada" / etc.).
 *  - With `responsive`: on mobile (<640px) the pill collapses to a 12px
 *    colored disc with no text; on desktop the labeled pill is shown.
 *    Use this in list rows where horizontal space is tight. The label is
 *    still exposed via `aria-label` so screen readers keep parity.
 *
 *    Approved → solid filled circle var(--aye)
 *    Rejected → solid filled circle var(--no)
 *    Tie      → outlined circle var(--abs)
 */
export function ResultPill({
  result,
  label,
  responsive = false,
}: {
  result: VoteResult;
  label: string;
  responsive?: boolean;
}) {
  if (!responsive) {
    return (
      <span className={CLASS_BY_RESULT[result]} style={{ fontWeight: 600 }}>
        {label}
      </span>
    );
  }

  const color = COLOR_VAR_BY_RESULT[result];
  const isTie = result === 'tie';
  return (
    <>
      {/* Mobile: icon-only chip */}
      <span
        className="sm:hidden inline-block align-middle"
        role="img"
        aria-label={label}
        title={label}
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: isTie ? 'transparent' : color,
          border: isTie ? `2px solid ${color}` : '0',
          boxSizing: 'border-box',
        }}
      />
      {/* Desktop: existing labeled pill */}
      <span className={`${CLASS_BY_RESULT[result]} hidden sm:inline-flex`} style={{ fontWeight: 600 }}>
        {label}
      </span>
    </>
  );
}
