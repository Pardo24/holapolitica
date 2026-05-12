import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/PageHeader';
import {
  api,
  type Topic,
  type TopicGlobalStat,
} from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';

/**
 * Agenda 2030 landing — UN Sustainable Development Goals (SDG) lens
 * on the parliamentary activity tracked by Hola Política.
 *
 * Why a dedicated page exists alongside `/topics?kind=sdg`:
 * - The SDG framework is a recognisable, internationally-shared lens.
 *   Funders (AECID, EU SDG-implementation lines) and journalists
 *   covering sustainability beats look for it explicitly.
 * - The editorial-theme taxonomy (`?kind=theme`) and the SDG taxonomy
 *   answer different questions; surfacing each with its own URL avoids
 *   making one a "secondary tab" of the other.
 * - Parliament 2030 (`parlamento2030.es`, by Political Watch) is the
 *   peer reference; this page mirrors their framing while adding our
 *   vote-data depth.
 *
 * Neutrality (CLAUDE.md "mirall, no megàfon"): the SDG numbers and
 * official colours are the UN's, not ours. We render every goal,
 * including the ones with zero classified initiatives — never hide a
 * goal because the data is sparse.
 */

const SDG_NUMBER_RE = /^sdg-(\d{2})/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agenda_2030');
  return {
    title: t('title'),
    description: t('intro').slice(0, 220),
  };
}

export default async function Agenda2030Page() {
  const t = await getTranslations('agenda_2030');

  const [sdgTopics, globals] = await Promise.all([
    api.topics.list({ kind: 'sdg' }),
    api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]),
  ]);
  const countsBySlug = new Map(
    globals.map((g) => [g.topic_slug, g.initiatives_total] as const),
  );

  // SDGs are 01-17 by spec. Sort by the leading two digits so card 1
  // (No poverty) always reads first.
  const ordered = [...sdgTopics].sort((a, b) => {
    const an = a.slug.match(SDG_NUMBER_RE)?.[1] ?? '99';
    const bn = b.slug.match(SDG_NUMBER_RE)?.[1] ?? '99';
    return an.localeCompare(bn);
  });

  const totalIniciatives = ordered.reduce(
    (acc, top) => acc + (countsBySlug.get(top.slug) ?? 0),
    0,
  );
  const covered = ordered.filter((top) => (countsBySlug.get(top.slug) ?? 0) > 0)
    .length;

  return (
    <div style={{ paddingTop: 28, paddingBottom: 48 }}>
      <PageHeader
        title={t('title')}
        subtitle={t('eyebrow')}
        bordered
        style={{ paddingTop: 0 }}
      >
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-3)',
            margin: 0,
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          {t('intro')}
        </p>
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          <div>
            <span className="eyebrow">{t('stat_iniciatives')}</span>
            <div
              className="tabular"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {totalIniciatives.toLocaleString()}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 24 }}>
            <span className="eyebrow">{t('stat_sdgs_covered')}</span>
            <div
              className="tabular"
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              {covered}
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> / 17</span>
            </div>
          </div>
        </div>
      </PageHeader>

      <ul
        className="sdg-grid"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '24px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
          gap: 12,
        }}
        aria-label={t('grid_aria')}
      >
        {ordered.map((top) => (
          <SDGCard
            key={top.slug}
            top={top}
            count={countsBySlug.get(top.slug) ?? 0}
            iniciativesLabel={t('count_iniciatives_label')}
            emptyLabel={t('count_empty_label')}
          />
        ))}
      </ul>

      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
          fontStyle: 'italic',
          maxWidth: 760,
        }}
      >
        {t('attribution')}
      </p>

      <style>{`
        @media (max-width: 640px) {
          .sdg-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .sdg-card {
            min-height: 96px !important;
            padding: 10px 12px 12px !important;
          }
          .sdg-card .sdg-number {
            font-size: 26px !important;
          }
          .sdg-card .sdg-title {
            font-size: 12px !important;
            line-height: 1.25 !important;
          }
        }
      `}</style>
    </div>
  );
}

function SDGCard({
  top,
  count,
  iniciativesLabel,
  emptyLabel,
}: {
  top: Topic;
  count: number;
  iniciativesLabel: string;
  emptyLabel: string;
}) {
  const color = top.color_hex ?? '#1a2138';
  const num = top.slug.match(SDG_NUMBER_RE)?.[1] ?? '';
  const Icon = topicIcon(top.icon);
  return (
    <li>
      <Link
        href={`/topics/${top.slug}`}
        className="sdg-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '14px 16px 16px',
          borderRadius: 14,
          background: color,
          color: '#fff',
          textDecoration: 'none',
          minHeight: 132,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="sdg-number tabular"
            aria-hidden="true"
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            {num}
          </span>
          <span
            aria-hidden="true"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
            }}
          >
            <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
        <span
          className="sdg-title serif"
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {top.name_ca}
        </span>
        <span
          className="tabular"
          style={{
            marginTop: 'auto',
            fontSize: 11,
            opacity: 0.9,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count > 0 ? `${count} ${iniciativesLabel}` : emptyLabel}
        </span>
      </Link>
    </li>
  );
}
