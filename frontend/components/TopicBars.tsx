import type { TopicVoteStat } from '@/lib/api';

const C_AYE = '#16a34a';
const C_NO = '#dc2626';
const C_ABST = '#eab308';
const C_NV = '#9ca3af';

const MIN_N_FOR_HIGHLIGHT = 15;
const MIN_N_TO_SHOW = 5;

/**
 * Per-topic Sí/No/Abstention breakdown for a deputy or group.
 *
 * Methodology (per `docs/research-stats-methodology.md`):
 * - Denominator is votes CAST (Sí+No+Abst). Absent / no-vote not in the
 *   percentage; surfaced separately.
 * - Topics with `cast < 5` are hidden — too few votes to mean anything.
 * - Topics with `5 ≤ cast < 15` show with a "n=X" badge but are not eligible
 *   for highlighting.
 * - The "voted most in favor" + "voted most against" pair is shown when
 *   we have BOTH (otherwise the pair would be asymmetric editorial).
 *
 * Empty case: if no topics have `cast ≥ 5`, we surface a single message
 * pointing to data limitations (currently expected: only session 177 is
 * loaded and most votes don't yet link to classified initiatives).
 */
export function TopicBars({
  rows,
  emptyHint,
}: {
  rows: TopicVoteStat[];
  emptyHint?: string;
}) {
  const significant = rows.filter((r) => r.cast >= MIN_N_TO_SHOW);
  if (significant.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        {emptyHint ?? 'Encara no hi ha prou dades classificades per mostrar aquesta vista.'}
      </p>
    );
  }
  const eligible = significant.filter((r) => r.cast >= MIN_N_FOR_HIGHLIGHT);
  const sortedAye = [...eligible].sort(
    (a, b) => (b.ayes / b.cast) - (a.ayes / a.cast),
  );
  const sortedNo = [...eligible].sort(
    (a, b) => (b.noes / b.cast) - (a.noes / a.cast),
  );
  const topAye = sortedAye[0];
  const topNo = sortedNo[0];
  // Only highlight if BOTH ends are available — never one-sided.
  const showHighlights = topAye && topNo && topAye.topic_slug !== topNo.topic_slug;

  // The remaining rows go in the "see more" details, sorted by cast desc.
  const highlightedSet = new Set(
    showHighlights ? [topAye!.topic_slug, topNo!.topic_slug] : [],
  );
  const rest = significant
    .filter((r) => !highlightedSet.has(r.topic_slug))
    .sort((a, b) => b.cast - a.cast);

  return (
    <div className="space-y-3">
      {showHighlights && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <HighlightCard
            label="Tema amb més suport"
            row={topAye!}
            metric={topAye!.ayes / topAye!.cast}
            metricLabel="% Sí"
            metricColor={C_AYE}
          />
          <HighlightCard
            label="Tema amb més rebuig"
            row={topNo!}
            metric={topNo!.noes / topNo!.cast}
            metricLabel="% No"
            metricColor={C_NO}
          />
        </div>
      )}

      {rest.length > 0 && (
        <details className="group/topics">
          <summary className="cursor-pointer text-sm py-2 px-3 rounded border hover:bg-[hsl(var(--muted))] inline-block list-none">
            <span className="group-open/topics:hidden">
              Mostra els {rest.length} {rest.length === 1 ? 'altre tema' : 'altres temes'}
            </span>
            <span className="hidden group-open/topics:inline">Amaga</span>
          </summary>
          <ul className="mt-3 space-y-2">
            {rest.map((r) => (
              <TopicBarRow key={r.topic_slug} row={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function HighlightCard({
  label,
  row,
  metric,
  metricLabel,
  metricColor,
}: {
  label: string;
  row: TopicVoteStat;
  metric: number;
  metricLabel: string;
  metricColor: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="font-semibold text-base mt-1">{row.topic_name_ca}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold tabular-nums" style={{ color: metricColor }}>
          {(metric * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{metricLabel}</span>
      </div>
      <div className="mt-2">
        <TopicBar row={row} />
      </div>
      <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 tabular-nums">
        {row.cast} vots emesos · {row.no_vote} no vota / absent
      </div>
    </div>
  );
}

function TopicBarRow({ row }: { row: TopicVoteStat }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-sm font-medium truncate">{row.topic_name_ca}</span>
      <TopicBar row={row} />
      <BarLegend row={row} />
    </li>
  );
}

function TopicBar({ row }: { row: TopicVoteStat }) {
  const total = row.cast + row.no_vote;
  if (total === 0) return null;
  const segs = [
    { n: row.ayes, color: C_AYE, label: 'Sí' },
    { n: row.noes, color: C_NO, label: 'No' },
    { n: row.abstentions, color: C_ABST, label: 'Abstenció' },
    { n: row.no_vote, color: C_NV, label: 'No vota / absent' },
  ];
  return (
    <div
      className="h-3 rounded-full overflow-hidden border bg-[hsl(var(--muted))] flex"
      role="img"
      aria-label={segs
        .filter((s) => s.n > 0)
        .map((s) => `${s.label}: ${s.n}`)
        .join(', ')}
    >
      {segs.map((s) =>
        s.n > 0 ? (
          <span
            key={s.label}
            title={`${s.label}: ${s.n}`}
            style={{ background: s.color, width: `${(s.n / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function BarLegend({ row }: { row: TopicVoteStat }) {
  const badge = row.cast < MIN_N_FOR_HIGHLIGHT ? (
    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] border rounded px-1 py-0.5">
      n={row.cast}
    </span>
  ) : null;
  return (
    <span className="text-[11px] tabular-nums text-[hsl(var(--muted-foreground))] flex items-center gap-2">
      <span style={{ color: C_AYE }}>✓ {row.ayes}</span>
      <span style={{ color: C_NO }}>✗ {row.noes}</span>
      <span style={{ color: C_ABST }}>○ {row.abstentions}</span>
      {badge}
    </span>
  );
}
