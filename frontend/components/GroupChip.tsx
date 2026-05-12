import Link from 'next/link';

import { displayGroupShort } from '@/lib/groups';

/**
 * Small visual identity chip for a parliamentary group.
 *
 * The colored swatch on the left is the group's brand color (seeded in
 * migration 0006). When `slug` is provided, the chip is rendered as a link
 * to the group detail page; otherwise it's a static label.
 *
 * Used inline in vote rows ("Proposat per …"), in the cohesion table, and
 * as the primary visual on the group list page.
 */
export function GroupChip({
  slug,
  short,
  color,
  size = 'sm',
}: {
  slug?: string | null;
  short: string;
  color?: string | null;
  size?: 'xs' | 'sm' | 'md';
}) {
  const sizeClasses = {
    xs: 'text-[11px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-1 gap-1.5',
    md: 'text-sm px-2.5 py-1 gap-2',
  }[size];
  const dotSize = { xs: 'w-2 h-2', sm: 'w-2.5 h-2.5', md: 'w-3 h-3' }[size];
  const swatch = (
    <span
      className={`${dotSize} rounded-full shrink-0 inline-block`}
      style={{ background: color ?? '#9ca3af' }}
      aria-hidden="true"
    />
  );
  const inner = (
    <span
      className={`inline-flex items-center rounded border ${sizeClasses} font-medium`}
    >
      {swatch}
      <span className="truncate">{displayGroupShort(short)}</span>
    </span>
  );
  if (slug) {
    // Subtle hover affordance: faint underline + 1px accent ring so the
    // chip reads as a real link target without disrupting the calm rhythm
    // of the surrounding row.
    return (
      <Link href={`/groups/${slug}`} className="group-chip-link no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}
