'use client';

/**
 * Horizontal scroll-snap calendar strip used at the top of /votes.
 *
 * Each cell is one session-day:
 *   - `dd` (large, tabular)
 *   - month label below (short, ink-3)
 *   - subtle accent dot when there's at least one vote on that day
 *   - count chip when more than one
 *
 * Tap on a cell → calls onSelect with the date string (YYYY-MM-DD)
 * so the parent route can push `?date_from=…&date_to=…` and re-render
 * the votes list filtered to that day. "Tots" cell clears the filter.
 *
 * Neutrality note (CLAUDE.md "regla de simetria"): every session-day
 * that has at least one vote is rendered — we never hide a date because
 * the count is "boring". Days are ordered chronologically, never by
 * popularity, and the future side is presented with the same visual
 * weight as the past.
 */

import { useEffect, useRef } from 'react';
import { CalendarDays } from 'lucide-react';

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** Number of plenary votes recorded that day. */
  count: number;
  /** True when ``date`` >= today (upcoming session, no votes yet). */
  isFuture: boolean;
}

interface Props {
  days: CalendarDay[];
  activeDate: string | null;
  onSelect: (date: string | null) => void;
  /** Localised "All / Tots / Todos" label for the clear-filter cell. */
  allLabel: string;
  /** Localised tooltip / aria-label suffix (e.g. "votacions"). */
  countSuffix: string;
}

const MONTH_SHORT = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];

function formatDay(date: string): { dd: string; mon: string; weekday: string } {
  const d = new Date(`${date}T12:00:00`);
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_SHORT[d.getMonth()] ?? '';
  const weekdays = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
  const weekday = weekdays[d.getDay()] ?? '';
  return { dd, mon, weekday };
}

export function VotesCalendarStrip({
  days,
  activeDate,
  onSelect,
  allLabel,
  countSuffix,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // On mount + every time the active date changes, scroll the active
  // cell into view so the strip never opens "elsewhere". `scrollIntoView`
  // with `inline: 'center'` keeps the cell horizontally centred even on
  // a narrow viewport.
  useEffect(() => {
    const node = activeRef.current;
    if (node) {
      node.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    }
  }, [activeDate]);

  return (
    <div
      ref={scrollRef}
      role="tablist"
      aria-label="Calendari de votacions"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        padding: '6px 2px 10px',
        // Hide the native scrollbar to keep the visual clean on mobile;
        // scroll still works via touch + mouse drag.
        scrollbarWidth: 'thin',
      }}
      className="votes-calendar-strip"
    >
      <CalendarCell
        active={activeDate === null}
        onClick={() => onSelect(null)}
        ariaLabel={allLabel}
        title={allLabel}
        variant="all"
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span style={{ fontSize: 10, fontWeight: 600 }}>{allLabel}</span>
      </CalendarCell>

      {days.map((day) => {
        const isActive = day.date === activeDate;
        const { dd, mon, weekday } = formatDay(day.date);
        const ariaLabel = `${dd} ${mon} ${day.isFuture ? '(properes)' : `· ${day.count} ${countSuffix}`}`;
        return (
          <CalendarCell
            key={day.date}
            active={isActive}
            buttonRef={isActive ? activeRef : undefined}
            onClick={() => onSelect(day.date)}
            ariaLabel={ariaLabel}
            title={ariaLabel}
            variant={day.isFuture ? 'future' : 'past'}
          >
            <span
              className="tabular"
              style={{
                fontSize: 9,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}
            >
              {weekday}
            </span>
            <span
              className="tabular"
              style={{
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {dd}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                textTransform: 'lowercase',
              }}
            >
              {mon}
            </span>
            {day.isFuture ? (
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  border: '1px solid var(--accent)',
                  background: 'transparent',
                }}
              />
            ) : day.count > 0 ? (
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: isActive ? 'var(--paper)' : 'var(--ink)',
                }}
              />
            ) : null}
          </CalendarCell>
        );
      })}

      <style>{`
        .votes-calendar-strip::-webkit-scrollbar { height: 4px; }
        .votes-calendar-strip::-webkit-scrollbar-thumb {
          background: var(--rule);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}

function CalendarCell({
  active,
  onClick,
  buttonRef,
  ariaLabel,
  title,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  ariaLabel: string;
  title: string;
  variant: 'all' | 'past' | 'future';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      role="tab"
      aria-selected={active}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className="votes-calendar-cell"
      style={{
        flex: 'none',
        scrollSnapAlign: 'center',
        minWidth: variant === 'all' ? 64 : 56,
        height: 78,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: variant === 'all' ? 'center' : 'space-between',
        gap: variant === 'all' ? 4 : 0,
        borderRadius: 10,
        background: active ? 'var(--ink)' : 'var(--paper)',
        color: active ? 'var(--paper)' : 'var(--ink)',
        border: active
          ? '1px solid var(--ink)'
          : '1px solid var(--rule)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        opacity: variant === 'future' && !active ? 0.85 : 1,
        transition: 'background-color .12s ease, border-color .12s ease, color .12s ease',
      }}
    >
      {children}
    </button>
  );
}
