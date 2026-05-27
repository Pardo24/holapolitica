'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { Topic, TopicGlobalStat } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * Horizontal scroll-snap strip of every editorial-theme topic.
 *
 * Each chip carries the topic icon, name, classified-initiative count
 * and a colour swatch matching the canonical taxonomy. Clicking a
 * chip TOGGLES its membership in the URL's ``topic_slug`` list (a
 * comma-separated value the backend OR's across), so the user can
 * stack multiple themes from the strip in addition to the combobox
 * inside the filter card.
 *
 * Neutrality (CLAUDE.md "regla de simetria"): every topic with ≥1
 * classified initiative is present, sorted by count desc — never
 * pinned, never editorially weighted.
 */

export function TopicChipsStrip({
  topics,
  counts,
  activeSlugs,
  allLabel,
  countSuffix,
  locale,
}: {
  topics: Topic[];
  counts: TopicGlobalStat[];
  /** Currently-applied topic slugs from the URL — used to highlight
   *  every active chip and to compute the toggle semantics on click. */
  activeSlugs: string[];
  allLabel: string;
  countSuffix: string;
  locale: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const countBySlug = useMemo(
    () => new Map(counts.map((c) => [c.topic_slug, c.initiatives_total] as const)),
    [counts],
  );
  const ordered = useMemo(
    () =>
      topics
        .filter((tp) => tp.kind === 'theme')
        .map((tp) => ({ ...tp, count: countBySlug.get(tp.slug) ?? 0 }))
        .filter((tp) => tp.count > 0)
        .sort((a, b) => b.count - a.count),
    [topics, countBySlug],
  );

  // Scroll-end indicators — show a left arrow when the user can
  // still scroll back, and a right arrow when there are more chips
  // hidden off the right edge. Both update on scroll AND on resize
  // so a window-width change recomputes the overflow state.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth - 1;
      setCanLeft(el.scrollLeft > 1);
      setCanRight(el.scrollLeft < max);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [ordered.length]);

  function scrollBy(direction: 1 | -1) {
    const el = stripRef.current;
    if (!el) return;
    // Roughly one viewport worth of chips per click; capped so a
    // long press of the arrow on a wide screen doesn't fly past
    // the next handful of options.
    const distance = Math.min(el.clientWidth * 0.8, 480);
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  }

  const toggleSlug = useCallback(
    (slug: string) => {
      const next = new URLSearchParams(sp.toString());
      const updated = activeSlugs.includes(slug)
        ? activeSlugs.filter((s) => s !== slug)
        : [...activeSlugs, slug];
      if (updated.length === 0) next.delete('topic_slug');
      else next.set('topic_slug', updated.join(','));
      next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `/votes?${qs}` : '/votes', { scroll: false });
    },
    [activeSlugs, sp, router],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    next.delete('topic_slug');
    next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `/votes?${qs}` : '/votes', { scroll: false });
  }, [sp, router]);

  if (ordered.length === 0) return null;

  return (
    <div className="topic-chips-wrapper" style={{ position: 'relative' }}>
      {canLeft && (
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => scrollBy(-1)}
          className="topic-chips-arrow topic-chips-arrow--left"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Següent"
          onClick={() => scrollBy(1)}
          className="topic-chips-arrow topic-chips-arrow--right"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      <div
        ref={stripRef}
        role="navigation"
        aria-label="Filtrar per tema"
        className="topic-chips-strip"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          // Lock vertical overflow so the bigger desktop chips can't
          // push the strip into a scrollable box of their own.
          overflowY: 'hidden',
          // Symmetric vertical padding so the absolute-positioned
          // arrows land exactly on the chip midline (the previous
          // ``4 / 12`` was visually off-centre).
          scrollSnapType: 'x proximity',
          padding: '6px 2px 6px',
        }}
      >
        <button
          type="button"
          aria-pressed={activeSlugs.length === 0}
          onClick={clearAll}
          style={chipStyle(activeSlugs.length === 0, 'var(--ink-3)')}
        >
          <span>{allLabel}</span>
        </button>
        {ordered.map((tp) => {
          const Icon = topicIcon(tp.icon);
          const c = tp.color_hex ?? 'var(--ink-3)';
          const isActive = activeSlugs.includes(tp.slug);
          return (
            <button
              type="button"
              key={tp.slug}
              aria-pressed={isActive}
              onClick={() => toggleSlug(tp.slug)}
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
                  background: isActive
                    ? 'var(--paper)'
                    : `color-mix(in oklch, ${c} 22%, var(--paper))`,
                  color: isActive ? c : c,
                  flex: 'none',
                }}
              >
                <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span
                style={{
                  whiteSpace: 'nowrap',
                  // Force the active text to paper-white explicitly.
                  // The chip's button-level ``color`` is paper too, but
                  // some browsers' default <button> color cascade was
                  // bleeding through and leaving the name as the legacy
                  // ink even when the background was dark — unreadable.
                  color: isActive ? 'var(--paper)' : 'var(--ink)',
                }}
              >
                {pickTopicName(tp, locale)}
              </span>
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
            </button>
          );
        })}
      </div>
      <style>{`
        .topic-chips-strip::-webkit-scrollbar { height: 4px; }
        .topic-chips-strip::-webkit-scrollbar-thumb {
          background: var(--rule);
          border-radius: 999px;
        }
        /* Desktop bump: the default chip is sized for a phone scroll,
           which makes the topic taxonomy hard to read on a wide
           screen. From 720 px upwards we grow the font, the inner
           icon disc and the padding so the strip carries the same
           visual weight as the filter form below it. */
        @media (min-width: 720px) {
          .topic-chips-strip > a {
            font-size: 14px !important;
            padding: 8px 14px !important;
            min-height: 40px !important;
            gap: 10px !important;
          }
          .topic-chips-strip > a > span:first-child {
            width: 26px !important;
            height: 26px !important;
          }
          .topic-chips-strip > a > span:first-child svg {
            width: 14px !important;
            height: 14px !important;
          }
          .topic-chips-strip > a > .tabular {
            font-size: 12px !important;
          }
        }
        /* End-of-strip arrow buttons. On desktop the wrapper reserves
           38 px of horizontal padding so the buttons live INSIDE that
           reserved space without overlapping the first/last chip
           (previously the left button covered the "Tots els temes"
           chip on wide screens). On touch the wrapper has no extra
           padding and the buttons are hidden — users swipe instead. */
        .topic-chips-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          display: none;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--rule-strong);
          border-radius: 999px;
          background: var(--paper);
          color: var(--ink);
          cursor: pointer;
          z-index: 2;
          padding: 0;
          box-shadow: 0 1px 3px rgba(20, 28, 60, 0.10);
          transition: background-color 120ms ease, transform 120ms ease;
        }
        .topic-chips-arrow:hover,
        .topic-chips-arrow:focus-visible {
          background: var(--paper-2);
          outline: none;
        }
        .topic-chips-arrow:active {
          transform: translateY(-50%) scale(0.94);
        }
        .topic-chips-arrow--left { left: 0; }
        .topic-chips-arrow--right { right: 0; }
        @media (hover: hover) and (pointer: fine) {
          .topic-chips-arrow { display: inline-flex; }
          .topic-chips-wrapper {
            padding-left: 38px;
            padding-right: 38px;
          }
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
    boxShadow: 'none',
    outlineColor: accent,
  };
}
