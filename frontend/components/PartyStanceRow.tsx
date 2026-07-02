import { Check, Minus, X } from 'lucide-react';

import type { GroupVoteChoiceRow } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Ambient "who voted for / against" strip, shared by the session sheet and
 * the law-detail page. One small chip per group — its colour disc +
 * abbreviation, ringed green (for) / red (against) / amber (abstention) /
 * grey (absent). Non-invasive but tells you at a glance which parties backed
 * or opposed the law. Group + stance on hover (``title``).
 */

export interface PartyStance {
  slug: string;
  name_short: string;
  color_hex: string | null;
  choice: string;
}

export interface StanceLabels {
  aye: string;
  no: string;
  abstention: string;
  absent: string;
}

const STANCE_RING: Record<string, string> = {
  aye: 'var(--aye, #16A34A)',
  no: 'var(--no, #DC2626)',
  abstention: 'var(--abst, #CA8A04)',
  absent: 'var(--rule-strong)',
};
const STANCE_ORDER: Record<string, number> = { aye: 0, no: 1, abstention: 2, absent: 3 };

/** Reshape the ``/votes/group-choices`` response into ``voteId -> parties``. */
export function buildStanceByVote(groups: GroupVoteChoiceRow[]): Map<number, PartyStance[]> {
  const map = new Map<number, PartyStance[]>();
  for (const g of groups) {
    for (const [voteIdStr, choice] of Object.entries(g.choices)) {
      const vid = Number(voteIdStr);
      const list = map.get(vid) ?? [];
      list.push({ slug: g.slug, name_short: g.name_short, color_hex: g.color_hex, choice });
      map.set(vid, list);
    }
  }
  return map;
}

/**
 * Ultra-compact stance strip for dense list rows (pleno sheet, vote
 * cards): a small ✓ / ✗ / − glyph per stance followed by the groups as
 * plain colour discs — no pills, no names, no rings. The full name +
 * stance stays reachable via the ``title`` tooltip, and the detail
 * pages carry the explicit GroupVoteBreakdown. Absent groups are
 * omitted here on purpose: in a scanning context they're noise.
 */
export function PartyStanceMini({
  parties,
  labels,
}: {
  parties: PartyStance[];
  labels: StanceLabels;
}) {
  if (parties.length === 0) return null;
  const stanceWord = (c: string): string =>
    c === 'aye' ? labels.aye : c === 'no' ? labels.no : labels.abstention;
  const clusters: { key: string; color: string; Icon: typeof Check }[] = [
    { key: 'aye', color: 'var(--aye, #16A34A)', Icon: Check },
    { key: 'no', color: 'var(--no, #DC2626)', Icon: X },
    { key: 'abstention', color: 'var(--abst, #CA8A04)', Icon: Minus },
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        marginTop: 8,
      }}
    >
      {clusters.map(({ key, color, Icon }) => {
        const members = parties.filter((p) => p.choice === key);
        if (members.length === 0) return null;
        return (
          <span
            key={key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Icon
              size={12}
              strokeWidth={3}
              aria-label={stanceWord(key)}
              style={{ color, flex: 'none' }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {members.map((p, i) => (
                <span
                  key={p.slug}
                  title={`${displayGroupShort(p.name_short)} · ${stanceWord(key)}`}
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 999,
                    background: p.color_hex ?? 'var(--ink-3)',
                    display: 'inline-block',
                    flex: 'none',
                    // Overlapping avatar-stack look; the paper-colour
                    // halo keeps neighbouring discs distinguishable.
                    marginLeft: i === 0 ? 0 : -4,
                    boxShadow: '0 0 0 1.5px var(--paper)',
                  }}
                />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function PartyStanceRow({
  parties,
  labels,
}: {
  parties: PartyStance[];
  labels: StanceLabels;
}) {
  if (parties.length === 0) return null;
  const stanceWord = (c: string): string =>
    c === 'aye'
      ? labels.aye
      : c === 'no'
        ? labels.no
        : c === 'abstention'
          ? labels.abstention
          : labels.absent;
  const sorted = [...parties].sort(
    (a, b) => (STANCE_ORDER[a.choice] ?? 9) - (STANCE_ORDER[b.choice] ?? 9),
  );
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
      {sorted.map((p) => (
        <span
          key={p.slug}
          title={`${displayGroupShort(p.name_short)} · ${stanceWord(p.choice)}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '1px 8px 1px 3px',
            borderRadius: 999,
            background: 'var(--paper-2)',
            boxShadow: `0 0 0 1.5px ${STANCE_RING[p.choice] ?? 'var(--rule)'}`,
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--ink-2)',
            opacity: p.choice === 'absent' ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: p.color_hex ?? 'var(--ink-3)',
              flex: 'none',
            }}
          />
          {displayGroupShort(p.name_short)}
        </span>
      ))}
    </div>
  );
}
