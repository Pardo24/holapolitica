import Link from 'next/link';

import { groupAbbreviation, readableTextOn } from '@/lib/groups';

/**
 * Round colored disc with the group's abbreviation — a minimal, neutral
 * stand-in for an official party logo. Pairs with :file:`GroupChip` when
 * you want both the badge and the readable name; use the badge alone in
 * dense layouts (cohesion bars, vote rows, deputy avatars).
 *
 * When ``logoUrl`` is provided (NULL for every group in production
 * today — see backend migration ``0019_group_logo_url``), the image is
 * rendered inside the circular frame instead of the abbreviation disc.
 * The frame, ring, and accessibility attributes are kept identical so
 * the badge is interchangeable for layout purposes.
 */
export function GroupBadge({
  slug,
  color,
  size = 'md',
  link = true,
  logoUrl,
}: {
  slug: string;
  color: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  link?: boolean;
  /**
   * Optional URL to an official group logo. When set, the badge
   * renders the image clipped to the circular frame instead of the
   * abbreviation disc. Falls back to the disc on load error via the
   * ``onError`` handler so an unreachable logo never leaves a broken
   * tile on the page.
   */
  logoUrl?: string | null;
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
  const inner = logoUrl ? (
    // Logos go through plain <img> for the same reason deputy photos
    // do (see frontend/app/persons/[id]/page.tsx): they're externally
    // hosted with predictable dimensions and don't need Next/Image's
    // remote-domain allowlisting + optimiser pass. Lazy + decoded
    // async so dense badge lists (e.g. cohesion table) don't block
    // first paint.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={`${abbrev} (${slug})`}
      title={abbrev}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className="inline-block rounded-full border select-none"
      style={{
        width: px,
        height: px,
        objectFit: 'cover',
        background: '#fff',
        borderColor: 'rgba(0,0,0,.06)',
      }}
    />
  ) : (
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
