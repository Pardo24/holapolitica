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

import { GroupBadge } from '@/components/GroupBadge';
import type { ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Typeahead combobox for picking a parliamentary group.
 *
 * Mirrors :file:`TopicCombobox` but renders each option with the existing
 * :file:`GroupBadge` (24px colored disc with the group's abbreviation), so
 * the visual identity stays consistent with the rest of the app — we do
 * NOT reinvent the badge here.
 *
 * Form-friendly: writes the chosen slug into a hidden `<input name=…>` so
 * the enclosing GET filter form picks it up and the existing URL sync
 * (`?group=…`) keeps working untouched.
 */
export function GroupCombobox({
  name,
  value,
  onChange,
  groups,
  placeholder = 'Filtra per grup parlamentari…',
  clearLabel = 'Cap (tots els grups)',
  /** Empty-string sentinel meaning "no filter". Use 'all' for the /stats
   *  convention; '' for the /votes convention. */
  emptyValue = '',
  /** Optional extra synthetic entries (e.g. {slug:'govern', name_short:'Govern'})
   *  rendered between the "Cap" row and the real groups. Useful on /votes
   *  where the proposing-group filter accepts a Government sentinel. */
  extraOptions = [],
  ariaLabel,
}: {
  name: string;
  value: string;
  onChange?: (slug: string) => void;
  groups: ParliamentaryGroupSummary[];
  placeholder?: string;
  clearLabel?: string;
  emptyValue?: string;
  extraOptions?: Array<{ slug: string; label: string }>;
  ariaLabel?: string;
}) {
  const [selected, setSelected] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setSelected(value);
  }, [value]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.slug === selected) ?? null,
    [groups, selected],
  );
  const selectedExtra = useMemo(
    () => extraOptions.find((e) => e.slug === selected) ?? null,
    [extraOptions, selected],
  );

  const items = useMemo(() => {
    const norm = normalize(query);
    const matchExtra = (e: { slug: string; label: string }) =>
      norm === '' || normalize(e.label).includes(norm) || normalize(e.slug).includes(norm);
    const matchGroup = (g: ParliamentaryGroupSummary) =>
      norm === '' ||
      normalize(displayGroupShort(g.name_short)).includes(norm) ||
      normalize(g.name_long).includes(norm) ||
      normalize(g.slug).includes(norm);

    const filteredExtra = extraOptions.filter(matchExtra);
    const filteredGroups = groups.filter(matchGroup);

    const rows: Array<
      | { kind: 'clear'; value: string }
      | { kind: 'extra'; slug: string; label: string }
      | { kind: 'option'; group: ParliamentaryGroupSummary }
    > = [];
    rows.push({ kind: 'clear', value: emptyValue });
    filteredExtra.forEach((e) =>
      rows.push({ kind: 'extra', slug: e.slug, label: e.label }),
    );
    filteredGroups.forEach((g) => rows.push({ kind: 'option', group: g }));
    return rows;
  }, [groups, extraOptions, query, emptyValue]);

  const focusableIndices = useMemo(
    () => items.map((_, i) => i),
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const first = focusableIndices[0];
    setActiveIndex(typeof first === 'number' ? first : 0);
  }, [open, query, focusableIndices]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
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
      else if (row.kind === 'extra') commit(row.slug);
      else commit(row.group.slug);
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
          {selectedGroup ? (
            <GroupChipInner
              slug={selectedGroup.slug}
              short={selectedGroup.name_short}
              color={selectedGroup.color_hex}
            />
          ) : selectedExtra ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--ink)',
                  flex: 'none',
                }}
              />
              <span>{selectedExtra.label}</span>
            </span>
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
          <ul id={listboxId} role="listbox" style={listboxStyle}>
            {items.length === 1 && items[0]?.kind === 'clear' && query !== '' && (
              <li
                role="presentation"
                style={{ ...optionStyle(false), color: 'var(--ink-3)', cursor: 'default' }}
              >
                Cap coincidència
              </li>
            )}
            {items.map((row, i) => {
              const isActive = i === activeIndex;
              if (row.kind === 'clear') {
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
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: '1px dashed var(--ink-3)',
                        flex: 'none',
                      }}
                    />
                    <span style={{ color: 'var(--ink-2)' }}>{clearLabel}</span>
                  </li>
                );
              }
              if (row.kind === 'extra') {
                const isSelected = row.slug === selected;
                return (
                  <li
                    key={`extra-${row.slug}`}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(row.slug);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={optionStyle(isActive, isSelected)}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'var(--ink)',
                        flex: 'none',
                      }}
                    />
                    <span>{row.label}</span>
                  </li>
                );
              }
              const isSelected = row.group.slug === selected;
              return (
                <li
                  key={row.group.slug}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(row.group.slug);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={optionStyle(isActive, isSelected)}
                >
                  <GroupChipInner
                    slug={row.group.slug}
                    short={row.group.name_short}
                    color={row.group.color_hex}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function GroupChipInner({
  slug,
  short,
  color,
}: {
  slug: string;
  short: string;
  color: string | null;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
      }}
    >
      <GroupBadge slug={slug} color={color} size="sm" link={false} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--ink)',
        }}
      >
        {displayGroupShort(short)}
      </span>
    </span>
  );
}

function normalize(s: string): string {
  // Strip combining diacritic marks (U+0300..U+036F) after NFD decomposition.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const chipButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  minWidth: 220,
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
  lineHeight: 1.3,
};

const searchInputStyle: CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  minWidth: 220,
  width: '100%',
  outline: 'none',
};

const listboxStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  maxHeight: 280,
  overflowY: 'auto',
  background: 'var(--paper)',
  border: '1px solid var(--ink)',
  borderRadius: 4,
  margin: 0,
  padding: 4,
  listStyle: 'none',
  zIndex: 50,
  boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
};

function optionStyle(active: boolean, selected = false): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 2,
    background: active ? 'var(--paper-2)' : 'transparent',
    fontWeight: selected ? 600 : 400,
    color: 'var(--ink)',
  };
}
