import { GroupBadge } from '@/components/GroupBadge';
import type { PartyStance, StanceLabels } from '@/components/PartyStanceRow';
import { displayGroupShort } from '@/lib/groups';

/**
 * "How each group voted" — the clear, grouped-by-stance view.
 *
 * Parties are split into columns by the position they took on the
 * vote: A favor (green), En contra (red), Abstenció (amber), Absents
 * (grey). Each column carries a coloured header with its count and,
 * beneath it, the groups as a badge + readable name — so "who backed
 * this and who opposed it" reads at a glance without decoding a table
 * or a row of tiny dots.
 *
 * Server component, no client JS. Shared by the vote-detail and
 * law-detail pages; replaces the dense GroupVoteMatrix table there.
 */

type ChoiceKey = 'aye' | 'no' | 'abstention' | 'absent';

const COLUMN_ORDER: ChoiceKey[] = ['aye', 'no', 'abstention', 'absent'];

const CHOICE_COLOR: Record<ChoiceKey, string> = {
  aye: 'var(--aye, #16A34A)',
  no: 'var(--no, #DC2626)',
  abstention: 'var(--abst, #CA8A04)',
  absent: 'var(--nv, #94A3B8)',
};

/** A party's stance plus, optionally, how many of its deputies cast it. */
export type PartyStanceWithCount = PartyStance & { count?: number };

/**
 * Horizontal stance band for the vote-detail HEADER: one cluster per
 * stance (A favor / En contra / Abstenció / Absents), each with its
 * colored label + deputy total and the groups as LARGE logo badges
 * with the group's own deputy count beneath. Sits right under the
 * headline so "what was voted + who voted what" reads in one glance,
 * before any chart.
 */
export function GroupStanceBand({
  parties,
  labels,
  /** Deputy totals per stance (vote.ayes etc.) shown next to each label. */
  totals,
}: {
  parties: PartyStanceWithCount[];
  labels: StanceLabels;
  totals?: Partial<Record<ChoiceKey, number>>;
}) {
  if (parties.length === 0) return null;

  const byChoice = new Map<ChoiceKey, PartyStanceWithCount[]>();
  for (const p of parties) {
    const key = (COLUMN_ORDER as string[]).includes(p.choice)
      ? (p.choice as ChoiceKey)
      : 'absent';
    const list = byChoice.get(key) ?? [];
    list.push(p);
    byChoice.set(key, list);
  }
  for (const list of byChoice.values()) {
    list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }
  const clusters = COLUMN_ORDER.filter((c) => (byChoice.get(c)?.length ?? 0) > 0);

  const wordFor = (c: ChoiceKey): string =>
    c === 'aye'
      ? labels.aye
      : c === 'no'
        ? labels.no
        : c === 'abstention'
          ? labels.abstention
          : labels.absent;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: '14px 32px',
      }}
    >
      {clusters.map((c) => {
        const list = byChoice.get(c)!;
        const color = CHOICE_COLOR[c];
        const total = totals?.[c];
        return (
          <div key={c} style={{ minWidth: 0, opacity: c === 'absent' ? 0.65 : 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 7,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color,
                }}
              >
                {wordFor(c)}
              </span>
              {total != null && (
                <span
                  className="tabular"
                  style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}
                >
                  {total}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {list.map((p) => (
                <span
                  key={p.slug}
                  title={`${displayGroupShort(p.name_short)}${p.count != null ? ` · ${p.count}` : ''} · ${wordFor(c)}`}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <GroupBadge slug={p.slug} color={p.color_hex} size="lg" link={false} />
                  <span
                    className="tabular"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--ink-2)',
                      lineHeight: 1,
                    }}
                  >
                    {p.count ?? ''}
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GroupVoteBreakdown({
  parties,
  labels,
  badgeSize = 'sm',
}: {
  parties: PartyStanceWithCount[];
  labels: StanceLabels;
  /** Badge diameter. Detail pages use 'md' for a bolder read. */
  badgeSize?: 'xs' | 'sm' | 'md';
}) {
  if (parties.length === 0) return null;

  const byChoice = new Map<ChoiceKey, PartyStanceWithCount[]>();
  for (const p of parties) {
    const key = (COLUMN_ORDER as string[]).includes(p.choice)
      ? (p.choice as ChoiceKey)
      : 'absent';
    const list = byChoice.get(key) ?? [];
    list.push(p);
    byChoice.set(key, list);
  }
  // Bigger blocs first inside each column when counts are known.
  for (const list of byChoice.values()) {
    list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }
  const columns = COLUMN_ORDER.filter((c) => (byChoice.get(c)?.length ?? 0) > 0);

  const wordFor = (c: ChoiceKey): string =>
    c === 'aye'
      ? labels.aye
      : c === 'no'
        ? labels.no
        : c === 'abstention'
          ? labels.abstention
          : labels.absent;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 18,
      }}
    >
      {columns.map((c) => {
        const list = byChoice.get(c)!;
        const color = CHOICE_COLOR[c];
        return (
          <div key={c} style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 7,
                marginBottom: 11,
                borderBottom: `2px solid ${color}`,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color,
                }}
              >
                {wordFor(c)}
              </span>
              <span
                className="tabular"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}
              >
                {list.length}
              </span>
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
              }}
            >
              {list.map((p) => (
                <li
                  key={p.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    minWidth: 0,
                    opacity: c === 'absent' ? 0.6 : 1,
                  }}
                >
                  <GroupBadge slug={p.slug} color={p.color_hex} size={badgeSize} link={false} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      lineHeight: 1.25,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {displayGroupShort(p.name_short)}
                  </span>
                  {p.count != null && (
                    <span
                      className="tabular"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: 'var(--ink-2)',
                        flex: 'none',
                      }}
                    >
                      {p.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
