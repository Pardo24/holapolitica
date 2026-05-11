import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight } from 'lucide-react';

import {
  api,
  type Topic,
  type TopicGlobalStat,
  type TopicKind,
} from '@/lib/api';

/**
 * Renders the topic taxonomy directory: a tab switcher between the editorial
 * "theme" KB and the UN SDG KB, and a grid of topic cards. Used both by
 * `/topics` (its own page) and by `/votes?tab=topics` (the "Per tema" tab
 * inside the votes hub) — so a user landing on `/votes` and switching to
 * "Per tema" sees exactly the same surface as the standalone /topics page
 * without us duplicating the fetch+layout logic.
 *
 * Tabs are encoded in the URL as ``?kind=theme`` (default) vs ``?kind=sdg``
 * so they survive bookmarks and hard reloads. ``hrefBase`` is the route the
 * tab links point at — pass ``/topics`` or ``/votes`` so the panel composes
 * cleanly under either parent.
 *
 * No editorial commentary is rendered on the cards themselves — only the
 * topic name, color, kind eyebrow, and a count of classified initiatives.
 * "Mirall, no megàfon".
 */
export async function TopicListPanel({
  activeKind,
  hrefBase,
  extraTabParams,
}: {
  activeKind: TopicKind;
  /** Where the tab links point. e.g. ``/topics`` or ``/votes``. */
  hrefBase: '/topics' | '/votes';
  /**
   * Extra query params to merge into the tab links so non-kind state
   * survives the tab toggle. The votes hub passes ``tab=topics`` here
   * so switching theme/SDG stays on the right outer tab.
   */
  extraTabParams?: Record<string, string>;
}) {
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

  const buildHref = (kind: TopicKind): Route => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extraTabParams ?? {})) {
      if (v) sp.set(k, v);
    }
    if (kind === 'sdg') sp.set('kind', 'sdg');
    const qs = sp.toString();
    return (qs ? `${hrefBase}?${qs}` : hrefBase) as Route;
  };

  return (
    <div>
      <nav
        aria-label="Bases de coneixement de classificació"
        style={{
          display: 'flex',
          gap: 0,
          marginTop: 18,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <KindTabLink
          href={buildHref('theme')}
          active={activeKind === 'theme'}
          label="Temes editorial"
          sublabel={`${themeTopics.length} categories · ${themeTotal} iniciatives`}
        />
        <KindTabLink
          href={buildHref('sdg')}
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

function KindTabLink({
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
          <span style={{ color: 'var(--ink)', display: 'inline-flex' }}>
            <ArrowRight size={14} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </li>
  );
}
