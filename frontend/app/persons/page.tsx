import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { GroupListPanel } from '@/components/GroupListPanel';
import { Hemicycle } from '@/components/Hemicycle';
import { HubTabs } from '@/components/HubTabs';
import { api, type ParliamentaryGroupSummary, type Person } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

type PersonsTab = 'diputats' | 'grups';

interface SearchParams {
  tab?: string;
  q?: string;
  page?: string;
}

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('persons');
  const tNav = await getTranslations('nav');
  const params = await searchParams;
  const activeTab: PersonsTab = params.tab === 'grups' ? 'grups' : 'diputats';

  return (
    <div>
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 14,
        }}
      >
        <div className="eyebrow">{t('hub_eyebrow')}</div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {tNav('persons')}
        </h1>
      </header>

      <HubTabs
        ariaLabel="Vistes de representants"
        tabs={[
          {
            href: '/persons' as Route,
            label: t('title'),
            active: activeTab === 'diputats',
          },
          {
            href: '/persons?tab=grups' as Route,
            label: t('groups_tab_label'),
            active: activeTab === 'grups',
          },
        ]}
      />

      {activeTab === 'diputats' ? (
        <DiputatsTab q={params.q} pageParam={params.page} />
      ) : (
        <GroupListPanel />
      )}
    </div>
  );
}

async function DiputatsTab({
  q,
  pageParam,
}: {
  q: string | undefined;
  pageParam: string | undefined;
}) {
  const t = await getTranslations('persons');
  const tGroups = await getTranslations('groups');
  const page = Number(pageParam ?? 1);

  const [data, groups] = await Promise.all([
    api.persons.list({ q, page, page_size: 30, legislature_id: 1 }),
    api.groups.list(),
  ]);

  const sortedGroups = [...groups].sort(
    (a, b) => b.members_active - a.members_active,
  );
  const totalSeats = sortedGroups.reduce(
    (acc, g) => acc + g.members_active,
    0,
  );

  return (
    <div>
      {/* Search bar under the tab strip */}
      <form
        method="GET"
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          paddingTop: 16,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="search"
          name="q"
          placeholder={t('search_placeholder')}
          defaultValue={q ?? ''}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--ink)',
            background: 'transparent',
            fontSize: 13,
            minWidth: 0,
            flex: '1 1 240px',
            maxWidth: '100%',
            fontFamily: 'inherit',
            color: 'var(--ink)',
          }}
        />
        <button type="submit" className="btn-ink btn-sm">
          {t('search_button')}
        </button>
        <div
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginLeft: 'auto',
          }}
        >
          {t('subtitle_composition', { total: totalSeats })}
        </div>
      </form>

      {/* Hemicycle composition (full-width, centered) followed by the
          group legend table. The hemicycle was previously cramped into a
          ~37% column next to the legend, which on desktop pages with a
          ~1200px content width left the chart at ~440px — narrow enough
          that wide groups wrapped onto extra rows and the overall
          composition looked squashed. Putting the chart in its own
          full-width block lets it claim a real parliamentary aspect
          (~2.2:1) and read as the visual anchor it's meant to be. */}
      <section
        style={{
          paddingTop: 24,
          paddingBottom: 24,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="hemicycle-block" style={{ width: '100%' }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 6, display: 'block' }}
          >
            {t('hemicycle_title')}
          </div>
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              margin: '0 auto',
            }}
          >
            <Hemicycle
              groups={sortedGroups.map((g) => ({
                slug: g.slug,
                members: g.members_active,
                color: g.color_hex,
              }))}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 6,
            }}
          >
            {t('hemicycle_caption')}
          </div>
        </div>

        {/* Group legend table — below the hemicycle, full width. */}
        <div style={{ marginTop: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {tGroups('title')}
          </div>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {sortedGroups.map((g) => (
              <GroupRow key={g.slug} g={g} totalSeats={totalSeats} />
            ))}
          </div>
        </div>
      </section>

      {/* Directory */}
      <section style={{ paddingTop: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {t('directory_title')}
          {q ? ` · "${q}"` : ''}
        </div>

        {data.items.length === 0 ? (
          <p style={{ color: 'var(--ink-3)' }}>{t('no_results')}</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 8,
            }}
          >
            {data.items.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </ul>
        )}

        {data.total > data.page_size && (
          <Pagination total={data.total} page={page} pageSize={data.page_size} q={q} />
        )}
      </section>

      {/* No legacy hemicycle-grid styles — the chart now stacks above
          the legend at all viewport widths. */}
    </div>
  );
}

function GroupRow({
  g,
  totalSeats,
}: {
  g: ParliamentaryGroupSummary;
  totalSeats: number;
}) {
  const pct = totalSeats > 0 ? (g.members_active / totalSeats) * 100 : 0;
  return (
    <Link
      href={`/groups/${g.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) minmax(40px, 120px) auto',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayGroupShort(g.name_short)}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ink-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {g.name_long}
        </div>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 120,
          height: 6,
          background: 'var(--paper-3)',
          borderRadius: 1,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: g.color_hex ?? 'var(--ink-3)',
          }}
        />
      </div>
      <span
        className="tabular"
        style={{ fontSize: 13, fontWeight: 600, minWidth: 30, textAlign: 'right' }}
      >
        {g.members_active}
      </span>
    </Link>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <li>
      <Link
        href={`/persons/${person.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          border: '1px solid var(--rule)',
          textDecoration: 'none',
          color: 'inherit',
          background: 'var(--paper)',
        }}
      >
        {person.current_group_slug ? (
          <GroupBadge
            slug={person.current_group_slug}
            color={person.current_group_color}
            size="sm"
            link={false}
          />
        ) : (
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--paper-3)',
              flex: 'none',
            }}
          />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{person.full_name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {person.current_constituency ?? ''}
          </div>
        </div>
      </Link>
    </li>
  );
}

function Pagination({
  total,
  page,
  pageSize,
  q,
}: {
  total: number;
  page: number;
  pageSize: number;
  q: string | undefined;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const params = (n: number): Route => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    sp.set('page', String(n));
    return `/persons?${sp.toString()}` as Route;
  };
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        fontSize: 13,
        color: 'var(--ink-3)',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span>
        {total} · {page} / {lastPage}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {page > 1 && (
          <Link
            href={params(page - 1)}
            style={{
              border: '1px solid var(--rule)',
              padding: '4px 10px',
              textDecoration: 'none',
              color: 'var(--ink-2)',
            }}
          >
            ← Anterior
          </Link>
        )}
        {page < lastPage && (
          <Link
            href={params(page + 1)}
            style={{
              border: '1px solid var(--rule)',
              padding: '4px 10px',
              textDecoration: 'none',
              color: 'var(--ink-2)',
            }}
          >
            Següent →
          </Link>
        )}
      </div>
    </nav>
  );
}
