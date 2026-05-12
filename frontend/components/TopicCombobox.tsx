'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { ChevronDown } from 'lucide-react';

import type { Topic, TopicKind } from '@/lib/api';

/**
 * Typeahead combobox for selecting a topic (theme or SDG).
 *
 * Replaces the legacy native `<select>` so users can search the long topic
 * taxonomy by typing. Filtering is client-side, case-insensitive and
 * accent-insensitive ("Habitatge" matches "hábit", "habitatge", "Habitatge").
 * Themes are grouped first; SDGs appear below under an "Agenda 2030" header.
 *
 * The component is form-friendly: it renders a hidden `<input>` so an
 * enclosing GET form picks up the chosen slug just like the old select did.
 * Drop it inside the existing filter `<form>` and the URL synchronisation
 * keeps working without changes.
 */
export function TopicCombobox({
  name,
  value,
  onChange,
  topics,
  placeholder = 'Filtra per tema…',
  clearLabel = 'Cap (tots els temes)',
  themeHeader,
  sdgHeader = 'Agenda 2030',
  /** Empty-string sentinel meaning "no filter" — matches what the existing
   *  forms use ('all' on /stats, '' on /votes). */
  emptyValue = '',
  ariaLabel,
}: {
  name: string;
  value: string;
  onChange?: (slug: string) => void;
  topics: Topic[];
  placeholder?: string;
  clearLabel?: string;
  themeHeader?: string;
  sdgHeader?: string;
  emptyValue?: string;
  ariaLabel?: string;
}) {
  const [selected, setSelected] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // Keep external value in sync (e.g. URL changes via parent re-render).
  useEffect(() => {
    setSelected(value);
  }, [value]);

  const selectedTopic = useMemo(
    () => topics.find((t) => t.slug === selected) ?? null,
    [topics, selected],
  );

  // Build the flat list of choices (including the "clear" entry at top),
  // grouped/ordered so themes precede SDGs. We expose flat indices so the
  // keyboard nav can target every row including the headers' first row.
  const items = useMemo(() => {
    const norm = normalize(query);
    const themes = topics.filter((t) => t.kind === 'theme');
    const sdgs = topics.filter((t) => t.kind === 'sdg');
    const matchTopic = (t: Topic) =>
      norm === '' || normalize(t.name_ca).includes(norm);

    const filteredThemes = themes.filter(matchTopic);
    const filteredSdgs = sdgs.filter(matchTopic);

    const rows: Array<
      | { kind: 'clear'; value: string }
      | { kind: 'header'; label: string; topicKind: TopicKind }
      | { kind: 'option'; topic: Topic }
    > = [];
    rows.push({ kind: 'clear', value: emptyValue });
    if (filteredThemes.length > 0) {
      if (themeHeader) rows.push({ kind: 'header', label: themeHeader, topicKind: 'theme' });
      filteredThemes.forEach((t) => rows.push({ kind: 'option', topic: t }));
    }
    if (filteredSdgs.length > 0) {
      rows.push({ kind: 'header', label: sdgHeader, topicKind: 'sdg' });
      filteredSdgs.forEach((t) => rows.push({ kind: 'option', topic: t }));
    }
    return rows;
  }, [topics, query, emptyValue, themeHeader, sdgHeader]);

  // Indices that the keyboard can land on (skip headers).
  const focusableIndices = useMemo(
    () =>
      items
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => row.kind !== 'header')
        .map(({ i }) => i),
    [items],
  );

  // When opening or when the filtered list changes, reset focus to the first
  // selectable row so the user can immediately Enter to confirm.
  useEffect(() => {
    if (!open) return;
    const first = focusableIndices[0];
    setActiveIndex(typeof first === 'number' ? first : 0);
  }, [open, query, focusableIndices]);

  // Close on outside click — standard popover hygiene.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const commit = useCallback(
    (slug: string) => {
      setSelected(slug);
      setOpen(false);
      setQuery('');
      onChange?.(slug);
    },
    [onChange],
  );

  const moveActive = useCallback(
    (delta: number) => {
      if (focusableIndices.length === 0) return;
      const pos = focusableIndices.indexOf(activeIndex);
      const nextPos =
        pos < 0
          ? 0
          : (pos + delta + focusableIndices.length) % focusableIndices.length;
      const nextIdx = focusableIndices[nextPos];
      if (typeof nextIdx === 'number') setActiveIndex(nextIdx);
    },
    [activeIndex, focusableIndices],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else moveActive(-1);
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const row = items[activeIndex];
      if (!row) return;
      if (row.kind === 'clear') commit(emptyValue);
      else if (row.kind === 'option') commit(row.topic.slug);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === 'Home') {
      if (open) {
        e.preventDefault();
        const first = focusableIndices[0];
        if (typeof first === 'number') setActiveIndex(first);
      }
    } else if (e.key === 'End') {
      if (open) {
        e.preventDefault();
        const last = focusableIndices[focusableIndices.length - 1];
        if (typeof last === 'number') setActiveIndex(last);
      }
    }
  };

  const openAndFocus = () => {
    setOpen(true);
    // Defer the focus so the input has been mounted/displayed.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      ref={wrapperRef}
      className="combobox"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-owns={listboxId}
      aria-controls={listboxId}
      aria-label={ariaLabel}
      style={{ position: 'relative', display: 'inline-block', minWidth: 220 }}
    >
      <input type="hidden" name={name} value={selected} />

      {!open && (
        <button
          type="button"
          onClick={openAndFocus}
          aria-label={ariaLabel ?? placeholder}
          style={chipButtonStyle}
        >
          {selectedTopic ? (
            <TopicChipInner topic={selectedTopic} />
          ) : (
            <span style={{ color: 'var(--ink-3)' }}>{placeholder}</span>
          )}
          <span aria-hidden="true" style={{ color: 'var(--ink-3)', marginLeft: 'auto', display: 'inline-flex' }}>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </button>
      )}

      {open && (
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
            style={searchInputStyle}
          />
          <ul
            id={listboxId}
            role="listbox"
            style={listboxStyle}
          >
            {items.length === 1 && items[0]?.kind === 'clear' && query !== '' && (
              <li
                role="presentation"
                style={{ ...optionStyle(false), color: 'var(--ink-3)', cursor: 'default' }}
              >
                Cap coincidència
              </li>
            )}
            {items.map((row, i) => {
              if (row.kind === 'header') {
                return (
                  <li
                    key={`h-${row.label}-${i}`}
                    role="presentation"
                    style={headerStyle}
                  >
                    {row.label}
                  </li>
                );
              }
              if (row.kind === 'clear') {
                const isActive = i === activeIndex;
                return (
                  <li
                    key="clear"
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={selected === emptyValue}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(emptyValue);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={optionStyle(isActive)}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        border: '1px dashed var(--ink-3)',
                        marginRight: 8,
                      }}
                    />
                    <span style={{ color: 'var(--ink-2)' }}>{clearLabel}</span>
                  </li>
                );
              }
              const isActive = i === activeIndex;
              const isSelected = row.topic.slug === selected;
              return (
                <li
                  key={row.topic.slug}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(row.topic.slug);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={optionStyle(isActive, isSelected)}
                >
                  <TopicChipInner topic={row.topic} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function TopicChipInner({ topic }: { topic: Topic }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          borderRadius: 2,
          background: topic.color_hex ?? 'var(--ink-3)',
          flex: 'none',
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--ink)',
        }}
      >
        {topic.name_ca}
      </span>
    </span>
  );
}

// Strip combining diacritical marks so "hábit" matches "habit". Lowercase
// to make the comparison case-insensitive. Cheap enough for filter-typing.
function normalize(s: string): string {
  // Strip combining diacritic marks (U+0300..U+036F) after NFD decomposition.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Geometry shared with the modern form-control look in globals.css:
// 10px radius, 10/14 padding, accent-tinted focus ring. The combobox
// trigger and its inline search field both render this shape so the
// combobox visually matches the surrounding form controls.
const chipButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  border: '1px solid var(--rule-strong)',
  borderRadius: 10,
  background: 'var(--paper)',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  minWidth: 220,
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
  lineHeight: 1.4,
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const searchInputStyle: CSSProperties = {
  padding: '10px 14px',
  border: '1px solid var(--rule-strong)',
  borderRadius: 10,
  background: 'var(--paper)',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  minWidth: 220,
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const listboxStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  maxHeight: 280,
  overflowY: 'auto',
  background: 'var(--paper)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 10,
  margin: 0,
  padding: 4,
  listStyle: 'none',
  zIndex: 50,
  boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
};

const headerStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  padding: '8px 8px 4px',
  fontWeight: 600,
};

function optionStyle(active: boolean, selected = false): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 2,
    background: active ? 'var(--paper-2)' : 'transparent',
    fontWeight: selected ? 600 : 400,
    color: 'var(--ink)',
  };
}
