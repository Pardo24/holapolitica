import { GroupBadge } from '@/components/GroupBadge';
import type { CohesionResult } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Center-anchored cohesion row. Sí grows leftward from the centre, No grows
 * rightward, abstentions and no-votes are placed beyond each side so the
 * bar always sums to the full group size. The visual is symmetric by
 * construction — neither vote choice gets visual priority over the other.
 *
 * The denominator is the group's *member count*, not "votes cast", so a
 * row with a big empty middle band reads as low attendance.
 */
export function SplitCohesionRow({ row }: { row: CohesionResult }) {
  const members = Math.max(
    row.ayes + row.noes + row.abstentions + row.no_vote,
    1,
  );
  const half = 50; // %
  const ayePct = (row.ayes / members) * half;
  const noPct = (row.noes / members) * half;
  // Abstentions and no-vote are split evenly across both sides so they
  // don't disturb the centre axis or take a side.
  const abstPct = (row.abstentions / members) * 100;
  const nvPct = (row.no_vote / members) * 100;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr) 90px',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <GroupBadge slug={row.group_slug} color={row.group_color_hex} size="xs" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {displayGroupShort(row.group_name_short)}
        </span>
        <span className="tabular" style={{ fontSize: 10, color: 'var(--ink-3)', flex: 'none' }}>
          {members}
        </span>
      </div>
      <div
        style={{ position: 'relative', height: 18, background: 'var(--paper-3)' }}
        role="img"
        aria-label={`Sí ${row.ayes}, No ${row.noes}, Abst ${row.abstentions}, NV ${row.no_vote}`}
      >
        <div
          style={{
            position: 'absolute',
            top: -2,
            bottom: -2,
            left: '50%',
            width: 1,
            background: 'var(--ink)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: '50%',
            width: `${ayePct}%`,
            background: 'var(--aye)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: `${noPct}%`,
            background: 'var(--no)',
          }}
        />
        {row.abstentions > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: `calc(50% + ${ayePct}%)`,
              width: `${abstPct / 2}%`,
              background: 'var(--abst)',
            }}
          />
        )}
        {row.no_vote > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: `calc(50% + ${ayePct + abstPct / 2}%)`,
              width: `${nvPct / 2}%`,
              background: 'var(--nv)',
            }}
          />
        )}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: 'var(--aye)', fontWeight: 600 }}>{row.ayes}</span>
        <span aria-hidden="true">·</span>
        <span style={{ color: 'var(--no)', fontWeight: 600 }}>{row.noes}</span>
      </div>
    </div>
  );
}
