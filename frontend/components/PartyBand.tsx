import Link from 'next/link';
import type { Route } from 'next';

import type { ParliamentaryGroupSummary } from '@/lib/api';
import { groupLogoUrl } from '@/lib/groupLogos';
import { displayGroupShort, groupAbbreviation } from '@/lib/groups';

/**
 * Full-width strip of every parliamentary group — logo, seat count, and
 * the party's own brand colour as a top rail — each card linking to its
 * group page.
 *
 * Two jobs at once. First, traffic: the per-party pages (voting record,
 * cohesion, manifesto vs. votes) were only reachable from a nav entry or
 * from inside a vote, so almost nobody landed on them. This puts all of
 * them one click from the home page. Second, colour: the site is
 * deliberately near-monochrome, and the eight party brand colours are the
 * one palette that is *editorially free* — it isn't our design choice, it
 * is how the parties identify themselves.
 *
 * Neutral by construction: groups render in seat order, every group gets
 * an identical card, and nothing is highlighted or ranked beyond the seat
 * count the chamber itself produces.
 */
export function PartyBand({
  groups,
  title,
  caption,
  seatsLabel,
  seeAllLabel,
  variant = 'band',
}: {
  groups: ParliamentaryGroupSummary[];
  title: string;
  caption: string;
  /** Pluralisable "escons" label, already resolved by the caller. */
  seatsLabel: (n: number) => string;
  seeAllLabel?: string;
  /**
   * ``band`` — full-bleed tinted section, for the home page.
   * ``plain`` — inline, no background, for use inside a page that already
   * has its own header (the deputies + parties hub).
   */
  variant?: 'band' | 'plain';
}) {
  if (groups.length === 0) return null;
  // Seat order — the chamber's own ranking, not ours.
  const ordered = [...groups].sort((a, b) => b.members_active - a.members_active);
  const band = variant === 'band';

  return (
    <section
      aria-label={title}
      style={
        band
          ? {
              // Full-bleed tinted band, same trick as the hero: negative
              // inline margins reach the viewport edges, matching padding
              // puts the content back on the grid.
              marginInline: 'calc(50% - 50vw)',
              paddingInline: 'calc(50vw - 50%)',
              marginTop: 48,
              paddingTop: 30,
              paddingBottom: 32,
              background: 'var(--hue-partits-soft)',
              borderTop: '1px solid var(--rule)',
              borderBottom: '1px solid var(--rule)',
            }
          : { marginTop: 4, marginBottom: 28 }
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <h2 className="h-headline" style={{ margin: 0, fontSize: band ? 26 : 21 }}>
          {title}
        </h2>
        {seeAllLabel && (
          <Link
            href={'/el-teu-diputat' as Route}
            style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}
          >
            {seeAllLabel} →
          </Link>
        )}
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 620 }}>
        {caption}
      </p>

      <ul className="party-band" role="list">
        {ordered.map((g) => {
          const logo = groupLogoUrl(g.slug);
          const color = g.color_hex ?? 'var(--ink-3)';
          return (
            <li key={g.slug} style={{ minWidth: 0, display: 'flex' }}>
              <Link
                href={`/groups/${g.slug}` as Route}
                className="party-band__card"
                // The layout-critical properties live INLINE, not only in
                // the stylesheet. A user's browser rendered these cards
                // with the class's decoration applied but its layout
                // dropped — cards shrunk to their content at unequal
                // sizes, left-aligned. Whatever ate the rule (an
                // extension, an engine quirk, a stale cache), inline
                // styles are immune to all of it: they travel WITH the
                // element and outrank any stylesheet. The class keeps
                // only what is cosmetic and safe to lose (shadow, hover,
                // radius, the rail).
                style={{
                  ['--party' as string]: color,
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  minHeight: 132,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span className="party-band__rail" aria-hidden="true" />
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt=""
                    width={40}
                    height={40}
                    // Eager on purpose: these are 1-2KB SVGs and the band
                    // is primary content near the fold. lazy-loading them
                    // saved nothing and made Edge's data-saver intervention
                    // swap them for placeholders on slow connections.
                    decoding="async"
                    className="party-band__logo"
                  />
                ) : (
                  // GP Mixto has no shared brand and ships no logo. A bare
                  // colour disc reads as an image that failed to load, so we
                  // put the group's canonical abbreviation inside it — the
                  // same "Mx" GroupBadge uses everywhere else on the site.
                  <span
                    aria-hidden="true"
                    className="party-band__logo party-band__logo--text"
                    // Fully self-sufficient: size, shape and type are
                    // inline so the disc reads as a badge even if the
                    // stylesheet never arrives. Without them it collapsed
                    // to bare text.
                    style={{
                      background: color,
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                      flex: 'none',
                    }}
                  >
                    {groupAbbreviation(g.slug)}
                  </span>
                )}
                <span
                  className="party-band__name"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'center',
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    marginTop: 8,
                  }}
                >
                  {displayGroupShort(g.name_short)}
                </span>
                <span
                  className="party-band__seats tabular"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'center',
                    marginTop: 'auto',
                    paddingTop: 8,
                  }}
                >
                  <b>{g.members_active}</b> {seatsLabel(g.members_active)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

    </section>
  );
}
