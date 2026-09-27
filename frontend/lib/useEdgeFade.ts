'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tell a horizontal scroller to fade the edge it can still scroll towards.
 *
 * Chip rows (topics, audiences, results) scroll sideways on a phone, but a
 * row that simply ends at the viewport edge with half a chip visible reads
 * as broken content rather than as "there is more". The fade is applied
 * only while there IS more in that direction, so a row that fits shows no
 * fade at all and nothing looks clipped.
 *
 * Returns the ref to put on the scrolling element and the class to add to
 * it (see ``.edge-fade-*`` in globals.css).
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // A couple of pixels of slack: sub-pixel widths otherwise leave a fade
    // switched on at the very end of the scroll.
    setLeft(el.scrollLeft > 2);
    setRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  const className = left && right ? 'edge-fade-both' : right ? 'edge-fade-right' : left ? 'edge-fade-left' : '';

  return { ref, className };
}
