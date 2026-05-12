'use client';

/**
 * Compact row of chips that reflects the currently-applied filters
 * on the votes list. Each chip shows the human label of the active
 * value with a small × button that removes only that filter, leaving
 * every other filter intact via URLSearchParams rewriting.
 *
 * Sits between the calendar strip and the filter form on the votes
 * page. Renders nothing when no filter is active, so the page chrome
 * doesn't carry empty rows.
 *
 * Why this is a client component: the × actions navigate via the
 * router. The filter labels themselves are passed in as already-
 * localised strings, so the server can keep the i18n work.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { X } from 'lucide-react';

export interface ActiveFilter {
  /** URL param to remove when the × is tapped. */
  paramKey: string;
  /** Optional secondary URL param removed together (e.g. date_to with date_from). */
  pairParamKey?: string;
  /** Short label shown on the chip ("Habitatge", "PSOE", "Aprovades"…). */
  label: string;
  /** Optional accent colour swatch (topic colour, group colour). */
  color?: string | null;
}

export function ActiveFilterChips({
  filters,
  clearAllLabel,
}: {
  filters: ActiveFilter[];
  clearAllLabel: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const removeOne = useCallback(
    (paramKey: string, pairParamKey?: string) => {
      const next = new URLSearchParams(sp.toString());
      next.delete(paramKey);
      if (pairParamKey) next.delete(pairParamKey);
      next.delete('page');
      const qs = next.toString();
      router.push(qs ? `/votes?${qs}` : '/votes');
    },
    [router, sp],
  );

  const clearAll = useCallback(() => {
    // Preserve the tab anchor so the user stays on the same view.
    const next = new URLSearchParams();
    const tab = sp.get('tab');
    if (tab) next.set('tab', tab);
    const qs = next.toString();
    router.push(qs ? `/votes?${qs}` : '/votes');
  }, [router, sp]);

  if (filters.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '6px 0 10px',
      }}
    >
      {filters.map((f) => (
        <button
          key={f.paramKey}
          type="button"
          onClick={() => removeOne(f.paramKey, f.pairParamKey)}
          className="active-filter-chip"
          aria-label={`Treure filtre: ${f.label}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px 4px 10px',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            lineHeight: 1.3,
          }}
        >
          {f.color && (
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: f.color,
                flex: 'none',
              }}
            />
          )}
          <span>{f.label}</span>
          <X size={12} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
        </button>
      ))}
      {filters.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="active-filter-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'transparent',
            border: '1px dashed var(--rule)',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <X size={12} aria-hidden="true" />
          {clearAllLabel}
        </button>
      )}
      <style>{`
        .active-filter-chip:hover { border-color: var(--ink-2); }
        .active-filter-chip:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
