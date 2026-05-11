import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { api, type ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupFullName } from '@/lib/groups';

/**
 * Renders the parliamentary-groups directory: a grid of group cards sorted by
 * active member count desc. Used both by `/groups` (its own page) and by
 * `/persons?tab=grups` (the "Grups polítics" tab inside the representatives
 * hub) so the surfaces stay identical.
 *
 * Header is rendered by the parent page so the tab bar can sit above us in
 * the persons hub without duplicating a second h1.
 */
export async function GroupListPanel() {
  const t = await getTranslations('groups');
  const groups = await api.groups.list();
  const sorted = [...groups].sort(
    (a, b) => b.members_active - a.members_active,
  );

  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '24px 0 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}
    >
      {sorted.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          membersLabel={t('members_label', { count: g.members_active })}
        />
      ))}
    </ul>
  );
}

function GroupCard({
  group,
  membersLabel,
}: {
  group: ParliamentaryGroupSummary;
  membersLabel: string;
}) {
  return (
    <li>
      <Link
        href={`/groups/${group.slug}`}
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          padding: 16,
          borderTop: '3px solid',
          borderTopColor: group.color_hex ?? 'var(--ink)',
          background: 'var(--paper-2)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <GroupBadge
          slug={group.slug}
          color={group.color_hex}
          size="md"
          link={false}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            className="serif"
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {displayGroupFullName(group.slug, group.name_long)}
          </h2>
          <p
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 2,
              marginBottom: 0,
            }}
          >
            {membersLabel}
          </p>
        </div>
        <span
          className="tabular"
          style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {group.members_active}
        </span>
      </Link>
    </li>
  );
}
