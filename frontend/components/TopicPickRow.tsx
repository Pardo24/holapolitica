import Link from 'next/link';
import type { Route } from 'next';

import { EdgeFadeRow } from '@/components/EdgeFadeRow';
import type { Topic } from '@/lib/api';
import { pickTopicName } from '@/lib/topics';

/**
 * "Pick the subject first" — the scrollable row of topic chips that opens
 * both games.
 *
 * Ten votes drawn from the whole plenary can feel arbitrary; ten on housing
 * are ten the reader has an opinion about. The row is server-rendered links,
 * so the chosen subject lives in the URL and a round can be shared.
 *
 * Only editorial themes are offered. The SDG taxonomy has no page of its own
 * yet, so an SDG chip would be a subject with nowhere to go, sitting next to
 * the theme that already says the same thing.
 */
export function TopicPickRow({
  topics,
  locale,
  basePath,
  activeSlug,
  label,
  anyLabel,
}: {
  topics: Topic[];
  locale: string;
  /** Route the chips link to; the "any" chip is this path with no query. */
  basePath: string;
  activeSlug?: string;
  label: string;
  anyLabel: string;
}) {
  const themes = topics.filter((tp) => tp.kind !== 'sdg');
  if (themes.length === 0) return null;
  return (
    <div style={{ paddingTop: 18 }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          fontWeight: 600,
          color: 'var(--ink-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {/* Fourteen topics don't fit a phone; the fade says the row carries
          on past the edge. */}
      <EdgeFadeRow ariaLabel={label}>
        <TopicPick href={basePath as Route} active={!activeSlug}>
          {anyLabel}
        </TopicPick>
        {themes.map((tp) => (
          <TopicPick
            key={tp.slug}
            href={`${basePath}?tema=${tp.slug}` as Route}
            active={activeSlug === tp.slug}
          >
            {pickTopicName(tp, locale)}
          </TopicPick>
        ))}
      </EdgeFadeRow>
    </div>
  );
}

function TopicPick({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        flex: 'none',
        whiteSpace: 'nowrap',
        padding: '5px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
        background: active ? 'var(--ink)' : 'var(--paper)',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );
}
