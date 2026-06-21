import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Route } from 'next';
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
import { chesScore } from '@/lib/ches';

export const revalidate = 300;

interface SearchParams {
  legislature?: string;
  vista?: string;
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
 * "El Mapa" — two ways to read the same chamber.
 *  - "Com voten": the empirical compass. Parties are placed by HOW they vote
 *    (pairwise coincidence matrix → MDS); axes carry no meaning, only proximity.
 *  - "Esquerra-dreta": an external academic placement (Chapel Hill Expert
 *    Survey). Horizontal = economic left-right; vertical = progressive-
 *    conservative on social issues. Cited, not ours.
 */
export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('map');
  const tVotes = await getTranslations('votes');
  const { legislature, vista } = await searchParams;
  const view = vista === 'eixos' ? 'eixos' : 'voten';

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

  const maxMembers = Math.max(1, ...groups.map((g) => g.members_active));
  const discR = (g: ParliamentaryGroupSummary): number =>
    10 + 30 * Math.sqrt(g.members_active / maxMembers);

  let nodes: Node[] = [];
  if (view === 'eixos') {
    // External left-right (x) / progressive-conservative (y) placement.
    const margin = 52;
    const minX = margin;
    const maxX = W - margin;
    const minY = margin;
    const maxY = H - margin;
    const legYear = selectedLeg ? new Date(selectedLeg.start_date).getFullYear() : 2024;
    nodes = groups
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
  } else {
    // Empirical compass from the coincidence matrix.
    const coinc = new Map<string, number | null>();
    for (const c of cells) coinc.set(`${c.group_a_slug}|${c.group_b_slug}`, c.coincidence);
    const similarity = (a: string, b: string): number | null =>
      coinc.get(`${a}|${b}`) ?? coinc.get(`${b}|${a}`) ?? null;
    const placeable = groups.filter(
      (g) =>
        cells.some((c) => c.group_a_slug === g.slug) ||
        cells.some((c) => c.group_b_slug === g.slug),
    );
    const layout = layoutFromSimilarity(
      placeable.map((g) => g.slug),
      similarity,
    );
    nodes = placeable
      .map((g) => {
        const p = layout.get(g.slug);
        if (!p) return null;
        return {
          slug: g.slug,
          nameShort: g.name_short,
          color: g.color_hex ?? 'var(--ink-3)',
          r: discR(g),
          cx: p.x * W,
          cy: p.y * H,
        } satisfies Node;
      })
      .filter((n): n is Node => n !== null);
  }

  const legQs = selectedLegId != null ? `&legislature=${selectedLegId}` : '';
  const href = (v: 'voten' | 'eixos'): Route =>
    (v === 'voten' ? `/mapa?vista=voten${legQs}` : `/mapa?vista=eixos${legQs}`) as Route;

  const tab = (v: 'voten' | 'eixos', label: string) => {
    const active = view === v;
    return (
      <Link
        href={href(v)}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          border: '1px solid var(--rule-strong)',
          background: active ? 'var(--ink)' : 'var(--paper-2)',
          color: active ? 'var(--paper)' : 'var(--ink-2)',
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MapIcon size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />

      <div
        style={{
          paddingTop: 16,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {tab('voten', t('view_votes'))}
          {tab('eixos', t('view_axes'))}
        </div>
        {legislatures.length > 1 && selectedLegId != null && (
          <LegislatureSelector
            legislatures={legislatures}
            activeId={activeLeg?.id ?? null}
            selectedId={selectedLegId}
            label={tVotes('legislature_label')}
            currentSuffix={tVotes('legislature_current')}
          />
        )}
      </div>

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
              {view === 'eixos' && (
                <g>
                  <line
                    x1={W / 2}
                    y1={28}
                    x2={W / 2}
                    y2={H - 28}
                    stroke="var(--rule)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={28}
                    y1={H / 2}
                    x2={W - 28}
                    y2={H / 2}
                    stroke="var(--rule)"
                    strokeDasharray="4 4"
                  />
                  <text x={20} y={H / 2 - 6} fontSize={12} fontWeight={700} fill="var(--ink-3)">
                    {t('axis_left')}
                  </text>
                  <text
                    x={W - 20}
                    y={H / 2 - 6}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--ink-3)"
                  >
                    {t('axis_right')}
                  </text>
                  <text
                    x={W / 2 + 6}
                    y={24}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--ink-3)"
                  >
                    {t('axis_top')}
                  </text>
                  <text
                    x={W / 2 + 6}
                    y={H - 12}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--ink-3)"
                  >
                    {t('axis_bottom')}
                  </text>
                </g>
              )}
              {nodes.map((n) => (
                <g key={n.slug}>
                  <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} fillOpacity={0.82} />
                  <text
                    x={n.cx}
                    y={n.cy + 3}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#fff"
                  >
                    {groupAbbreviation(n.slug)}
                  </text>
                  <text
                    x={n.cx}
                    y={n.cy - n.r - 5}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={600}
                    fill="var(--ink)"
                  >
                    {displayGroupShort(n.nameShort)}
                  </text>
                </g>
              ))}
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
            {view === 'eixos' ? t('axes_note') : t('note')}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
            {view === 'eixos' ? (
              <>
                {t('axes_source')}{' '}
                <a
                  href="https://www.chesdata.eu"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ink-2)' }}
                >
                  chesdata.eu
                </a>
              </>
            ) : (
              <>
                {t('size_note')}
                {selectedLeg ? ` · ${new Date(selectedLeg.start_date).getFullYear()}` : ''}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
