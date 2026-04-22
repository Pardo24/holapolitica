'use client';

import { useEffect, useState } from 'react';

/**
 * Plain-language summary affordance with two interaction modes:
 *
 *  - **Desktop (≥721px)**: hover/focus on the dashed-underlined title shows
 *    a tooltip bubble (CSS-only). Same as before.
 *  - **Mobile (≤720px)**: a small "ⓘ" button appears next to the title.
 *    Tapping it opens a bottom-sheet modal with the full summary. Tapping
 *    a list row still navigates to the detail; the button stops
 *    propagation so it doesn't trigger the row's stretched link.
 *
 * Two text sources, prioritized: ``summary`` (LLM, neutral) → ``fallback``
 * (raw description). Renders nothing extra when both are empty.
 */
export function SummaryHover({
  summary,
  fallback,
  provider,
  children,
}: {
  summary?: string | null;
  fallback?: string | null;
  provider?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sourceText = (summary ?? '').trim();
  const fallbackText = (fallback ?? '').trim();
  const visible = (text: string) =>
    typeof children === 'string' ? text === children.trim() : false;

  const showText = sourceText
    ? sourceText
    : fallbackText && !visible(fallbackText)
      ? fallbackText
      : '';

  if (!showText) return <>{children}</>;

  const isLLM = !!sourceText;

  return (
    <>
      <span className="summary-hover">
        <span className="summary-hover__anchor">{children}</span>
        <button
          type="button"
          className="summary-hover__btn"
          aria-label="Veure resum en llenguatge planer"
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <span aria-hidden="true">i</span>
        </button>
        {/* Desktop tooltip — hidden on mobile via media query */}
        <span className="summary-hover__bubble" role="tooltip">
          <span
            className={isLLM ? 'eyebrow no-rule warm' : 'eyebrow no-rule muted'}
            style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
          >
            {isLLM ? 'En llenguatge planer' : 'Text de l\'expedient'}
          </span>
          <span className="summary-hover__body">{showText}</span>
          {provider && isLLM && (
            <span className="summary-hover__provider">
              Resum automàtic per {provider}
            </span>
          )}
        </span>
      </span>

      {/* Mobile bottom sheet — controlled by state. Renders nothing until
          opened, no portal needed. The backdrop is fixed full-screen and
          dismisses on tap. */}
      {open && (
        <div
          className="summary-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="summary-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="summary-sheet__close"
              aria-label="Tanca"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
            <span
              className={isLLM ? 'eyebrow no-rule warm' : 'eyebrow no-rule muted'}
              style={{ fontSize: 10, display: 'block', marginBottom: 12 }}
            >
              {isLLM ? 'En llenguatge planer' : 'Text de l\'expedient'}
            </span>
            <p className="summary-sheet__body">{showText}</p>
            {provider && isLLM && (
              <p className="summary-sheet__provider">
                Resum automàtic per {provider}. Pot contenir imprecisions; el text legal és la font autoritzada.
              </p>
            )}
            <p
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid var(--rule)',
                fontStyle: 'italic',
                margin: '18px 0 0',
              }}
            >
              Toca a fora del panell o el botó ✕ per tancar. Toca la fila per veure el detall complet.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
