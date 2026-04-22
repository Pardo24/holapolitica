/**
 * Stacked horizontal bar showing vote-choice proportions.
 *
 * The renderer never hides a segment (CLAUDE.md "regla de simetria"): if a
 * group abstained or didn't vote, the user sees that proportionally too.
 */
export function StackedBar({
  d,
  height = 10,
  className = '',
}: {
  d: { aye: number; no: number; abst: number; nv: number };
  height?: number;
  className?: string;
}) {
  const total = d.aye + d.no + d.abst + d.nv;
  if (total === 0) {
    return <div className={`bar ${className}`} style={{ height }} />;
  }
  return (
    <div className={`bar ${className}`} style={{ height }}>
      {d.aye > 0 && (
        <span style={{ width: `${(d.aye / total) * 100}%`, background: 'var(--aye)' }} />
      )}
      {d.no > 0 && (
        <span style={{ width: `${(d.no / total) * 100}%`, background: 'var(--no)' }} />
      )}
      {d.abst > 0 && (
        <span style={{ width: `${(d.abst / total) * 100}%`, background: 'var(--abst)' }} />
      )}
      {d.nv > 0 && (
        <span style={{ width: `${(d.nv / total) * 100}%`, background: 'var(--nv)' }} />
      )}
    </div>
  );
}
