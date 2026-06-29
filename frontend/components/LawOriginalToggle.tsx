'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Sparkles } from 'lucide-react';

/**
 * Inline "see the original legal text" affordance for a law row whose
 * headline is the AI plain-language summary. The summary leads (it is the
 * row title); this small trigger reveals the raw official title beneath,
 * so the dense legal language is one tap away on every device instead of
 * being the default wall-of-text.
 *
 * Lives INSIDE the row link, so the trigger is a `<span role="button">`
 * (not a `<button>`, invalid inside an `<a>`) and both the trigger and the
 * revealed panel stop click propagation so the row never navigates when
 * you interact with them. The panel uses flex-basis:100% so it wraps onto
 * its own line below the inline meta chips.
 *
 * Honesty: a sparkle marks that the headline above is AI-generated, and the
 * revealed panel carries the provider caveat — the legal text shown here is
 * the authoritative source.
 */
export function LawOriginalToggle({
  original,
  provider,
}: {
  original: string;
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

  const label = t('show_original');

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        }}
        className="law-original-toggle"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 999,
          border: '1px solid var(--rule-strong)',
          background: open ? 'var(--paper-2)' : 'transparent',
          color: 'var(--ink-2)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: 'pointer',
          flex: 'none',
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <Sparkles size={10} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--accent)' }} />
        {label}
        <ChevronDown
          size={11}
          strokeWidth={2}
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
        />
      </span>

      {open && (
        <div
          role="region"
          onClick={(e) => e.stopPropagation()}
          style={{
            flexBasis: '100%',
            marginTop: 8,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderLeft: '3px solid var(--rule-strong)',
            cursor: 'auto',
          }}
        >
          <div
            className="eyebrow"
            style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 8 }}
          >
            {label}
          </div>
          <p
            className="serif"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--ink-2)',
              margin: 0,
            }}
          >
            {original}
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
