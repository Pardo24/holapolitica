'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Plain-language summary affordance with two interaction modes, switched
 * by CSS media queries on pointer capability (NOT by React feature
 * detection or viewport width):
 *
 *  - **Hover-capable devices** (`@media (hover: hover)`): hover/focus on
 *    the dashed-underlined title shows a tooltip bubble. CSS-only.
 *  - **Touch-only devices** (`@media (hover: none)`): a small "i" button
 *    appears next to the title. Tapping it toggles an inline expansion
 *    panel below the title — implemented as a native `<details>` element.
 *    A click handler manually toggles the `open` attribute AND prevents
 *    the default action so a parent stretched-link / `<a>` row link does
 *    not navigate when the user taps the trigger.
 *
 * Two text sources, prioritized: ``summary`` (LLM, neutral) → ``fallback``
 * (raw description). The text is rendered ONCE per render mode and reused
 * as the single source of truth via a shared `body` fragment.
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const t = useTranslations('summary_hover');

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
  const eyebrowLabel = isLLM ? t('eyebrow_llm') : t('eyebrow_raw');

  const body = (
    <>
      <span
        className={isLLM ? 'eyebrow no-rule warm' : 'eyebrow no-rule muted'}
        style={{ fontSize: 9, display: 'block', marginBottom: 6 }}
      >
        {eyebrowLabel}
      </span>
      <span className="summary-hover__body">{showText}</span>
      {provider && isLLM && (
        <span className="summary-hover__provider">
          {t('provider_caption', { provider })}
        </span>
      )}
    </>
  );

  // Tap handler: cancel both defaults (link navigation AND the browser's
  // native <details> toggle) and toggle manually. This keeps the trigger
  // safe to nest inside an <a>row-link.
  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = detailsRef.current;
    if (el) el.open = !el.open;
  };

  return (
    <span className="summary-hover">
      <span className="summary-hover__anchor">{children}</span>

      {/* Touch-only inline accordion. Native <details> for ARIA/semantics
          but click is handled manually so we can stop ancestor link
          activation. CSS scopes visibility to (hover: none). */}
      <details ref={detailsRef} className="summary-hover__details">
        <summary
          className="summary-hover__btn"
          aria-label={t('tap_aria')}
          onClick={handleToggle}
        >
          <span aria-hidden="true">i</span>
        </summary>
        <span className="summary-hover__panel" role="region">
          {body}
        </span>
      </details>

      {/* Hover-capable tooltip bubble — CSS scopes this to (hover: hover)
          and the existing summary-hover:hover/focus-within rules. Shares
          the SAME body fragment as the inline panel. */}
      <span className="summary-hover__bubble" role="tooltip">
        {body}
      </span>
    </span>
  );
}
