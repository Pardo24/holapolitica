'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scroller with ◂ ▸ controls and a hidden scrollbar.
 *
 * Server-rendered cards/rows are passed as ``children`` (RSC-safe). The
 * scroller is a ``<ul role="list">`` so ``<li>`` children stay valid.
 *
 * The controls live in a small header row ABOVE the strip, aligned
 * right — never overlaid on the content, so no arrow can cover the
 * first card (the old floating buttons did exactly that). Both buttons
 * are always rendered for a stable layout; the one that can't scroll
 * further is disabled and dimmed.
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
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth - 1;
      setOverflows(el.scrollWidth > el.clientWidth + 1);
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

  const navBtn = (dir: 1 | -1, enabled: boolean, label: string) => (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={() => scrollByDir(dir)}
      className="scroll-carousel-nav"
      style={{
        opacity: enabled ? 1 : 0.35,
        cursor: enabled ? 'pointer' : 'default',
      }}
    >
      {dir === -1 ? (
        <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div>
      {/* Controls row — only when the strip actually overflows. */}
      {overflows && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {navBtn(-1, canLeft, prevLabel)}
          {navBtn(1, canRight, nextLabel)}
        </div>
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
    </div>
  );
}
