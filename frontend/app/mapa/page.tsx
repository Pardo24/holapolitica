import { getTranslations } from 'next-intl/server';
import { Map as MapIcon } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { LegislatureSelector } from '@/components/LegislatureSelector';
import {
  api,
  type CoincidenceCell,
  type Legislature,
  type ParliamentaryGroupSummary,
} from '@/lib/api';
import { displayGroupShort, groupAbbreviation } from '@/lib/groups';
import { layoutFromSimilarity } from '@/lib/mds';

export const revalidate = 300;

interface SearchParams {
  legislature?: string;
}

/**
 * "El Mapa" — the empirical political compass. Each party is placed by HOW it
 * votes, not by what it says it is: positions come from the pairwise
 * coincidence matrix (parties that vote alike sit close). Axes carry no
 * inherent meaning; only proximity and clustering are interpretable.
 */
export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('map');
  const tVotes = await getTranslations('votes');
  const { legislature } = await searchParams;

  const legislatures: Legislature[] = await api.legislatures
    .list()
    .then((rows) => rows.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)))
    .catch(() => [] as Legislature[]);
  const activeLeg = legislatures.find((l) => l.status === 'active') ?? legislatures[0] ?? null;
  const requestedId = legislature ? Number(legislature) : null;
  const selectedLeg =
    (requestedId != null && legislatures.find((l) => l.id === requestedId)) || activeLeg;
  const selectedLegId = selectedLeg?.id;

  let groups: ParliamentaryGroupSummary[] = [];
  let cells: CoincidenceCell[] = [];
  if (selectedLegId != null) {
    [groups, cells] = await Promise.all([
      api.groups.list(selectedLegId).catch(() => [] as ParliamentaryGroupSummary[]),
      api.metrics.coincidence(selectedLegId).catch(() => [] as CoincidenceCell[]),
    ]);
  }

  // Similarity lookup from the coincidence cells.
  const coinc = new Map<string, number | null>();
  for (const c of cells) coinc.set(`${c.group_a_slug}|${c.group_b_slug}`, c.coincidence);
  const similarity = (a: string, b: string): number | null =>
    coinc.get(`${a}|${b}`) ?? coinc.get(`${b}|${a}`) ?? null;

  // Only place groups that actually have coincidence data.
  const placeable = groups.filter(
    (g) => cells.some((c) => c.group_a_slug === g.slug) || cells.some((c) => c.group_b_slug === g.slug),
  );
  const slugs = placeable.map((g) => g.slug);
  const layout = layoutFromSimilarity(slugs, similarity);

  const W = 600;
  const H = 460;
  const maxMembers = Math.max(1, ...placeable.map((g) => g.members_active));

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MapIcon size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />

      {legislatures.length > 1 && selectedLegId != null && (
        <div style={{ paddingTop: 16 }}>
          <LegislatureSelector
            legislatures={legislatures}
            activeId={activeLeg?.id ?? null}
            selectedId={selectedLegId}
            label={tVotes('legislature_label')}
            currentSuffix={tVotes('legislature_current')}
          />
        </div>
      )}

      {placeable.length < 2 ? (
        <p style={{ fontSize: 14, color: 'var(--ink-3)', paddingTop: 18 }}>{t('unavailable')}</p>
      ) : (
        <div style={{ paddingTop: 16 }}>
          <div
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 12,
              background: 'var(--paper-2)',
              padding: 8,
            }}
          >
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('title')}>
              {placeable.map((g) => {
                const p = layout.get(g.slug);
                if (!p) return null;
                const cx = p.x * W;
                const cy = p.y * H;
                const r = 10 + 30 * Math.sqrt(g.members_active / maxMembers);
                const color = g.color_hex ?? 'var(--ink-3)';
                return (
                  <g key={g.slug}>
                    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.82} />
                    <text
                      x={cx}
                      y={cy + 3}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="#fff"
                    >
                      {groupAbbreviation(g.slug)}
                    </text>
                    <text
                      x={cx}
                      y={cy - r - 5}
                      textAnchor="middle"
                      fontSize={11.5}
                      fontWeight={600}
                      fill="var(--ink)"
                    >
                      {displayGroupShort(g.name_short)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p
            style={{
              marginTop: 14,
              fontSize: 12.5,
              color: 'var(--ink-3)',
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            {t('note')}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
            {t('size_note')}
            {selectedLeg ? ` · ${new Date(selectedLeg.start_date).getFullYear()}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
