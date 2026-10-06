'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';

import { useEdgeFade } from '@/lib/useEdgeFade';

/**
 * A horizontal chip row that fades the side it can still scroll towards.
 *
 * {@link useEdgeFade} is a hook, so a server-rendered row can't call it. This
 * is the thin client wrapper for those rows: the chips themselves stay server
 * components and come in as children, and only the scroller is a client
 * component.
 *
 * Use it for any row that scrolls sideways on a phone. A row that simply ends
 * at the viewport edge with half a chip showing reads as broken rather than
 * as "there is more".
 *
 * A child marked ``aria-current`` is scrolled into view on mount. Picking
 * "Vivienda" from eighteen subjects reloaded the page with the chosen chip
 * off the right-hand edge, so the row looked exactly as it had before the
 * choice and the reader had no way to tell the filter was on.
 */
export function EdgeFadeRow({
  children,
  ariaLabel,
  gap = 8,
  style,
}: {
  children: ReactNode;
  ariaLabel?: string;
  gap?: number;
  style?: CSSProperties;
}) {
  const scroller = useEdgeFade<HTMLDivElement>();
  useEffect(() => {
    const row = scroller.ref.current;
    const active = row?.querySelector<HTMLElement>('[aria-current]');
    if (!row || !active) return;
    // Centre it in the row only; `scrollIntoView` would also scroll the page.
    row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [scroller.ref]);
  return (
    <div
      ref={scroller.ref}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className={`no-scrollbar ${scroller.className}`}
      style={{
        display: 'flex',
        gap,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        paddingBottom: 2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
