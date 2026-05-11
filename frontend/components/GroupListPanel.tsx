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
 *
 * Sizing rule (neutrality + "regla de simetria"): every card occupies an
 * identical grid cell and stretches to the cell height. A bigger group
 * (e.g. Popular, 137 diputats) gets exactly the same visual real-estate
 * as a smaller one (e.g. Mixto). The previous flex layout was driven by
 * intrinsic content width, which made parties with long names or 3-digit
 * counts grow disproportionately — visually privileging them.
 */
export async function GroupListPanel() {
  const t = await getTranslations('groups');
  const groups = await api.groups.list();
  const sorted = [...groups].sort(
    (a, b) => b.members_active - a.members_active,
  );

  return (
    <ul
      className="group-grid"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '24px 0 0',
        display: 'grid',
        // Equal-width cells. `minmax(0, 1fr)` is the canonical fix for the
        // "grid items overflow when content is wider than the implicit
        // min content size" trap — without it, long group names could
        // push a column wider than its peers.
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
      <style>{`
        @media (min-width: 1100px) {
          .group-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 860px) {
          .group-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 480px) {
          .group-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
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
    <li style={{ display: 'flex' }}>
      <Link
        href={`/groups/${group.slug}`}
        style={{
          // Fill the whole grid cell so every card is the same size,
          // even when the name wraps to 2 lines or the count is shorter.
          width: '100%',
          minHeight: 140,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          borderTop: '3px solid',
          borderTopColor: group.color_hex ?? 'var(--ink)',
          background: 'var(--paper-2)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        {/* Top row: badge + member-count chip on the right. The chip is
            the primary "member count" affordance now — always visible,
            always the same size, on every card. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            minWidth: 0,
          }}
        >
          <GroupBadge
            slug={group.slug}
            color={group.color_hex}
            size="md"
            link={false}
          />
          {/* Member-count chip — single rendered string from the
              localised `members_label` (e.g. "137 membres"), styled so
              the number reads as the primary signal. We deliberately
              render the full localised label rather than splitting it
              into "number" + "unit" pieces: pluralisation and word
              order vary by language, and stripping characters by hand
              breaks at zero ("Sense membres actius") and at one
              ("1 membre"). */}
          <span
            className="tabular"
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              padding: '4px 10px',
              borderRadius: 999,
              background: 'var(--paper)',
              border: '1px solid var(--rule-strong)',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--ink)',
              flex: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {membersLabel}
          </span>
        </div>

        {/* Group name — wraps to at most 2 lines, truncates with
            ellipsis beyond that. `minWidth: 0` is essential inside a
            flex column to let the text actually wrap rather than push
            the column wider. */}
        <h2
          className="serif"
          style={{
            fontSize: 17,
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.25,
            // Standard 2-line clamp. Falls back gracefully on browsers
            // that don't support `-webkit-line-clamp` by simply
            // wrapping without clipping — still readable.
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minWidth: 0,
            wordBreak: 'break-word',
          }}
        >
          {displayGroupFullName(group.slug, group.name_long)}
        </h2>
      </Link>
    </li>
  );
}
