'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scroller with ◂ ▸ buttons and a hidden scrollbar.
 *
 * Server-rendered cards/rows are passed as ``children`` (RSC-safe). The
 * scroller is a ``<ul role="list">`` so ``<li>`` children stay valid.
 * Buttons appear only when there's something to scroll to in that
 * direction — so there's no dangling "blur"/arrow at the start. Replaces
 * the old edge-fade gradients (which showed a left fade even at scroll
 * position 0) and the visible native scrollbar.
 */
export function ScrollCarousel({
  children,
  ariaLabel,
  gap = 12,
  snap = true,
  prevLabel = 'Anterior',
  nextLabel = 'Següent',
}: {
  children: React.ReactNode;
  ariaLabel?: string;
  gap?: number;
  snap?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth - 1;
      setCanLeft(el.scrollLeft > 1);
      setCanRight(el.scrollLeft < max);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const scrollByDir = useCallback((dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const distance = Math.min(el.clientWidth * 0.8, 480);
    el.scrollBy({ left: dir * distance, behavior: 'smooth' });
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      {canLeft && (
        <button
          type="button"
          aria-label={prevLabel}
          onClick={() => scrollByDir(-1)}
          className="scroll-carousel-btn"
          style={{ left: -6 }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      <ul
        ref={ref}
        role="list"
        aria-label={ariaLabel}
        className="no-scrollbar"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '4px 2px 8px',
          display: 'flex',
          gap,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: snap ? 'x proximity' : undefined,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </ul>
      {canRight && (
        <button
          type="button"
          aria-label={nextLabel}
          onClick={() => scrollByDir(1)}
          className="scroll-carousel-btn"
          style={{ right: -6 }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
