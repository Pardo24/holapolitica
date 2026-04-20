import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  api,
  type Topic,
  type TopicGlobalStat,
  type TopicKind,
} from '@/lib/api';

// Default classification knowledge base. The editorial taxonomy stays the
// landing experience; the SDG tab is a secondary lens (cf. CLAUDE.md
// "mirall, no megàfon" — UN-official descriptive framing, no editorialising).
const DEFAULT_KIND: TopicKind = 'theme';

interface SearchParams {
  kind?: string;
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('topics');
  const { kind: rawKind } = await searchParams;
  const activeKind: TopicKind = rawKind === 'sdg' ? 'sdg' : DEFAULT_KIND;

  // We fetch both KBs in parallel so the tab switch is instant and we can
  // show a count on each tab. ``topicsGlobal`` returns aggregates across
  // all topics regardless of kind — we filter client-side per tab.
  const [themeTopics, sdgTopics, globals] = await Promise.all([
    api.topics.list({ kind: 'theme' }),
    api.topics.list({ kind: 'sdg' }),
    api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]),
  ]);
  const countsBySlug = new Map(
    globals.map((g) => [g.topic_slug, g.initiatives_total] as const),
  );

  const visibleTopics = activeKind === 'sdg' ? sdgTopics : themeTopics;
  const themeTotal = themeTopics.reduce(
    (acc, top) => acc + (countsBySlug.get(top.slug) ?? 0),
    0,
  );
  const sdgTotal = sdgTopics.reduce(
    (acc, top) => acc + (countsBySlug.get(top.slug) ?? 0),
    0,
  );

  return (
    <div>
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 18,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div className="eyebrow">Taxonomia · classificació automàtica</div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {t('title')}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-3)',
            marginTop: 6,
            maxWidth: 760,
          }}
        >
          {t('subtitle')}
        </p>
      </header>

      <nav
        aria-label="Bases de coneixement de classificació"
        style={{
          display: 'flex',
          gap: 0,
          marginTop: 18,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <TabLink
          href={'/topics' as Route}
          active={activeKind === 'theme'}
          label="Temes editorial"
          sublabel={`${themeTopics.length} categories · ${themeTotal} iniciatives`}
        />
        <TabLink
          href={'/topics?kind=sdg' as Route}
          active={activeKind === 'sdg'}
          label="ODS (Agenda 2030)"
          sublabel={`${sdgTopics.length} objectius · ${sdgTotal} iniciatives`}
        />
      </nav>

      {activeKind === 'sdg' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 14,
            marginBottom: 0,
            maxWidth: 760,
          }}
        >
          Classificació segons els 17 Objectius de Desenvolupament Sostenible
          adoptats per Nacions Unides l&apos;any 2015 (Agenda 2030). Definicions
          oficials de l&apos;ONU.
        </p>
      )}

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '24px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {visibleTopics.map((topic) => (
          <TopicCard
            key={topic.slug}
            topic={topic}
            count={countsBySlug.get(topic.slug) ?? 0}
          />
        ))}
      </ul>
    </div>
  );
}

function TabLink({
  href,
  active,
  label,
  sublabel,
}: {
  href: Route;
  active: boolean;
  label: string;
  sublabel: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 18px',
        textDecoration: 'none',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        borderBottom: active
          ? '2px solid var(--ink)'
          : '2px solid transparent',
        marginBottom: -1,
        fontWeight: active ? 600 : 400,
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span style={{ fontSize: 14 }}>{label}</span>
      <span
        className="tabular"
        style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}
      >
        {sublabel}
      </span>
    </Link>
  );
}

function TopicCard({ topic, count }: { topic: Topic; count: number }) {
  // Each card gets the topic's color as a tinted background so they're
  // distinguishable at a glance, with a darker leading bar for emphasis.
  const color = topic.color_hex ?? '#1a2138';
  const isSdg = topic.kind === 'sdg';
  // SDG slugs are ``sdg-01-poverty``…``sdg-17-partnerships``; pull the
  // numeric prefix for the eyebrow so the UN's numbering is visible.
  const sdgNumber = isSdg ? topic.slug.match(/^sdg-(\d{2})/)?.[1] : null;
  return (
    <li>
      <Link
        href={`/topics/${topic.slug}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '20px 18px',
          borderRadius: 14,
          background: `color-mix(in oklch, ${color} 10%, var(--paper-2))`,
          border: '1px solid var(--rule)',
          textDecoration: 'none',
          color: 'inherit',
          minHeight: 130,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: color,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              background: color,
              borderRadius: 2,
              flex: 'none',
            }}
          />
          <span className="eyebrow" style={{ fontSize: 10, color }}>
            {isSdg ? (sdgNumber ? `ODS ${sdgNumber}` : 'ODS') : 'Tema'}
          </span>
        </div>
        <h2
          className="serif"
          style={{
            margin: 0,
            fontSize: 22,
            lineHeight: 1.2,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {topic.name_ca}
        </h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}
        >
          <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {count > 0 ? `${count} iniciatives` : 'sense dades encara'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink)' }}>→</span>
        </div>
      </Link>
    </li>
  );
}
