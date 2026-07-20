import Link from 'next/link';
import type { Route } from 'next';

import type { ParliamentaryGroupSummary } from '@/lib/api';
import { groupLogoUrl } from '@/lib/groupLogos';
import { displayGroupShort } from '@/lib/groups';

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
            <li key={g.slug} style={{ minWidth: 0 }}>
              <Link
                href={`/groups/${g.slug}` as Route}
                className="party-band__card"
                // The brand colour drives the top rail and the hover
                // border via a custom property, so one CSS rule covers
                // every party without per-party classes.
                style={{ ['--party' as string]: color }}
              >
                <span className="party-band__rail" aria-hidden="true" />
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="party-band__logo"
                  />
                ) : (
                  // GP Mixto has no shared brand — a plain colour disc.
                  <span
                    aria-hidden="true"
                    className="party-band__logo"
                    style={{ background: color, borderRadius: 999 }}
                  />
                )}
                <span className="party-band__name">{displayGroupShort(g.name_short)}</span>
                <span className="party-band__seats tabular">
                  <b>{g.members_active}</b> {seatsLabel(g.members_active)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <style>{`
        .party-band {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          /* One rule, no breakpoints. 140px is a real floor: it is the
             width at which the longest group name we carry
             ("Plurinacional SUMAR") wraps to two lines instead of
             shattering. Auto-fit then walks 2 → 3 → 5 → 6 columns as the
             viewport grows, and no card is ever narrower than 140px:

               320px → 2 cols of 141px      480px → 3 cols of 144px
               375px → 2 cols of 168px      768px → 5 cols of 140px
               414px → 2 cols of 188px     1000px → 6 cols of 152px

             A forced 3-column rule under 520px used to override this and
             squeezed phone cards to 110px (92px on a 320px screen), which
             is where the cramping came from. Nine groups over two columns
             leaves one card alone on the last row; that is ordinary grid
             reflow, and the odd one out is whichever group the chamber
             itself ranks last, not a choice of ours. */
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          /* Every row the same height, so a group whose name wraps to two
             lines doesn't get a taller card than one that fits on one.
             Same reason the cards are identical in the first place: equal
             visual real estate for every group, regardless of size. */
          grid-auto-rows: 1fr;
          gap: 10px;
        }
        .party-band__card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 18px 10px 14px;
          border: 1px solid var(--rule);
          border-radius: 14px;
          background: var(--paper);
          color: inherit;
          text-decoration: none;
          box-shadow: var(--shadow-2);
          transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
          overflow: hidden;
          height: 100%;
        }
        .party-band__card:hover,
        .party-band__card:focus-visible {
          transform: translateY(-2px);
          box-shadow: var(--shadow-3);
          border-color: color-mix(in oklch, var(--party) 55%, var(--rule));
          outline: none;
        }
        /* The party's own colour, as a 3px cap on the card. */
        .party-band__rail {
          position: absolute;
          inset: 0 0 auto 0;
          height: 3px;
          background: var(--party);
        }
        .party-band__logo {
          width: 40px;
          height: 40px;
          object-fit: contain;
          flex: none;
        }
        .party-band__name {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.25;
          text-align: center;
          color: var(--ink);
          /* Names are multi-word and unpredictable in length. Let them
             wrap freely and, in the worst case, break inside a word
             rather than push the card wider than its grid cell. */
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
        }
        .party-band__seats {
          font-size: 11.5px;
          color: var(--ink-3);
          margin-top: auto;
        }
        .party-band__seats b { color: var(--ink-2); font-size: 13px; }
        /* Phones keep the same two-column grid the rule above produces;
           only the card gets a little tighter so two of them plus the gap
           never fight for width. The logo stays large — at 140px+ per card
           there is room for it, and it is the fastest way to recognise a
           party at a glance. */
        @media (max-width: 520px) {
          .party-band { gap: 8px; }
          .party-band__card { padding: 15px 10px 12px; border-radius: 12px; }
          .party-band__logo { width: 36px; height: 36px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .party-band__card { transition: none; }
          .party-band__card:hover, .party-band__card:focus-visible { transform: none; }
        }
      `}</style>
    </section>
  );
}
