'use client';

/**
 * Prominent search-as-you-type for the deputies hub.
 *
 * Lives at the very top of /persons so a citizen who arrived to look
 * up "el meu diputat" doesn't have to scroll past the hemicycle to
 * find them. The component is intentionally separate from the
 * in-place filter inside :file:`DeputiesList` — that filter narrows
 * the directory grid; this one *navigates* directly to the deputy's
 * detail page.
 *
 * Why client-only: the seat list is already loaded by the parent
 * Server Component and handed in as a prop. There's no extra backend
 * round-trip; filtering is a normalised-string startsWith / includes
 * pass that runs in single-digit milliseconds for 350 deputies.
 *
 * Accessibility:
 *   - Combobox role with aria-activedescendant per the WAI-ARIA APG.
 *   - Keyboard: ↑ ↓ move, Enter navigates, Esc closes.
 *   - Focus trap is not needed — clicking outside closes the panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GroupBadge } from '@/components/GroupBadge';
import type { HemicycleSeat } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

const MAX_RESULTS = 8;

/**
 * Normalise for case- and diacritic-insensitive matching. Same logic
 * as the parent DeputiesList uses; duplicated to avoid a circular
 * import.
 */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function DeputiesAutocomplete({ seats }: { seats: HemicycleSeat[] }) {
  const t = useTranslations('persons_autocomplete');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = 'deputies-autocomplete-listbox';

  const results = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const matches: { seat: HemicycleSeat; rank: number }[] = [];
    for (const seat of seats) {
      const name = norm(seat.full_name);
      // Rank 0 = name starts with the query, 1 = word-boundary hit,
      // 2 = generic substring. Cheap and visibly correct.
      let rank = -1;
      if (name.startsWith(q)) rank = 0;
      else if (name.split(/\s+/).some((part) => part.startsWith(q))) rank = 1;
      else if (name.includes(q)) rank = 2;
      else if (seat.constituency && norm(seat.constituency).includes(q)) rank = 3;
      if (rank >= 0) matches.push({ seat, rank });
    }
    matches.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.seat.full_name.localeCompare(b.seat.full_name);
    });
    return matches.slice(0, MAX_RESULTS).map((m) => m.seat);
  }, [query, seats]);

  // Reset highlight when the results window shifts so the visible
  // first row is always the selected target.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const navigateTo = useCallback(
    (personId: number) => {
      setOpen(false);
      router.push(`/persons/${personId}`);
    },
    [router],
  );

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[highlight]) {
        e.preventDefault();
        navigateTo(results[highlight].person_id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div
      ref={wrapperRef}
      role="combobox"
      aria-expanded={open && results.length > 0}
      aria-haspopup="listbox"
      aria-owns={listboxId}
      style={{ position: 'relative', maxWidth: 520, margin: '0 auto 14px' }}
    >
      <div
        className="deputies-autocomplete-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          border: '1px solid var(--rule-strong)',
          borderRadius: 999,
          background: 'var(--paper)',
          boxShadow: open && results.length > 0
            ? '0 4px 18px -6px rgba(15,23,42,.18)'
            : '0 1px 0 rgba(15,23,42,.03)',
          transition: 'box-shadow .15s ease, border-color .15s ease',
        }}
      >
        <Search size={16} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={t('placeholder')}
          aria-label={t('aria_label')}
          aria-controls={listboxId}
          aria-activedescendant={
            open && results[highlight]
              ? `deputies-ac-item-${results[highlight].person_id}`
              : undefined
          }
          autoComplete="off"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 15,
            outline: 'none',
            color: 'var(--ink)',
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label={t('clear')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-3)',
              padding: 4,
              cursor: 'pointer',
              display: 'inline-flex',
              flex: 'none',
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('aria_label')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--paper)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 12,
            boxShadow: '0 12px 28px -10px rgba(15,23,42,.22)',
            zIndex: 30,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {results.map((seat, idx) => {
            const isActive = idx === highlight;
            return (
              <li
                key={seat.person_id}
                id={`deputies-ac-item-${seat.person_id}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setHighlight(idx)}
              >
                <Link
                  href={`/persons/${seat.person_id}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isActive ? 'var(--paper-2)' : 'transparent',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: seat.group_color
                        ? `color-mix(in oklch, ${seat.group_color} 22%, var(--paper))`
                        : 'var(--paper-3)',
                      overflow: 'hidden',
                      flex: 'none',
                      border: `1px solid ${seat.group_color ?? 'var(--rule)'}`,
                    }}
                  >
                    {seat.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={seat.photo_url}
                        alt=""
                        width={32}
                        height={32}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {seat.full_name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 2,
                      }}
                    >
                      {seat.group_slug && seat.group_short && (
                        <GroupBadge
                          slug={seat.group_slug}
                          color={seat.group_color}
                          size="xs"
                          link={false}
                        />
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                        {seat.group_short ? displayGroupShort(seat.group_short) : '—'}
                      </span>
                      {seat.constituency && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{seat.constituency}</span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            padding: '10px 14px',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 12,
            fontSize: 13,
            color: 'var(--ink-3)',
            zIndex: 30,
          }}
        >
          {t('no_results', { query })}
        </div>
      )}
    </div>
  );
}
