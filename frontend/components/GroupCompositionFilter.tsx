'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GroupBadge } from '@/components/GroupBadge';
import type { GroupMemberRow } from '@/lib/api';

/**
 * Client-side filterable composition list for a parliamentary group's
 * member roster. The composition itself (gender / age / parties) is still
 * rendered server-side; this component only owns the searchable + roleable
 * list of names.
 *
 * Filter rules:
 *  - Free-text search matches against ``full_name`` AND ``constituency``,
 *    case- and accent-insensitive (NFD + strip combining marks). Empty
 *    query renders the unfiltered list, preserving the original "members
 *    with a role first" ordering.
 *  - Empty state shows a single neutral sentence — no editorial framing.
 *
 * Symmetry note: we never hide members on conditions other than the user's
 * own query. There's no "show only women", "hide independents" or similar
 * affordance — the toolbar deliberately offers a single neutral filter.
 */

function normalize(s: string): string {
  // NFD decomposes accented chars into base + combining mark, then we
  // strip the marks (U+0300..U+036F = Combining Diacritical Marks block).
  // Cheap and works for Catalan/Spanish/English alike.
  return s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function GroupCompositionFilter({
  members,
  groupSlug,
  groupColor,
}: {
  members: GroupMemberRow[];
  groupSlug: string;
  groupColor: string | null;
}) {
  // Translations resolved on the client — passing the t() function from
  // the server would cross the server→client boundary and crash SSR
  // ("Functions cannot be passed directly to Client Components").
  const t = useTranslations('group');
  const labels = {
    title: t('members_title'),
    searchPlaceholder: t('members_search_placeholder'),
    searchAria: t('members_search_aria'),
    empty: t('members_empty_filter'),
  };
  const [query, setQuery] = useState('');

  // Preserve the original "with role first, rest after" ordering set by
  // the server. We only filter, never resort, so the page reads the same
  // way before and after the user types.
  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return members;
    return members.filter((m) => {
      const haystack = normalize(
        `${m.full_name} ${m.constituency ?? ''} ${m.role ?? ''}`,
      );
      return haystack.includes(needle);
    });
  }, [members, query]);

  return (
    <section style={{ paddingTop: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h2 className="h-title" style={{ margin: 0 }}>
          {labels.title}{' '}
          <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 14 }}>
            ({members.length})
          </span>
        </h2>
        <div
          aria-live="polite"
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-3)' }}
        >
          {t('members_match_count', { count: filtered.length })}
        </div>
      </div>

      {/* Search toolbar — single neutral filter. No constituency dropdown
          yet; the free-text input already matches against constituency
          strings, so typing "Madrid" or "Barcelona" filters by region. */}
      <div
        style={{
          position: 'relative',
          marginBottom: 14,
          maxWidth: 420,
        }}
      >
        <Search
          size={16}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--ink-3)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          className="input-modern"
          aria-label={labels.searchAria}
          placeholder={labels.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // 44px hit target — paired with the leading icon, the inner
          // padding-left needs to clear the 16px icon at x=12 plus a
          // 12px gap, hence 38px.
          style={{ paddingLeft: 38, minHeight: 44 }}
        />
      </div>

      {filtered.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-3)',
            margin: 0,
            padding: '16px 0',
          }}
        >
          {labels.empty}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
            gap: 8,
          }}
        >
          {filtered.map((m) => (
            <li key={m.person_id}>
              <Link
                href={`/persons/${m.person_id}`}
                prefetch={false}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 10,
                  border: '1px solid var(--rule)',
                  background: 'var(--paper)',
                  textDecoration: 'none',
                  color: 'inherit',
                  minHeight: 44,
                  alignItems: 'center',
                }}
              >
                {m.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.photo_url}
                    alt=""
                    width={32}
                    height={40}
                    loading="lazy"
                    style={{
                      width: 32,
                      height: 40,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid var(--rule)',
                      background: 'var(--paper-3)',
                      flex: 'none',
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 32,
                      height: 40,
                      borderRadius: 6,
                      background: 'var(--paper-3)',
                      border: '1px solid var(--rule)',
                      color: 'var(--ink-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <User size={14} aria-hidden="true" />
                  </div>
                )}
                <GroupBadge
                  slug={groupSlug}
                  color={groupColor}
                  size="xs"
                  link={false}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {m.full_name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.constituency}
                    {m.role && (
                      <>
                        {m.constituency ? ' · ' : ''}
                        <span style={{ fontStyle: 'italic' }}>{m.role}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
