/**
 * Symbolic hemicycle composition. Renders one tiny square per seat, in arc
 * rows where outer rows have more seats than inner rows. Aesthetically
 * familiar without being literal — we don't claim to reproduce the actual
 * seating chart, only the proportional composition.
 *
 * The order is preserved as the caller passes it: ie. groups should be
 * sorted left-to-right by political family before passing in. Internally
 * we lay them out one row at a time, left-to-right, pulling from a flat
 * array of `members` slots × N groups.
 */
export function Hemicycle({
  groups,
  rows = 11,
}: {
  groups: { slug: string; members: number; color: string | null }[];
  rows?: number;
}) {
  const totalSeats = groups.reduce((acc, g) => acc + g.members, 0);
  if (totalSeats === 0) return null;

  // Flatten the group composition into a single array of seat-color tokens
  const seats: { color: string; slug: string }[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.members; i++) {
      seats.push({ color: g.color ?? '#9ca3af', slug: g.slug });
    }
  }

  // Distribute total seats per arc row proportional to the row "width" — outer
  // rows are wider, so they get more seats.
  const rowSizes: number[] = [];
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    const w = Math.round((totalSeats * (r + 3.5)) / (rows * 4 + 13));
    rowSizes.push(w);
    acc += w;
  }
  rowSizes[rows - 1] = (rowSizes[rows - 1] ?? 0) + (totalSeats - acc);

  let cursor = 0;
  const rowsRender: { color: string; slug: string }[][] = rowSizes.map((n) => {
    const slice = seats.slice(cursor, cursor + n);
    cursor += n;
    return slice;
  });

  return (
    <div
      style={{
        aspectRatio: '2.2 / 1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 6,
        padding: '8px 0',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
      role="img"
      aria-label={`Composition: ${totalSeats} seats across ${groups.length} groups`}
    >
      {rowsRender.map((seatRow, r) => (
        <div
          key={r}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 3,
            flexWrap: 'wrap',
            maxWidth: '100%',
          }}
        >
          {seatRow.map((s, i) => (
            <span
              key={i}
              title={s.slug}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: s.color,
                opacity: r < 2 ? 0.6 : 0.9,
                flex: 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
