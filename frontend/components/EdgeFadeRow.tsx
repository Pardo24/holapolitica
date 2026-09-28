'use client';

import type { CSSProperties, ReactNode } from 'react';

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
