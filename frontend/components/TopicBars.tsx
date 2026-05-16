import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';

import type { Topic, TopicVoteStat } from '@/lib/api';
import { resolveTopicName } from '@/lib/topics';

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
export async function TopicBars({
  rows,
  emptyHint,
  groupSlug,
  allTopics,
}: {
  rows: TopicVoteStat[];
  emptyHint?: string;
  /**
   * When present, the highlighted "most-supported" / "most-rejected"
   * cards link to ``/topics/<slug>?group=<groupSlug>`` so a reader can
   * jump into the topic detail filtered by the current group. Used by
   * the group detail page; persons pages leave it undefined.
   */
  groupSlug?: string;
  /**
   * Full topic catalogue with ``name_es`` / ``name_en`` so the row
   * labels can localise. The backend's ``TopicVoteStat`` only carries
   * ``topic_name_ca`` to keep the per-group matrix lean; we resolve
   * the localised name client-side via this lookup. Optional —
   * callers that don't pass it (or pass an empty list) fall back to
   * Catalan, which is the original behaviour.
   */
  allTopics?: Topic[];
}) {
  const t = await getTranslations('topic_bars');
  const locale = await getLocale();
  const nameOf = (r: TopicVoteStat) =>
    resolveTopicName(r.topic_slug, allTopics, locale, r.topic_name_ca);
  const significant = rows.filter((r) => r.cast >= MIN_N_TO_SHOW);
  if (significant.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        {emptyHint ?? t('empty_default')}
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
            label={t('most_support')}
            row={topAye!}
            name={nameOf(topAye!)}
            metric={topAye!.ayes / topAye!.cast}
            metricLabel={`% ${t('label_aye')}`}
            metricColor={C_AYE}
            castCaption={t('votes_cast', { cast: topAye!.cast, nv: topAye!.no_vote })}
            groupSlug={groupSlug}
          />
          <HighlightCard
            label={t('most_rejection')}
            row={topNo!}
            name={nameOf(topNo!)}
            metric={topNo!.noes / topNo!.cast}
            metricLabel={`% ${t('label_no')}`}
            metricColor={C_NO}
            castCaption={t('votes_cast', { cast: topNo!.cast, nv: topNo!.no_vote })}
            groupSlug={groupSlug}
          />
        </div>
      )}

      {rest.length > 0 && (
        <details className="group/topics">
          <summary className="cursor-pointer text-sm py-2 px-3 rounded border hover:bg-[hsl(var(--muted))] inline-block list-none">
            <span className="group-open/topics:hidden">
              {t('show_more', { count: rest.length })}
            </span>
            <span className="hidden group-open/topics:inline">{t('hide')}</span>
          </summary>
          <ul
            style={{
              listStyle: 'none',
              margin: '12px 0 0',
              padding: 0,
              borderTop: '1px solid var(--rule)',
            }}
          >
            {rest.map((r) => (
              <TopicBarRow
                key={r.topic_slug}
                row={r}
                name={nameOf(r)}
                labels={{
                  aye: t('label_aye'),
                  no: t('label_no'),
                  abst: t('label_abst'),
                  nv: t('label_nv'),
                }}
                stanceLabels={{
                  aye_pct: (pct: number) => t('stance_aye_pct', { pct }),
                  no_pct: (pct: number) => t('stance_no_pct', { pct }),
                  abst_pct: (pct: number) => t('stance_abst_pct', { pct }),
                  divided: t('stance_divided'),
                  low_confidence_aria: t('low_confidence_aria'),
                }}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface BarLabels {
  aye: string;
  no: string;
  abst: string;
  nv: string;
}

function HighlightCard({
  label,
  row,
  name,
  metric,
  metricLabel,
  metricColor,
  castCaption,
  groupSlug,
}: {
  label: string;
  row: TopicVoteStat;
  name: string;
  metric: number;
  metricLabel: string;
  metricColor: string;
  castCaption: string;
  groupSlug?: string;
}) {
  const body = (
    <>
      <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
        <span>{label}</span>
        {groupSlug && (
          <ArrowUpRight
            size={12}
            aria-hidden="true"
            className="ml-auto opacity-60"
          />
        )}
      </div>
      <div className="font-semibold text-base mt-1">{name}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-3xl font-bold tabular-nums" style={{ color: metricColor }}>
          {(metric * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{metricLabel}</span>
      </div>
      <div className="mt-2">
        <TopicBar row={row} labels={null} />
      </div>
      <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 tabular-nums">
        {castCaption}
      </div>
    </>
  );
  if (groupSlug) {
    const href =
      `/topics/${row.topic_slug}?group=${encodeURIComponent(groupSlug)}` as Route;
    return (
      <Link
        href={href}
        className="topic-highlight-link rounded-lg border p-4 block"
        style={{ color: 'inherit', textDecoration: 'none' }}
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-lg border p-4">{body}</div>;
}

/**
 * Stance-led row for a single topic.
 *
 * Layout (top to bottom):
 *   1. Topic name on its own line — no truncation, reads like a
 *      headline so the reader knows the subject before the figure.
 *   2. Stance phrase + segmented bar on the same line. Stance is the
 *      dominant percentage rendered in the same colour the bar uses
 *      for that segment (green / red / yellow). Below 50% in any
 *      single direction we say "Dividit" in neutral ink; we
 *      deliberately don't compute a "majority of cast" stance because
 *      that would invent a finer threshold than the underlying data
 *      supports.
 *   3. A `n=X` badge tags rows below the highlight threshold so the
 *      reader can tell which percentages are statistically thin.
 *
 * Skim path: percentage → bar → topic name. Exact Sí/No/Abst counts
 * are preserved on the bar's `aria-label` and per-segment `title` so
 * a hover / screen-reader still gets them, but they don't crowd the
 * default view.
 */
function TopicBarRow({
  row,
  name,
  labels,
  stanceLabels,
}: {
  row: TopicVoteStat;
  name: string;
  labels: BarLabels;
  stanceLabels: StanceLabels;
}) {
  const stance = computeStance(row, stanceLabels);
  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink)',
          lineHeight: 1.3,
        }}
      >
        {name}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: stance.color,
            flex: 'none',
            minWidth: 124,
            // Cap the stance phrase so a long translation can't push
            // the segmented bar below its own minimum width. The bar
            // is the second visual signal and must stay readable.
            maxWidth: 180,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {stance.label}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <TopicBar row={row} labels={labels} />
        </span>
        {row.cast < MIN_N_FOR_HIGHLIGHT && (
          <span
            className="tabular"
            aria-label={stanceLabels.low_confidence_aria}
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
              border: '1px solid var(--rule)',
              borderRadius: 4,
              padding: '1px 5px',
              flex: 'none',
            }}
          >
            n={row.cast}
          </span>
        )}
      </div>
    </li>
  );
}

interface StanceLabels {
  aye_pct: (pct: number) => string;
  no_pct: (pct: number) => string;
  abst_pct: (pct: number) => string;
  divided: string;
  low_confidence_aria: string;
}

interface Stance {
  label: string;
  color: string;
}

/**
 * Pick the dominant stance for the row.
 *
 * "Dominant" = the choice with the largest share ≥ 50% of casts. Below
 * 50% in all three directions we return "Dividit" — the user can't
 * read a clear position from the data and we don't invent one.
 */
function computeStance(row: TopicVoteStat, l: StanceLabels): Stance {
  if (row.cast === 0) return { label: l.divided, color: 'var(--ink-2)' };
  const ayePct = row.ayes / row.cast;
  const noPct = row.noes / row.cast;
  const abstPct = row.abstentions / row.cast;
  if (ayePct >= 0.5 && ayePct >= noPct && ayePct >= abstPct) {
    return { label: l.aye_pct(Math.round(ayePct * 100)), color: C_AYE };
  }
  if (noPct >= 0.5 && noPct >= ayePct && noPct >= abstPct) {
    return { label: l.no_pct(Math.round(noPct * 100)), color: C_NO };
  }
  if (abstPct >= 0.5 && abstPct >= ayePct && abstPct >= noPct) {
    return { label: l.abst_pct(Math.round(abstPct * 100)), color: C_ABST };
  }
  return { label: l.divided, color: 'var(--ink-2)' };
}

function TopicBar({ row, labels }: { row: TopicVoteStat; labels: BarLabels | null }) {
  const total = row.cast + row.no_vote;
  if (total === 0) return null;
  // labels can be null when called from HighlightCard, where the bar is
  // purely visual decoration and the surrounding row provides context. We
  // fall back to language-neutral short tokens that match the segment
  // colours.
  const l = labels ?? { aye: 'Aye', no: 'No', abst: 'Abst', nv: 'NV' };
  const segs = [
    { n: row.ayes, color: C_AYE, label: l.aye },
    { n: row.noes, color: C_NO, label: l.no },
    { n: row.abstentions, color: C_ABST, label: l.abst },
    { n: row.no_vote, color: C_NV, label: l.nv },
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

