'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { termDefinitionCa } from '@/lib/glossary';

/**
 * Glossary tooltip wrapper for parliamentary jargon. Looks the term up in
 * the shared definitions table (``lib/glossary.ts``) and reveals a small
 * black bubble on hover/focus. Built on the same visual idiom as the
 * existing CSS-only ``Tooltip.tsx``, but extends it with:
 *
 *   - **Keyboard accessibility:** the anchor is focusable with
 *     ``tabIndex={0}`` and exposes the definition via ``aria-describedby``.
 *     Screen readers announce the definition on focus.
 *   - **Auto-flip:** when the term sits near the bottom of the viewport
 *     the bubble flips to below instead of above so it stays on-screen.
 *     Horizontal clamp via CSS ``max-width`` keeps it on edges.
 *   - **Hover delay:** 300ms before showing so passing-by hovers don't
 *     fire the tooltip. No delay on hide.
 *
 * Falls through to plain children when the term isn't in the glossary —
 * we never leave a "?" affordance pointing at a missing definition.
 *
 * Usage:
 *
 *     <GlossaryTerm term="Cohesió de grup">Cohesió de grup</GlossaryTerm>
 *
 * The visible text and the lookup key live separately so authors can
 * style the visible label (uppercase eyebrow, etc.) while the key stays
 * canonical.
 */
export function GlossaryTerm({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const definition = termDefinitionCa(term);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [flipBelow, setFlipBelow] = useState(false);
  const [open, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide whether to flip the bubble below the anchor based on its
  // distance from the viewport top. We re-measure when the bubble is
  // about to open so the result is correct after scroll/resize without
  // attaching long-lived listeners.
  const measure = (): void => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Bubble height (~80px max for our short definitions) + 8px gap.
    const need = 96;
    setFlipBelow(rect.top < need);
  };

  const handleShow = (): void => {
    measure();
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => setOpen(true), 300);
  };

  const handleHide = (): void => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    },
    [],
  );

  if (!definition) {
    return <>{children}</>;
  }

  return (
    <span
      className={`glossary-term${flipBelow ? ' glossary-term--below' : ''}${open ? ' glossary-term--open' : ''}`}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
    >
      <span
        ref={anchorRef}
        className="glossary-term__anchor"
        tabIndex={0}
        role="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${term}: ${definition}`}
        aria-describedby={id}
      >
        {children}
      </span>
      <span
        id={id}
        className="glossary-term__bubble"
        role="tooltip"
      >
        {definition}
      </span>
    </span>
  );
}
