'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';

/**
 * Inline "explain this law" affordance for a law row. Renders a small
 * round icon button that sits inline at the end of the row's meta line
 * (like the old mobile "i"), and — when tapped — drops the plain-language
 * explanation full-width directly beneath, in the same card language as
 * the detail page (serif body, AI-generated badge, source caveat).
 *
 * Lives INSIDE the row link, so the trigger is a `<span role="button">`
 * (not a `<button>`, which is invalid inside an `<a>`) and both the
 * trigger and the panel stop click propagation so the row never
 * navigates when you interact with them. The panel uses flex-basis:100%
 * so it wraps onto its own line below the inline chips.
 */
export function LawSummaryPanel({
  summary,
  provider,
}: {
  summary: string;
  provider?: string | null;
}) {
  const t = useTranslations('votes');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);

  const toggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const label = t('plain_summary_title');

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        }}
        className="law-summary-toggle"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1px solid var(--rule-strong)',
          background: open ? 'var(--accent)' : 'transparent',
          color: open ? 'var(--paper)' : 'var(--accent)',
          cursor: 'pointer',
          flex: 'none',
          pointerEvents: 'auto',
        }}
      >
        <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
      </span>

      {open && (
        <div
          role="region"
          onClick={(e) => e.stopPropagation()}
          style={{
            flexBasis: '100%',
            marginTop: 8,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderLeft: '3px solid var(--accent)',
            cursor: 'auto',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              background: 'color-mix(in oklch, var(--accent) 12%, var(--paper))',
              border: '1px solid color-mix(in oklch, var(--accent) 25%, var(--paper))',
              marginBottom: 10,
            }}
          >
            <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
            {t('plain_summary_ai_badge')}
          </div>
          <p
            className="serif"
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--ink)',
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {summary}
          </p>
          {provider && (
            <p
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                margin: '8px 0 0',
                fontStyle: 'italic',
              }}
            >
              {tc('plain_summary_caveat', { provider })}
            </p>
          )}
        </div>
      )}
    </>
  );
}
