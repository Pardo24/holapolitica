import Link from 'next/link';
import type { Route } from 'next';
import { getLocale } from 'next-intl/server';

import type { Topic, TopicGlobalStat } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * Horizontal scroll-snap strip of every editorial-theme topic.
 *
 * Each chip carries the topic icon, name, classified-initiative count
 * and a colour swatch matching the canonical taxonomy. Clicking a
 * chip filters the votes list by that topic; the chip strip is the
 * desktop counterpart to :file:`MobileTopicCarousel` (rotating
 * one-at-a-time) — both surface the same underlying signal.
 *
 * The strip is rendered server-side (no client JS) because there's
 * no rotation or local state — pure navigation. Hidden on mobile via
 * a wrapping `className="hidden sm:flex"` from the call site.
 *
 * Neutrality (CLAUDE.md "regla de simetria"): every topic with ≥1
 * classified initiative is present, sorted by count desc — never
 * pinned, never editorially weighted.
 */

export async function TopicChipsStrip({
  topics,
  counts,
  activeSlug,
  baseHref,
  allLabel,
  countSuffix,
}: {
  topics: Topic[];
  counts: TopicGlobalStat[];
  activeSlug: string | null;
  /**
   * URL prefix for the "filter by topic" link. Used as
   * `<baseHref>?topic_slug=<slug>`. Existing search params are NOT
   * preserved here — the strip is meant as a primary entry point;
   * use the chip × on ActiveFilterChips to undo.
   */
  baseHref: '/votes';
  allLabel: string;
  countSuffix: string;
}) {
  // Reading locale here keeps the chip strip drop-in: callers don't
  // need to thread the locale prop through (and there are many call
  // sites, both desktop and mobile). The cost is one async hop, which
  // we're already paying because the component is rendered on the
  // server.
  const locale = await getLocale();
  const countBySlug = new Map(counts.map((c) => [c.topic_slug, c.initiatives_total] as const));
  const ordered = topics
    .filter((tp) => tp.kind === 'theme')
    .map((tp) => ({ ...tp, count: countBySlug.get(tp.slug) ?? 0 }))
    .filter((tp) => tp.count > 0)
    .sort((a, b) => b.count - a.count);

  if (ordered.length === 0) return null;

  return (
    <div
      role="navigation"
      aria-label="Filtrar per tema"
      className="topic-chips-strip"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        padding: '4px 2px 12px',
      }}
    >
      <Link
        href={`${baseHref}?tab=votes` as Route}
        aria-current={activeSlug === null ? 'page' : undefined}
        style={chipStyle(activeSlug === null, 'var(--ink-3)')}
      >
        <span>{allLabel}</span>
      </Link>
      {ordered.map((tp) => {
        const Icon = topicIcon(tp.icon);
        const c = tp.color_hex ?? 'var(--ink-3)';
        const isActive = activeSlug === tp.slug;
        const href = `${baseHref}?tab=votes&topic_slug=${encodeURIComponent(tp.slug)}` as Route;
        return (
          <Link
            key={tp.slug}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            title={`${tp.count} ${countSuffix}`}
            style={chipStyle(isActive, c)}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 999,
                background: isActive ? 'var(--paper)' : `color-mix(in oklch, ${c} 22%, var(--paper))`,
                color: isActive ? c : c,
                flex: 'none',
              }}
            >
              <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{pickTopicName(tp, locale)}</span>
            <span
              className="tabular"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isActive ? 'var(--paper)' : 'var(--ink-3)',
                opacity: isActive ? 0.85 : 1,
              }}
            >
              {tp.count}
            </span>
          </Link>
        );
      })}
      <style>{`
        .topic-chips-strip::-webkit-scrollbar { height: 4px; }
        .topic-chips-strip::-webkit-scrollbar-thumb {
          background: var(--rule);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}

function chipStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    flex: 'none',
    scrollSnapAlign: 'start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? '1px solid var(--ink)' : '1px solid var(--rule)',
    background: active ? 'var(--ink)' : 'var(--paper)',
    color: active ? 'var(--paper)' : 'var(--ink)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'background-color .12s ease, border-color .12s ease, color .12s ease',
    minHeight: 36,
    // The accent is referenced via aria/title; the chip itself doesn't
    // need to display it as a border because the icon disc already
    // carries the canonical topic colour.
    boxShadow: active ? 'none' : 'none',
    outlineColor: accent,
  };
}
