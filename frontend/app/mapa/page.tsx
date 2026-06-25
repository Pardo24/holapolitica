import { getTranslations } from 'next-intl/server';
import { Map as MapIcon } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { LegislatureSelector } from '@/components/LegislatureSelector';
import { api, type Legislature, type ParliamentaryGroupSummary } from '@/lib/api';
import { displayGroupShort, groupAbbreviation } from '@/lib/groups';
import { chesScore } from '@/lib/ches';

export const revalidate = 300;

interface SearchParams {
  legislature?: string;
}

const W = 600;
const H = 480;

/** A party rendered on the map: a colored disc with a label. */
interface Node {
  slug: string;
  nameShort: string;
  color: string;
  r: number;
  cx: number;
  cy: number;
}

/** Nudge overlapping discs apart so close-but-distinct parties stay legible.
 *  A few light passes; only acts on real overlaps, then clamps to the plot. */
function separate(nodes: Node[], minX: number, maxX: number, minY: number, maxY: number): void {
  for (let pass = 0; pass < 120; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let d = Math.sqrt(dx * dx + dy * dy);
        const need = a.r + b.r + 4;
        if (d >= need) continue;
        if (d < 0.01) {
          // Identical position: break the tie deterministically by index.
          dx = (j % 2 === 0 ? 1 : -1) * 0.5;
          dy = 0.5;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        const push = (need - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.cx -= ux * push;
        a.cy -= uy * push;
        b.cx += ux * push;
        b.cy += uy * push;
      }
    }
    for (const n of nodes) {
      n.cx = Math.min(maxX, Math.max(minX, n.cx));
      n.cy = Math.min(maxY, Math.max(minY, n.cy));
    }
  }
}

/**
 * "El Mapa" — each party placed on an economic left-right axis (x) and a social
 * progressive-conservative axis (y), using the Chapel Hill Expert Survey. This
 * is an external academic placement, cited below — not our own judgment. Each
 * legislature uses the CHES wave closest to it.
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
  if (selectedLegId != null) {
    groups = await api.groups.list(selectedLegId).catch(() => [] as ParliamentaryGroupSummary[]);
  }

  const maxMembers = Math.max(1, ...groups.map((g) => g.members_active));
  const discR = (g: ParliamentaryGroupSummary): number =>
    10 + 30 * Math.sqrt(g.members_active / maxMembers);

  // Place each party from its CHES left-right (x) and progressive-conservative
  // (y) scores, using the wave closest to this legislature.
  const margin = 52;
  const minX = margin;
  const maxX = W - margin;
  const minY = margin;
  const maxY = H - margin;
  const legYear = selectedLeg ? new Date(selectedLeg.start_date).getFullYear() : 2024;
  const nodes: Node[] = groups
    .map((g) => {
      const s = chesScore(g.slug, legYear);
      if (!s) return null;
      return {
        slug: g.slug,
        nameShort: g.name_short,
        color: g.color_hex ?? 'var(--ink-3)',
        r: discR(g),
        cx: minX + (s.lr / 10) * (maxX - minX),
        cy: minY + (s.gt / 10) * (maxY - minY),
      } satisfies Node;
    })
    .filter((n): n is Node => n !== null);
  separate(nodes, minX, maxX, minY, maxY);

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

      {nodes.length < 2 ? (
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
              <g>
                <line x1={W / 2} y1={28} x2={W / 2} y2={H - 28} stroke="var(--rule)" strokeDasharray="4 4" />
                <line x1={28} y1={H / 2} x2={W - 28} y2={H / 2} stroke="var(--rule)" strokeDasharray="4 4" />
                <text x={20} y={H / 2 - 6} fontSize={12} fontWeight={700} fill="var(--ink-3)">
                  {t('axis_left')}
                </text>
                <text x={W - 20} y={H / 2 - 6} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink-3)">
                  {t('axis_right')}
                </text>
                <text x={W / 2 + 6} y={24} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink-3)">
                  {t('axis_top')}
                </text>
                <text x={W / 2 + 6} y={H - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink-3)">
                  {t('axis_bottom')}
                </text>
              </g>
              {nodes.map((n) => (
                <g key={n.slug} className="map-node">
                  {/* Native tooltip / touch fallback. */}
                  <title>{displayGroupShort(n.nameShort)}</title>
                  <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} fillOpacity={0.82} />
                  <text x={n.cx} y={n.cy + 3} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
                    {groupAbbreviation(n.slug)}
                  </text>
                  {/* Full name — hidden until you hover the disc, so close discs
                      don't overlap their labels. The white halo (paint-order
                      stroke) keeps it legible over neighbouring discs. */}
                  <text
                    className="map-label"
                    x={n.cx}
                    y={n.cy - n.r - 6}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--ink)"
                    stroke="var(--paper)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {displayGroupShort(n.nameShort)}
                  </text>
                </g>
              ))}
              <style>{`
                .map-node { cursor: default; }
                .map-label { opacity: 0; transition: opacity 120ms ease; pointer-events: none; }
                .map-node:hover .map-label { opacity: 1; }
                .map-node:hover circle { fill-opacity: 1; }
              `}</style>
            </svg>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: 640 }}>
            {t('axes_note')}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, fontStyle: 'italic' }}>
            {t('hover_hint')} {t('size_note')}
          </p>
          {/* Precise attribution: the academic citation plus the two specific
              CHES datasets used (the 1999-2019 trend file and the 2024 wave). */}
          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.5 }}>
            {t('axes_source')}{' '}
            <a
              href="https://www.chesdata.eu/1999-2019chestrend"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink-2)' }}
            >
              {t('axes_dataset_trend')}
            </a>
            {' · '}
            <a
              href="https://www.chesdata.eu/2024-chapel-hill-expert-survey-ches"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--ink-2)' }}
            >
              {t('axes_dataset_2024')}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
