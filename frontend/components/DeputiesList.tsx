'use client';

/**
 * Client-side controller for the "Diputats" tab of the persons hub.
 *
 * The redesign treats the chamber's representatives as the project's
 * focal entity, so the interactive hemicycle anchors the top of the
 * page and a compact list of parliamentary groups sits beside it on
 * desktop (stacked below on mobile). Search + group filter move below
 * the chart and drive a CLIENT-side filter over the pre-loaded seat
 * dataset — no extra fetch round-trips, no URL pagination state.
 *
 * Why client-side filtering: the `/legislatures/{id}/hemicycle` endpoint
 * already returns every active deputy with their photo URL, group
 * colour, group abbreviation and constituency. That's exactly the data
 * the list rows need, so we avoid both the `/persons` pagination layer
 * and a second round trip. The full dataset is ~350 rows, well within
 * the budget for in-memory filtering on any device.
 *
 * Neutrality (CLAUDE.md "mirall, no megàfon"): rows show only factual
 * data — photo, name, group abbreviation, constituency. No editorial
 * framing, no rankings, no per-deputy badges beyond the group disc.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X, User } from 'lucide-react';

import { DeputiesAutocomplete } from '@/components/DeputiesAutocomplete';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import { Hemicycle } from '@/components/Hemicycle';
import type {
  HemicycleLayout,
  HemicycleSeat,
  ParliamentaryGroupSummary,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Normalize a string for case- and diacritic-insensitive search. Mirrors
 * the helper used by :file:`GroupCombobox` so behaviour stays consistent
 * across the persons hub.
 */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function DeputiesList({
  layout,
  groups,
}: {
  /**
   * Full hemicycle layout (all 350 active deputies) — used both to
   * render the SVG and as the dataset for the filtered directory.
   * If the backend hasn't ingested seat coordinates yet, the
   * synthetic-arc fallback in :file:`Hemicycle` handles it; the list
   * still works because we only read non-positional fields here.
   */
  layout: HemicycleLayout | null;
  groups: ParliamentaryGroupSummary[];
}) {
  const t = useTranslations('persons');
  const tGroups = useTranslations('groups');

  // Sort groups by member count (largest first) so the right-hand
  // sidebar reads as a power table — same convention as the legend on
  // the previous layout and as /groups itself.
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => b.members_active - a.members_active),
    [groups],
  );

  const seats: HemicycleSeat[] = useMemo(
    () => layout?.seats ?? [],
    [layout],
  );
  const totalSeats = seats.length;

  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  // Progressive disclosure of the directory grid. The first SSR pass
  // renders only INITIAL_CHUNK rows of 350 — the rest live behind a
  // "show all" button. /persons used to ship ~665 KB of HTML on the
  // first paint because every deputy card was inlined (photo URLs,
  // names, group meta); the chunked render drops the cold payload
  // by ~30%. When the user types or picks a group the chunking
  // collapses (see ``visibleCount`` below) so filtered matches are
  // never hidden behind the gate — anything else would feel broken.
  const INITIAL_CHUNK = 48;
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const norm = normalize(query.trim());
    return seats.filter((s) => {
      if (groupFilter && s.group_slug !== groupFilter) return false;
      if (!norm) return true;
      const haystack = [
        s.full_name,
        s.constituency ?? '',
        s.group_short ?? '',
      ]
        .map((x) => normalize(x))
        .join(' ');
      return haystack.includes(norm);
    });
  }, [seats, query, groupFilter]);

  // Sort deputies alphabetically by family name (best-effort: family name
  // is whatever comes first in the comma-separated Spanish convention).
  const sortedFiltered = useMemo(
    () =>
      [...filtered].sort((a, b) =>
        normalize(a.full_name).localeCompare(normalize(b.full_name)),
      ),
    [filtered],
  );

  const hasActiveFilter = query.trim() !== '' || groupFilter !== '';
  // When the user is actively narrowing, render the FULL filtered set
  // — otherwise typing a name that's beyond the first chunk would
  // surface 0 results despite a match in the underlying list.
  // Without any filter, defer to the INITIAL_CHUNK gate.
  const visibleRows = hasActiveFilter || showAll
    ? sortedFiltered
    : sortedFiltered.slice(0, INITIAL_CHUNK);
  const hiddenCount = sortedFiltered.length - visibleRows.length;

  return (
    <div>
      {/* Prominent search-as-you-type, ABOVE the hemicycle. A citizen
          arriving to look up "el meu diputat" finds the affordance
          before the chart — most users don't read parliament charts
          left-to-right, they search by name. Navigates to the
          person's detail page on click/Enter, separate from the
          directory filter below. */}
      {totalSeats > 0 && (
        <section style={{ paddingTop: 18 }}>
          <DeputiesAutocomplete seats={seats} />
        </section>
      )}

      {/* Top row: hemicycle (focal, ~70%) + groups sidebar (~30%).
          Collapses to a single column on narrow viewports. */}
      <section
        className="persons-hub-top"
        style={{
          paddingTop: 24,
          paddingBottom: 24,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="persons-hub-grid">
          <div className="persons-hub-hemicycle" style={{ minWidth: 0 }}>
            <div
              className="eyebrow"
              style={{ marginBottom: 6, display: 'block' }}
            >
              {t('hemicycle_title')}
            </div>
            <div style={{ width: '100%' }}>
              {layout ? (
                <Hemicycle layout={layout} />
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    textAlign: 'center',
                    padding: '24px 0',
                  }}
                />
              )}
            </div>
          </div>

          {/* Groups sidebar */}
          <aside
            className="persons-hub-groups"
            style={{ minWidth: 0 }}
            aria-label={t('groups_sidebar_title')}
          >
            <div
              className="eyebrow"
              style={{ marginBottom: 6, display: 'block' }}
            >
              {t('groups_sidebar_title')}
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                borderTop: '1px solid var(--ink)',
              }}
            >
              {sortedGroups.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/groups/${g.slug}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--rule)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <GroupBadge
                      slug={g.slug}
                      color={g.color_hex}
                      size="xs"
                      link={false}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {displayGroupShort(g.name_short)}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--ink-2)',
                        minWidth: 28,
                        textAlign: 'right',
                      }}
                    >
                      {g.members_active}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div
              className="tabular"
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 8,
              }}
            >
              {tGroups('subtitle', {
                count: sortedGroups.length,
                members: totalSeats,
              })}
            </div>
          </aside>
        </div>
      </section>

      {/* Filter row — moved BELOW the hemicycle per the redesign. */}
      <section
        style={{
          paddingTop: 20,
          paddingBottom: 14,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          className="search-chip"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            border: '1px solid var(--rule-strong)',
            borderRadius: 10,
            background: 'var(--paper)',
            flex: '1 1 240px',
            minWidth: 0,
            maxWidth: 360,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <Search
            size={14}
            aria-hidden="true"
            style={{ color: 'var(--ink-3)', flex: 'none' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_placeholder')}
            aria-label={t('search_input_aria')}
            style={{
              padding: '4px 0',
              border: 'none',
              background: 'transparent',
              fontSize: 14,
              minWidth: 0,
              flex: '1 1 auto',
              fontFamily: 'inherit',
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clear_filters')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-3)',
                padding: 4,
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            maxWidth: 320,
          }}
        >
          <GroupCombobox
            name="group"
            value={groupFilter}
            onChange={setGroupFilter}
            groups={sortedGroups}
            placeholder={t('filter_group_placeholder')}
            ariaLabel={t('filter_group_label')}
          />
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setGroupFilter('');
            }}
            className="btn-modern"
            style={{ fontSize: 13, padding: '8px 12px' }}
          >
            <X size={12} aria-hidden="true" />
            {t('clear_filters')}
          </button>
        )}

        <div
          className="tabular"
          aria-live="polite"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginLeft: 'auto',
          }}
        >
          {hasActiveFilter
            ? t('filter_active_total', {
                filtered: sortedFiltered.length,
                total: totalSeats,
              })
            : t('subtitle_composition', { total: totalSeats })}
        </div>
      </section>

      {/* Filtered directory */}
      <section>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {t('directory_title')}
          {' · '}
          {t('filter_active_count', { count: sortedFiltered.length })}
        </div>

        {sortedFiltered.length === 0 ? (
          <p style={{ color: 'var(--ink-3)' }}>{t('no_results')}</p>
        ) : (
          <>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                // `min(280px, 100%)` guarantees we never request a column
                // wider than the viewport — at 320–375px the row collapses
                // to a single column instead of horizontally overflowing.
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
                gap: 8,
              }}
            >
              {visibleRows.map((seat) => (
                <DeputyRow key={seat.person_id} seat={seat} />
              ))}
            </ul>
            {hiddenCount > 0 && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '10px 18px',
                    border: '1px solid var(--ink)',
                    background: 'var(--paper)',
                    color: 'var(--ink)',
                    borderRadius: 999,
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {t('show_remaining', { count: hiddenCount })}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <style>{`
        .persons-hub-grid {
          display: grid;
          grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
          gap: 28px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .persons-hub-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }
      `}</style>
    </div>
  );
}

function DeputyRow({ seat }: { seat: HemicycleSeat }) {
  const initials = computeInitials(seat.full_name);
  return (
    <li>
      <Link
        href={`/persons/${seat.person_id}` as Route}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 10px',
          border: '1px solid var(--rule)',
          textDecoration: 'none',
          color: 'inherit',
          background: 'var(--paper)',
          minWidth: 0,
        }}
      >
        {seat.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seat.photo_url}
            alt=""
            width={36}
            height={44}
            loading="lazy"
            style={{
              width: 36,
              height: 44,
              objectFit: 'cover',
              border: '1px solid var(--rule)',
              background: 'var(--paper-3)',
              flex: 'none',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 44,
              background: 'var(--paper-3)',
              border: '1px solid var(--rule)',
              color: 'var(--ink-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              flex: 'none',
            }}
          >
            {initials || <User size={16} aria-hidden="true" />}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {seat.full_name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              marginTop: 2,
            }}
          >
            {seat.group_short && (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: seat.group_color ?? '#9ca3af',
                    display: 'inline-block',
                    flex: 'none',
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayGroupShort(seat.group_short)}
                </span>
              </>
            )}
            {seat.constituency && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {seat.constituency}
                </span>
              </>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '';
  }
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts[parts.length - 1]?.charAt(0) ?? '';
  return (first + last).toUpperCase();
}
