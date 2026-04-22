import type { VoteResult } from '@/lib/api';

const CLASS_BY_RESULT: Record<VoteResult, string> = {
  approved: 'badge badge-aye',
  rejected: 'badge badge-no',
  tie: 'badge badge-tie',
};

export function ResultPill({
  result,
  label,
}: {
  result: VoteResult;
  label: string;
}) {
  return (
    <span className={CLASS_BY_RESULT[result]} style={{ fontWeight: 600 }}>
      {label}
    </span>
  );
}
