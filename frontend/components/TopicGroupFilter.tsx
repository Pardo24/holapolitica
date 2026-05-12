'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useEffect, useRef, useState, useTransition } from 'react';

import { GroupCombobox } from '@/components/GroupCombobox';
import type { ParliamentaryGroupSummary } from '@/lib/api';

/**
 * Inline filter rail rendered above the initiative list on the topic
 * detail page. Wraps :file:`GroupCombobox` for typeahead group selection
 * plus a debounced free-text input for title-substring filtering, and
 * adds two affordances the bare combobox doesn't:
 *
 *   1. Submits the selected slug / query straight to the URL
 *      (``?group=<slug>&q=<query>``) so filtering happens server-side
 *      via the existing SSR render — no client-side list mutation, no
 *      skeleton flicker.
 *   2. Shows a compact result count + a "clear filter" link when a
 *      filter is active, so the user always knows the list above is
 *      narrowed and can undo it in one click.
 *
 * Both controls preserve the current ``?subset=`` value so flipping
 * between "Per votar" / "Votades" tabs and changing either filter don't
 * clobber each other.
 *
 * The text input lives on the same row as the combobox on desktop, and
 * stacks above it on mobile via the ``filter-rail`` flex-wrap rules.
 */
export function TopicGroupFilter({
  slug,
  subset,
  groups,
  value,
  query,
  labels,
  clearHref,
}: {
  slug: string;
  subset: 'pending' | 'voted' | 'other';
  groups: ParliamentaryGroupSummary[];
  value: string;
  /** Current free-text filter from the URL. Empty string when none. */
  query: string;
  labels: {
    label: string;
    /** Optional shorter variant rendered below the `sm` breakpoint so
     *  the mobile filter rail stays compact. Falls back to ``label``. */
    labelShort?: string;
    placeholder: string;
    clearLabel: string;
    ariaLabel: string;
    governmentLabel: string;
    countLabel: string;
    totalLabel: string;
    clearCta: string;
    queryLabel: string;
    /** Same idea for the free-text input label. */
    queryLabelShort?: string;
    queryPlaceholder: string;
    queryClearAria: string;
  };
  clearHref: Route;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Local state mirrors the URL so the input stays controlled and a
  // server-driven URL change (e.g. via the "× Neteja el filtre" link)
  // resets the textbox immediately. The debounce timer pushes the
  // committed value back to the URL so we don't navigate on every
  // keystroke.
  const [draftQuery, setDraftQuery] = useState(query);
  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const navigateTo = (newSlug: string, newQuery: string) => {
    const qs = new URLSearchParams();
    qs.set('subset', subset);
    if (newSlug) qs.set('group', newSlug);
    const trimmed = newQuery.trim();
    if (trimmed) qs.set('q', trimmed);
    const href = (qs.toString() ? `/topics/${slug}?${qs.toString()}` : `/topics/${slug}`) as Route;
    startTransition(() => {
      router.push(href);
    });
  };

  // Programmatic navigation on combobox change — saves the user from
  // hunting for an apply button. The transition keeps the segmented tabs
  // and stats above from showing a loading flash.
  const handleGroupChange = (newSlug: string) => {
    navigateTo(newSlug, draftQuery);
  };

  // Debounce the text-input → URL push so each keystroke doesn't trigger
  // a server round-trip. 250ms is short enough to feel live while letting
  // a typical word-rate query (~4-5 chars/word) coalesce into one nav.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = (raw: string) => {
    setDraftQuery(raw);
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      if (raw.trim() === query) return;
      navigateTo(value, raw);
    }, 250);
  };
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Pressing Enter should fire the navigation immediately rather than
  // waiting for the debounce — matches the form-y mental model the
  // single input invites.
  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
      navigateTo(value, draftQuery);
    }
  };

  const handleQueryClear = () => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }
    setDraftQuery('');
    navigateTo(value, '');
  };

  const hasFilter = value !== '' || query !== '';

  return (
    <div
      className="topic-filter-rail"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '10px 0 14px',
        borderBottom: '1px solid var(--rule)',
        marginBottom: 14,
      }}
    >
      {/* Free-text title filter. Stacks above the group combobox on
          narrow viewports via the .filter-row-control wrap rule. */}
      <label
        className="filter-row-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flex: '1 1 240px',
          maxWidth: 360,
        }}
      >
        <span
          className="eyebrow"
          style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
        >
          {/* Two-variant label: short for mobile (≤640px), full for sm+.
              Keeps the visible string under 8 chars on phones where the
              filter rail competes with the title input for width. */}
          <span className="filter-label-full">{labels.queryLabel}</span>
          <span className="filter-label-short">
            {labels.queryLabelShort ?? labels.queryLabel}
          </span>
        </span>
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
          }}
        >
          <input
            type="search"
            value={draftQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleQueryKeyDown}
            placeholder={labels.queryPlaceholder}
            aria-label={labels.queryLabel}
            style={{
              width: '100%',
              padding: '6px 28px 6px 10px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 8,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          />
          {draftQuery !== '' && (
            <button
              type="button"
              onClick={handleQueryClear}
              aria-label={labels.queryClearAria}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 0,
                color: 'var(--ink-3)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          )}
        </span>
      </label>

      <div
        className="filter-row-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flex: '1 1 240px',
          maxWidth: 360,
        }}
      >
        <span
          className="eyebrow"
          style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
        >
          <span className="filter-label-full">{labels.label}</span>
          <span className="filter-label-short">
            {labels.labelShort ?? labels.label}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <GroupCombobox
            name="group"
            value={value}
            onChange={handleGroupChange}
            groups={groups}
            extraOptions={[{ slug: 'govern', label: labels.governmentLabel }]}
            emptyValue=""
            clearLabel={labels.clearLabel}
            placeholder={labels.placeholder}
            ariaLabel={labels.ariaLabel}
          />
        </div>
      </div>

      <span
        className="tabular"
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
          marginLeft: 'auto',
          opacity: pending ? 0.6 : 1,
          transition: 'opacity .15s ease',
        }}
        aria-live="polite"
      >
        {hasFilter ? labels.countLabel : labels.totalLabel}
      </span>
      {hasFilter && (
        <Link
          href={clearHref}
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          {labels.clearCta}
        </Link>
      )}

      <style>{`
        /* Mobile-only short variants. Mirror Tailwind's sm breakpoint
           (640px) so the labels collapse just before the filter rail wraps.
           At rest, the short variant is hidden; the desktop variant shows. */
        .topic-filter-rail .filter-label-short { display: none; }
        .topic-filter-rail .filter-label-full { display: inline; }
        @media (max-width: 640px) {
          .topic-filter-rail .filter-label-short { display: inline; }
          .topic-filter-rail .filter-label-full { display: none; }
        }
        @media (max-width: 720px) {
          .topic-filter-rail .filter-row-control {
            flex-basis: 100% !important;
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}
