import Link from 'next/link';

import { displayGroupShort } from '@/lib/groups';

/**
 * Small visual identity chip for a parliamentary group.
 *
 * The colored swatch on the left is the group's brand color (seeded in
 * migration 0006). When `slug` is provided, the chip is rendered as a link
 * to the group detail page; otherwise it's a static label.
 *
 * When ``logoUrl`` is provided, a small clipped logo image is rendered
 * in place of the colored swatch. NULL in production today — see
 * backend migration ``0019_group_logo_url`` for the rationale on why we
 * default to the neutral disc.
 *
 * Used inline in vote rows ("Proposat per …"), in the cohesion table, and
 * as the primary visual on the group list page.
 */
export function GroupChip({
  slug,
  short,
  color,
  size = 'sm',
  logoUrl,
}: {
  slug?: string | null;
  short: string;
  color?: string | null;
  size?: 'xs' | 'sm' | 'md';
  logoUrl?: string | null;
}) {
  const sizeClasses = {
    xs: 'text-[11px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-1 gap-1.5',
    md: 'text-sm px-2.5 py-1 gap-2',
  }[size];
  const dotSize = { xs: 'w-2 h-2', sm: 'w-2.5 h-2.5', md: 'w-3 h-3' }[size];
  const dotPx = { xs: 8, sm: 10, md: 12 }[size];
  // When a logo URL is set we swap the colored disc for a tiny image of
  // the same diameter so the chip's layout doesn't reflow. Sized in
  // pixels because Tailwind's w-/h- utilities don't give us a stable
  // metric to match the disc's diameter — the eyeballs need to match.
  const swatch = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      width={dotPx}
      height={dotPx}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-full border"
      style={{
        width: dotPx,
        height: dotPx,
        objectFit: 'cover',
        background: '#fff',
        borderColor: 'rgba(0,0,0,.06)',
      }}
      aria-hidden="true"
    />
  ) : (
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
