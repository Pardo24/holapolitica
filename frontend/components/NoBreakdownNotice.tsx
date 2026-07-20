import { Gavel, HelpCircle, Users } from 'lucide-react';

/**
 * Explains why a vote has no per-party breakdown, in the exact slot where
 * that breakdown would otherwise sit.
 *
 * Roughly 140 of ~16,500 votes genuinely have no individual record, for
 * three different and legitimate reasons. Until now the UI simply omitted
 * the section, so those votes rendered as a different-shaped page and read
 * as broken. A stated absence is information; a silent one looks like a
 * bug — and on a site whose whole claim is "we show you the receipts", an
 * unexplained gap is exactly the wrong impression to leave.
 *
 * The three reasons are distinguished because they are not equivalent:
 * assent means no vote was taken at all, a secret ballot means the vote
 * happened but the Congress does not publish who cast what, and a gap
 * means the source data is missing on our side. Readers deserve to know
 * which one they are looking at.
 */
export type NoBreakdownReason = 'assent' | 'secret' | 'unavailable';

const ICON = {
  assent: Gavel,
  secret: Users,
  unavailable: HelpCircle,
} as const;

export function NoBreakdownNotice({
  reason,
  title,
  body,
}: {
  reason: NoBreakdownReason;
  title: string;
  body: string;
}) {
  const Icon = ICON[reason];
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '14px 16px',
        border: '1px solid var(--rule)',
        borderLeft: '3px solid var(--rule-strong)',
        borderRadius: 10,
        background: 'var(--paper)',
      }}
    >
      <Icon
        size={18}
        strokeWidth={1.8}
        aria-hidden="true"
        style={{ color: 'var(--ink-3)', flex: 'none', marginTop: 1 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
          {title}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {body}
        </p>
      </div>
    </div>
  );
}

/**
 * One-line variant for dense list rows (the session sheet), where the full
 * card would outweigh the row it explains. Same purpose: the reader sees a
 * stated reason where the party logos would be, not a blank.
 */
export function NoBreakdownInline({
  reason,
  label,
}: {
  reason: NoBreakdownReason;
  label: string;
}) {
  const Icon = ICON[reason];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        fontSize: 11.5,
        fontStyle: 'italic',
        color: 'var(--ink-3)',
      }}
    >
      <Icon size={12} strokeWidth={1.9} aria-hidden="true" style={{ flex: 'none' }} />
      {label}
    </span>
  );
}

/**
 * Which of the three reasons applies to a vote.
 *
 * ``hasBreakdown`` is whether any per-group record came back. The secret
 * -ballot case is detected from the subject line because the Congress does
 * not flag it in the feed: dictámenes of the Comisión del Estatuto de los
 * Diputados are voted by secret ballot under the Reglamento, so totals are
 * published but never the individual votes. Everything else with no
 * records is a genuine gap on our side and says so.
 */
export function noBreakdownReason({
  approvedByAssent,
  hasBreakdown,
  subject,
}: {
  /** Optional on the API type; absent is treated as "not by assent". */
  approvedByAssent: boolean | undefined;
  hasBreakdown: boolean;
  subject: string | null | undefined;
}): NoBreakdownReason | null {
  if (hasBreakdown) return null;
  if (approvedByAssent) return 'assent';
  if (/estatuto de los diputados/i.test(subject ?? '')) return 'secret';
  return 'unavailable';
}
