'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, Sparkles } from 'lucide-react';

/**
 * Click-to-expand plain-language explanation for a law row. Replaces the
 * old hover tooltip (which felt out of place and clipped inside the
 * line-clamped title). Renders a quiet toggle button; clicking it opens
 * a curated panel inline at the bottom of the row, in the same visual
 * language as the detail page (serif body, "Explicació resumida"
 * heading, AI-generated badge, source caveat).
 *
 * Lives OUTSIDE the row's <Link> so there's no nested-interactive markup
 * and the toggle never triggers navigation.
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

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="law-summary-toggle"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px 4px 8px',
          borderRadius: 999,
          border: '1px solid var(--rule-strong)',
          background: open ? 'var(--paper-2)' : 'transparent',
          color: 'var(--ink-2)',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          lineHeight: 1.3,
        }}
      >
        {open ? (
          <Minus size={13} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Plus size={13} strokeWidth={2} aria-hidden="true" />
        )}
        {t('plain_summary_title')}
      </button>

      {open && (
        <div
          role="region"
          style={{
            marginTop: 10,
            padding: '14px 16px',
            borderRadius: 12,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderLeft: '3px solid var(--accent)',
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
    </div>
  );
}
