import Link from 'next/link';

import { groupAbbreviation, readableTextOn } from '@/lib/groups';

/**
 * Round colored disc with the group's abbreviation — a minimal, neutral
 * stand-in for an official party logo. Pairs with :file:`GroupChip` when
 * you want both the badge and the readable name; use the badge alone in
 * dense layouts (cohesion bars, vote rows, deputy avatars).
 */
export function GroupBadge({
  slug,
  color,
  size = 'md',
  link = true,
}: {
  slug: string;
  color: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  link?: boolean;
}) {
  const abbrev = groupAbbreviation(slug);
  // Scale the inner font size with both the disc size AND the abbrev length —
  // 2-3 chars get a generous size, 4+ chars are squeezed so they don't kiss
  // the edge of the circle. Letter-spacing is tightened on longer labels.
  const px = { xs: 18, sm: 24, md: 32, lg: 44 }[size];
  const lengthFactor =
    abbrev.length <= 2 ? 0.46
    : abbrev.length === 3 ? 0.40
    : abbrev.length === 4 ? 0.30
    : 0.24;
  const fontPx = Math.max(7, Math.round(px * lengthFactor));
  const tracking = abbrev.length >= 4 ? '-0.04em' : '0.01em';
  const inner = (
    <span
      role="img"
      aria-label={`${abbrev} (${slug})`}
      title={abbrev}
      className="inline-flex items-center justify-center rounded-full font-bold leading-none select-none border"
      style={{
        width: px,
        height: px,
        background: color ?? '#9ca3af',
        color: readableTextOn(color),
        fontSize: fontPx,
        letterSpacing: tracking,
        borderColor: 'rgba(0,0,0,.06)',
        padding: 0,
      }}
    >
      {abbrev}
    </span>
  );
  if (!link) return inner;
  return (
    <Link href={`/groups/${slug}`} className="no-underline hover:opacity-80">
      {inner}
    </Link>
  );
}
