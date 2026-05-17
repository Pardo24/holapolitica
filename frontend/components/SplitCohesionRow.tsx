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
  // Dissident count — members of the group who voted opposite the
  // group's majority choice. Computed from the same Sí/No/Abst
  // counts so it's symmetric (every group exposed identically). We
  // don't NAME individual dissenters yet (that needs a per-deputy
  // endpoint); the count alone is the journalistic signal — "PSOE 3
  // votaren contra del grup" reads better than a 96% cohesion
  // percentage. Skipped when the group is tiny (size < 5) or had no
  // dissent — no need to render "0 dissidents".
  const cast = row.ayes + row.noes + row.abstentions;
  let dissidents = 0;
  if (cast > 0) {
    const majority = Math.max(row.ayes, row.noes, row.abstentions);
    dissidents = cast - majority;
  }
  const showDissidents = members >= 5 && dissidents > 0;

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
        {showDissidents && (
          <span
            title={`${dissidents} ${dissidents === 1 ? 'dissident' : 'dissidents'}`}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--ink-2)',
              background: 'var(--paper-3)',
              border: '1px solid var(--rule)',
              padding: '0 6px',
              borderRadius: 999,
              letterSpacing: '0.04em',
              flex: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            ↯ {dissidents}
          </span>
        )}
      </div>
      <div
        style={{
          position: 'relative',
          height: 14,
          background: 'var(--paper-3)',
          borderRadius: 7,
          overflow: 'hidden',
        }}
        role="img"
        aria-label={`Sí ${row.ayes}, No ${row.noes}, Abstenció ${row.abstentions}, sense vot ${row.no_vote}`}
      >
        {/* Centre axis — single pixel line so the eye reads "balanced
            around zero" without dominating. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: 1,
            background: 'var(--rule-strong)',
          }}
        />
        {/* Sí grows leftward from the centre. */}
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
        {/* No grows rightward from the centre. Abstencions / no-vote
            are NOT plotted on the bar — they live as faint counts to the
            right so the bar stays a clean two-tone Sí vs No axis. */}
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
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--aye)', fontWeight: 600 }}>{row.ayes}</span>
        <span aria-hidden="true">·</span>
        <span style={{ color: 'var(--no)', fontWeight: 600 }}>{row.noes}</span>
        {(row.abstentions > 0 || row.no_vote > 0) && (
          <span
            title={`Abst ${row.abstentions} · Sense vot ${row.no_vote}`}
            style={{ color: 'var(--ink-3)', fontWeight: 400 }}
          >
            +{row.abstentions + row.no_vote}
          </span>
        )}
      </div>
    </div>
  );
}
