'use client';

import { ChevronDown } from 'lucide-react';

/**
 * A gentle "start here ↓" cue for the mobile home. It replaced the
 * floating daily-question toast: instead of an interruptive overlay, an
 * inviting affordance that smooth-scrolls down to the party grid, where a
 * curious visitor can start investigating. Client component only for the
 * scroll behaviour; it degrades to a plain in-page anchor without JS.
 *
 * The chevron bobs to signal "there's more below", but holds still under
 * ``prefers-reduced-motion``.
 */
export function ScrollDownCue({ targetId, label }: { targetId: string; label: string }) {
  const onClick = (e: React.MouseEvent) => {
    const el = document.getElementById(targetId);
    if (!el) return; // fall through to the anchor's default jump
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <a href={`#${targetId}`} onClick={onClick} className="scroll-cue" aria-label={label}>
      <span className="scroll-cue__label">{label}</span>
      <span className="scroll-cue__chev" aria-hidden="true">
        <ChevronDown size={18} strokeWidth={2.4} />
      </span>
      <style>{`
        .scroll-cue {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin: 4px auto 22px;
          padding: 6px 8px;
          width: fit-content;
          text-decoration: none;
          color: var(--ink-2);
          -webkit-tap-highlight-color: transparent;
        }
        .scroll-cue__label {
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .scroll-cue__chev {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          color: var(--accent);
          background: color-mix(in oklch, var(--accent) 12%, var(--paper));
          animation: scroll-cue-bob 1.8s ease-in-out infinite;
        }
        .scroll-cue:active .scroll-cue__chev {
          background: color-mix(in oklch, var(--accent) 20%, var(--paper));
        }
        @keyframes scroll-cue-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .scroll-cue__chev { animation: none; }
        }
      `}</style>
    </a>
  );
}
