import { displayGroupShort } from '@/lib/groups';

/**
 * How the chamber split on one vote: the ribbon, the tally, and the
 * per-group detail behind a disclosure.
 *
 * One component for every surface that answers "who voted what" - the laws
 * list, the law page, the plenary sheet - so the same vote can't look like
 * three different things depending on where you meet it.
 *
 * ``deputies`` is optional because the two sources differ: the laws list
 * carries how many deputies of each group backed the stance, while the
 * per-vote group-choices endpoint carries only the stance. When it is
 * missing the groups inside a side share that side's width equally; the
 * widths BETWEEN sides always come from the real tally, so nothing is
 * invented either way.
 *
 * Neutrality: both sides render through the same code, ordered by size
 * (or by name when sizes are unknown), never by side.
 */

export interface VoteSplitGroup {
  slug: string;
  name_short: string;
  color_hex: string | null;
  /** "aye" | "no" | "abstention"; anything else is not a position. */
  choice: string;
  deputies?: number;
  /** Party emblem when one is on file; falls back to the colour disc. */
  logo_url?: string | null;
}

export interface VoteSplitLabels {
  eyebrow: string;
  inFavour: string;
  against: string;
  abstention: string;
  detail: string;
  sideEmpty: string;
  noBreakdown: string;
}

export function VoteSplit({
  ayes,
  noes,
  abstentions,
  absent,
  groups,
  labels,
  date,
  /** "lg" gives the detail open by default: on a law's own page the
   *  breakdown is the point, not an extra. */
  size = 'sm',
}: {
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
  groups: VoteSplitGroup[];
  labels: VoteSplitLabels;
  date?: string | null;
  size?: 'sm' | 'lg';
}) {
  const inFavour = groups.filter((g) => g.choice === 'aye');
  const against = groups.filter((g) => g.choice === 'no');
  const abstained = groups.filter((g) => g.choice === 'abstention');
  const big = size === 'lg';
  const zones = [
    { key: 'aye', color: 'var(--aye)', count: ayes },
    { key: 'abstention', color: 'var(--abst)', count: abstentions },
    { key: 'no', color: 'var(--no)', count: noes },
    { key: 'absent', color: 'var(--nv)', count: absent },
  ];

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span style={EYEBROW}>{labels.eyebrow}</span>
        {date && (
          <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {date}
          </span>
        )}
      </div>

      {/* In a list the ribbon came first and asked the reader to decode
          nine party colours before learning the result. The plain tally
          leads instead, and the ribbon waits inside the detail. On a law's
          own page (size="lg") the breakdown IS the content, so it stays. */}
      {big && <Ribbon zones={zones} groups={groups} height={18} />}

      <div
        className="tabular"
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          marginTop: big ? 8 : 0,
          fontSize: big ? 14 : 13,
          color: 'var(--ink-2)',
        }}
      >
        <Tally color="var(--aye)" label={labels.inFavour} n={ayes} />
        <Tally color="var(--no)" label={labels.against} n={noes} />
        <Tally color="var(--abst)" label={labels.abstention} n={abstentions} />
      </div>

      {groups.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
          {labels.noBreakdown}
        </p>
      ) : (
        <details open={big} style={{ marginTop: 10 }}>
          <summary
            style={{ fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', listStyle: 'revert' }}
          >
            {labels.detail}
          </summary>
          {!big && (
            <div style={{ marginTop: 10 }}>
              <Ribbon zones={zones} groups={groups} height={13} />
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 10,
              marginTop: 10,
            }}
          >
            <StanceColumn
              label={labels.inFavour}
              color="var(--aye)"
              groups={inFavour}
              emptyLabel={labels.sideEmpty}
            />
            <StanceColumn
              label={labels.against}
              color="var(--no)"
              groups={against}
              emptyLabel={labels.sideEmpty}
            />
            {abstained.length > 0 && (
              <StanceColumn
                label={labels.abstention}
                color="var(--abst)"
                groups={abstained}
                emptyLabel={labels.sideEmpty}
              />
            )}
          </div>
        </details>
      )}
    </>
  );
}

const EYEBROW: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

/**
 * The chamber as one ribbon: each side takes the width its votes earned,
 * and inside it every group takes the width its deputies earned, painted in
 * the group's own colour. A rail underneath repeats the side colour so the
 * sides stay unmistakable even though the segments are party-coloured.
 *
 * Decorative: the tally and the detail below carry the same information in
 * text, so screen readers skip it.
 */
function Ribbon({
  zones,
  groups,
  height,
}: {
  zones: { key: string; color: string; count: number }[];
  groups: VoteSplitGroup[];
  height: number;
}) {
  const visible = zones.filter((z) => z.count > 0);
  if (visible.length === 0) return null;

  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: 3 }}>
      {visible.map((zone) => {
        const inZone = groups.filter((g) => g.choice === zone.key);
        return (
          <div key={zone.key} style={{ flex: `${zone.count} 0 0`, minWidth: 2 }}>
            <div
              style={{
                display: 'flex',
                gap: 1,
                height,
                borderRadius: 3,
                overflow: 'hidden',
                // The gaps between segments show this colour through, so the
                // bar reads as green-or-red at a glance and still shows how
                // many groups make up each side.
                background: 'var(--paper-2)',
              }}
            >
              {inZone.map((g) => (
                <span
                  key={g.slug}
                  title={`${displayGroupShort(g.name_short)}${g.deputies ? ` · ${g.deputies}` : ''}`}
                  style={{
                    // Equal slices when the per-group counts are unknown.
                    flex: `${g.deputies ?? 1} 0 0`,
                    // The side's colour, never the party's: the question the
                    // bar answers is "did it pass", and party colours made
                    // the reader decode nine hues first.
                    background: zone.color,
                    minWidth: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ height: 3, borderRadius: 999, background: zone.color, marginTop: 2 }} />
          </div>
        );
      })}
    </div>
  );
}

function Tally({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: 'none' }}
      />
      <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{n}</strong> {label}
    </span>
  );
}

function StanceColumn({
  label,
  color,
  groups,
  emptyLabel,
}: {
  label: string;
  color: string;
  groups: VoteSplitGroup[];
  emptyLabel: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 999, background: color, flex: 'none' }}
        />
        <span style={EYEBROW}>{label}</span>
      </div>
      {groups.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {groups.map((g) => (
            <span
              key={g.slug}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                maxWidth: '100%',
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid var(--rule)',
                background: 'var(--paper)',
                fontSize: 12,
                color: 'var(--ink)',
              }}
            >
              {/* The party's emblem, so it is recognised rather than
                  decoded. Groups with no logo on file keep the colour disc. */}
              {g.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.logo_url}
                  alt=""
                  width={14}
                  height={14}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: 14,
                    height: 14,
                    flex: 'none',
                    borderRadius: 999,
                    objectFit: 'cover',
                    background: '#fff',
                    border: '1px solid rgba(0,0,0,.06)',
                  }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: g.color_hex ?? 'var(--ink-3)',
                    flex: 'none',
                  }}
                />
              )}
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {displayGroupShort(g.name_short)}
              </span>
              {g.deputies != null && (
                <span className="tabular" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                  {g.deputies}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
