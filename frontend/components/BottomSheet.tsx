'use client';

import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A phone's way of asking a follow-up question: a panel that rises from the
 * bottom edge, under the thumb, over a dimmed page.
 *
 * Two shapes, one component:
 *
 *   - ``inlineOnDesktop`` (filters): on a phone the content lives in the
 *     sheet behind a trigger button; above 640px the very same DOM renders
 *     in place and the trigger disappears. One tree, so a half-typed search
 *     or a ticked chip survives a rotation, and nothing is rendered twice.
 *   - default (pickers, the "more" menu): a sheet on a phone, a centred
 *     dialog on a wider screen, where a panel glued to the bottom edge of
 *     a 1400px window would read as a cookie banner.
 *
 * It closes on the backdrop, on Escape, on a downward swipe of the handle,
 * and when a link inside it is tapped: the link takes you somewhere, and
 * arriving with the sheet still up would read as the tap not working.
 * Filter controls are not links, so the filter sheet stays up while the
 * reader ticks several, and the list behind it updates as they go.
 *
 * Except in the inline-on-desktop shape, the sheet is portalled to <body>:
 * a fixed element inside an ancestor with a transform or backdrop-filter
 * (the frosted app bar, for one) is positioned against that ancestor, not
 * the screen, and would open inside a 52px strip.
 *
 * Body scroll is locked while it is open, otherwise the page underneath
 * scrolls instead of the list the reader is flicking through.
 */
export function BottomSheet({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  closeLabel,
  children,
  inlineOnDesktop = false,
  doneLabel,
}: {
  /** The trigger's visible content (icon and/or text). */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Accessible name for icon-only triggers. */
  triggerLabel?: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
  inlineOnDesktop?: boolean;
  /** A full-width button at the foot of the sheet that just closes it. */
  doneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const pathname = usePathname();
  // Portals need a document; the sheet is closed on the server anyway.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    setDrag(0);
  }, []);

  // A link inside the sheet navigated: put it away.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    const trig = triggerRef.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      trig?.focus({ preventScroll: true });
    };
  }, [open, close]);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? startY.current) - startY.current;
    setDrag(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    if (drag > 80) close();
    else setDrag(0);
    startY.current = null;
  };

  const mode = inlineOnDesktop ? 'sheet sheet--inline-desktop' : 'sheet';

  const layer = (
    <>
      <div
        className={`sheet-backdrop${inlineOnDesktop ? ' sheet-backdrop--inline' : ''}${open ? ' sheet-backdrop--open' : ''}`}
        aria-hidden="true"
        onClick={close}
      />
      <div
        ref={panelRef}
        className={open ? `${mode} sheet--open` : mode}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? titleId : undefined}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__head"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="sheet__grabber" aria-hidden="true" />
          <span id={titleId} className="sheet__title">
            {title}
          </span>
          <button type="button" className="sheet__close no-touch-pad" onClick={close} aria-label={closeLabel}>
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div
          className="sheet__body"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a[href]')) close();
          }}
        >
          {children}
        </div>
        {doneLabel && (
          <div className="sheet__foot">
            <button type="button" className="sheet__done" onClick={close}>
              {doneLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName ?? ''} ${inlineOnDesktop ? 'sheet-trigger--mobile' : ''}`.trim()}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </button>
      {inlineOnDesktop ? layer : mounted ? createPortal(layer, document.body) : null}
    </>
  );
}
