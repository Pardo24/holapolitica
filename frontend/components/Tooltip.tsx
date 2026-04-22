/**
 * Inline tooltip for unfamiliar parliamentary terms. Pure CSS — no JS.
 *
 * Trigger is a `<span tabindex="0">` (not an `<a>`) so the component is
 * safe to nest inside another link without producing invalid HTML —
 * `<a>` cannot contain `<a>`. The bubble is plain explanatory text
 * (pointer-events: none) so a stretched-link card click still passes
 * through. Users wanting the full glossary visit /about.
 *
 * Hover or tab-focus shows the bubble.
 */
export function Tooltip({
  term,
  explanation,
}: {
  term: React.ReactNode;
  explanation: string;
}) {
  return (
    <span className="term-tooltip">
      <span className="term-tooltip__anchor" tabIndex={0} role="button" aria-haspopup="true">
        {term}
      </span>
      <span className="term-tooltip__bubble" role="tooltip">
        {explanation}
      </span>
    </span>
  );
}
