import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { api, type Topic, type TopicGlobalStat } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';

/**
 * Renders the editorial-theme taxonomy as a grid of topic cards.
 *
 * The component used to host a "themes vs SDGs" tab switcher; the SDG
 * lane is disabled for the public launch (no SDG-classified
 * initiatives yet), so we render the editorial themes only. Restore
 * the previous tab structure from git history once SDG
 * classification ships in production.
 *
 * No editorial commentary is rendered on the cards themselves — only
 * the topic name, color, kind eyebrow, and a count of classified
 * initiatives. "Mirall, no megàfon".
 */
export async function TopicListPanel() {
  const [themeTopics, globals] = await Promise.all([
    api.topics.list({ kind: 'theme' }),
    api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]),
  ]);

  const countsBySlug = new Map(
    globals.map((g) => [g.topic_slug, g.initiatives_total] as const),
  );

  return (
    <div>
      <ul
        className="topic-grid"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: '24px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
          gap: 14,
        }}
      >
        {themeTopics.map((topic) => (
          <TopicCard
            key={topic.slug}
            topic={topic}
            count={countsBySlug.get(topic.slug) ?? 0}
          />
        ))}
      </ul>

      {/* Mobile: switch to a 2-column grid of compact "chips" so a phone
          fits 8-10 topics in a screen instead of the 1-2 desktop cards.
          Keep the desktop layout untouched. */}
      <style>{`
        @media (max-width: 640px) {
          .topic-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
            padding-top: 18px !important;
          }
          .topic-grid .topic-card {
            min-height: 110px !important;
            padding: 12px 12px 10px !important;
            gap: 6px !important;
          }
          .topic-grid .topic-card .topic-card-title {
            font-size: 15px !important;
            line-height: 1.2 !important;
          }
          .topic-grid .topic-card .topic-card-icon-wrap {
            width: 32px !important;
            height: 32px !important;
          }
          .topic-grid .topic-card .topic-card-eyebrow {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

function TopicCard({ topic, count }: { topic: Topic; count: number }) {
  const color = topic.color_hex ?? '#1a2138';
  const Icon = topicIcon(topic.icon);
  return (
    <li>
      <Link
        href={`/topics/${topic.slug}`}
        className="topic-card"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="topic-card-icon-wrap"
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `color-mix(in oklch, ${color} 22%, var(--paper))`,
              color,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
          </span>
          <span
            className="eyebrow topic-card-eyebrow"
            style={{ fontSize: 10, color }}
          >
            Tema
          </span>
        </div>
        <h2
          className="serif topic-card-title"
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
