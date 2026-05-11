import Link from 'next/link';
import type { Route } from 'next';

/**
 * Underline-style tab strip used at the top of "hub" pages (/votes, /persons)
 * to switch between sibling surfaces without leaving the route. Tabs are
 * plain URL state — bookmarkable, no JS required, SSR-friendly. The visual
 * language matches the kind-tabs already used at /topics (font weight + ink
 * underline) so the system feels uniform.
 *
 * Plain `<Link>` + active boolean — no Headless UI / Radix, as the task
 * spec mandates.
 *
 * Mobile-bug fix history: the previous implementation set
 * `borderBottom` on the parent `<nav>` AND used `marginBottom: -1` on each
 * `<Link>` to merge the active 2px ink underline with the parent's 1px
 * rule. Combined with `overflowX: 'auto'` on the nav, the children's
 * negative bottom margin extended past the nav's content box. CSS makes
 * `overflow-y` implicit `auto` when `overflow-x` is `auto`, so the 1px
 * overflow created a vertical scroll region and, on iOS/Android Chrome,
 * the bottom 1-2px of the tab box became part of a hidden scroll area
 * that swallowed taps in that strip. On a 14px-font, 12px-vertical-padded
 * tab the tap target is already tight on mobile; losing the bottom edge
 * shifted just enough that taps near the lower half of "Grups polítics"
 * either no-oped or were routed to the surface below.
 *
 * The fix moves the visual underline OFF the parent border and OFF the
 * children's negative margin entirely: the parent's bottom rule is drawn
 * with an inline `box-shadow: inset 0 -1px 0 var(--rule)` (no flow
 * effect), and the active tab paints its 2px ink underline with the same
 * trick — `box-shadow: inset 0 -2px 0 var(--ink)`. No negative margins,
 * no implicit overflow-y, no hit-area clipping. `position: relative` +
 * `z-index: 1` on each Link guards against any future sibling that
 * might overlay the strip.
 */
export function HubTabs({
  tabs,
  ariaLabel,
}: {
  tabs: { href: Route; label: string; active: boolean; sublabel?: string }[];
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="hub-tabs"
      style={{
        display: 'flex',
        gap: 0,
        marginTop: 4,
        // Bottom rule drawn as inset shadow so it never participates in
        // overflow / hit-testing. Replaces `borderBottom`.
        boxShadow: 'inset 0 -1px 0 var(--rule)',
        overflowX: 'auto',
        // Lock vertical overflow explicitly — `overflow-x: auto` alone
        // makes `overflow-y` implicit `auto`, which broke hit-testing on
        // mobile (see comment above).
        overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 18px',
            textDecoration: 'none',
            color: t.active ? 'var(--ink)' : 'var(--ink-3)',
            // Active underline drawn inside the box so it never extends
            // past the link and never demands a negative margin.
            boxShadow: t.active ? 'inset 0 -2px 0 var(--ink)' : 'none',
            fontWeight: t.active ? 600 : 500,
            whiteSpace: 'nowrap',
            flex: '0 0 auto',
            // Guarantee the tab sits above any sibling content that
            // might otherwise overlay it (search inputs, hemicycle
            // grids). Hit area is exactly the visible box.
            position: 'relative',
            zIndex: 1,
            // Prevent iOS Safari from intercepting taps as scroll
            // gestures inside the horizontally-scrollable strip.
            touchAction: 'manipulation',
          }}
          aria-current={t.active ? 'page' : undefined}
        >
          <span style={{ fontSize: 14 }}>{t.label}</span>
          {t.sublabel && (
            <span
              className="tabular"
              style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}
            >
              {t.sublabel}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
