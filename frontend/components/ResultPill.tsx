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

type ResponsiveMobileVariant = 'disc' | 'text';

/**
 * Result pill for a vote outcome.
 *
 *  - Default (everywhere): the labeled soft pill ("Aprovada" / etc.).
 *  - With `responsive`: on mobile (<640px) the indicator collapses; on
 *    desktop the labeled pill is shown. The mobile variant is one of:
 *      - `'disc'` (default): a 12px colored circle with no text. Use in
 *        compact contexts where the result sits alone on a line.
 *      - `'text'`: just the label, colored (no background pill, no dot).
 *        Use inline with other text (e.g. "GP PSOE · aprovada"). Avoids
 *        the redundant "colored dot + colored text" combo the soft pill
 *        would imply.
 *    The label is always exposed via `aria-label` so screen readers
 *    keep parity.
 *
 *    Approved → solid filled circle var(--aye)
 *    Rejected → solid filled circle var(--no)
 *    Tie      → outlined circle var(--abst)
 */
export function ResultPill({
  result,
  label,
  responsive = false,
  mobileVariant = 'disc',
}: {
  result: VoteResult;
  label: string;
  responsive?: boolean;
  mobileVariant?: ResponsiveMobileVariant;
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
      {/* Mobile: either disc or coloured-text — never both, to avoid the
          redundancy of "colored dot + colored label" on one line. */}
      {mobileVariant === 'disc' ? (
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
      ) : (
        <span
          className="sm:hidden"
          style={{ color, fontWeight: 600, fontSize: 12 }}
          aria-label={label}
        >
          {label}
        </span>
      )}
      {/* Desktop: existing labeled pill */}
      <span className={`${CLASS_BY_RESULT[result]} hidden sm:inline-flex`} style={{ fontWeight: 600 }}>
        {label}
      </span>
    </>
  );
}
