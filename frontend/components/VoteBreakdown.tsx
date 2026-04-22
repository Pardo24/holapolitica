/**
 * Number-row that lives below a stacked bar showing Sí / No / Abst counts.
 * Designed to be readable at a glance — the digits are the primary info,
 * the choice label is a quiet sub-line. Three sizes for different contexts.
 */
export function VoteBreakdown({
  ayes,
  noes,
  abstentions,
  size = 'md',
  labels = { ayes: 'Sí', noes: 'No', abstentions: 'Abst.' },
}: {
  ayes: number;
  noes: number;
  abstentions: number;
  size?: 'sm' | 'md' | 'lg';
  labels?: { ayes: string; noes: string; abstentions: string };
}) {
  const numFontPx = size === 'sm' ? 14 : size === 'md' ? 17 : 24;
  const labelFontPx = size === 'sm' ? 9 : 10;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        marginTop: 6,
      }}
      className="vote-breakdown"
    >
      <Cell n={ayes} label={labels.ayes} color="var(--aye)" numFontPx={numFontPx} labelFontPx={labelFontPx} />
      <Cell n={noes} label={labels.noes} color="var(--no)" numFontPx={numFontPx} labelFontPx={labelFontPx} />
      <Cell
        n={abstentions}
        label={labels.abstentions}
        color="var(--abst)"
        numFontPx={numFontPx}
        labelFontPx={labelFontPx}
      />
    </div>
  );
}

function Cell({
  n,
  label,
  color,
  numFontPx,
  labelFontPx,
}: {
  n: number;
  label: string;
  color: string;
  numFontPx: number;
  labelFontPx: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            background: color,
            borderRadius: 999,
            display: 'inline-block',
            flex: 'none',
            transform: 'translateY(-1px)',
          }}
        />
        <span
          className="tabular"
          style={{
            fontSize: numFontPx,
            fontWeight: 600,
            color,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {n}
        </span>
      </div>
      <span
        style={{
          fontSize: labelFontPx,
          color: 'var(--ink-3)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginTop: 2,
          paddingLeft: 13,
        }}
      >
        {label}
      </span>
    </div>
  );
}
