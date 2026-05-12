'use client';

/**
 * Rotating one-card-at-a-time carousel of topic chips, sized for
 * a phone screen.
 *
 * Why this exists separately from :file:`HighlightsCarousel`:
 *   - HighlightsCarousel rotates *per-group* "tema amb més suport / rebuig"
 *     editorial pairs; this one rotates *the catalogue of topics* with
 *     their initiative counts. Different content, different navigation
 *     target (topic detail, not topic+group filtered detail).
 *   - The visual shape needs to be compact (≤120px tall) so the page
 *     above the votes list stays scannable on a phone.
 *
 * Neutrality (CLAUDE.md "regla de simetria"): every topic appears in
 * the rotation in the same order they're served by ``/topics``. There
 * is no "featured" topic, no per-topic editorial weighting, no manual
 * pinning. Auto-rotation pauses when the user hovers / focuses /
 * touches so they can actually read.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

import { topicIcon } from '@/lib/topic_icons';

const ROTATE_MS = 5000;

export interface MobileCarouselTopic {
  slug: string;
  name: string;
  color_hex: string | null;
  icon: string | null;
  /** Initiatives currently classified under this topic. */
  count: number;
}

export function MobileTopicCarousel({
  items,
  emptyLabel,
  countSuffix,
  prevAria,
  nextAria,
  pausedLabel,
  ofSeparator,
}: {
  items: MobileCarouselTopic[];
  emptyLabel: string;
  countSuffix: string;
  prevAria: string;
  nextAria: string;
  pausedLabel: string;
  ofSeparator: string;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length, paused]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (items.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setIdx((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setIdx((i) => (i - 1 + items.length) % items.length);
    }
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--rule)',
          borderRadius: 12,
          padding: '14px 16px',
          fontSize: 13,
          color: 'var(--ink-3)',
          background: 'var(--paper-2)',
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  const current = items[idx]!;
  const Icon = topicIcon(current.icon);
  const color = current.color_hex ?? 'var(--ink-3)';

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        borderRadius: 14,
        border: '1px solid var(--rule-strong)',
        background: `color-mix(in oklch, ${color} 6%, var(--paper-2))`,
        overflow: 'hidden',
      }}
    >
      <Link
        href={`/topics/${current.slug}` as Route}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `color-mix(in oklch, ${color} 22%, var(--paper))`,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Icon size={22} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <span
            className="serif"
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.2,
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current.name}
          </span>
          <span
            className="tabular"
            style={{ fontSize: 11, color: 'var(--ink-3)' }}
          >
            {current.count}{' '}{countSuffix}
          </span>
        </span>
        <ArrowRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </Link>

      {items.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 6px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper)',
          }}
        >
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
            aria-label={prevAria}
            className="mobile-topic-carousel-btn"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div
            aria-live="polite"
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span className="tabular">
              {idx + 1} {ofSeparator} {items.length}
            </span>
            {paused && (
              <>
                <span aria-hidden="true">·</span>
                <span>{pausedLabel}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % items.length)}
            aria-label={nextAria}
            className="mobile-topic-carousel-btn"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <style>{`
        .mobile-topic-carousel-btn {
          background: transparent;
          border: 0;
          color: var(--ink-2);
          cursor: pointer;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 999px;
          transition: background-color .12s ease, color .12s ease;
        }
        .mobile-topic-carousel-btn:hover,
        .mobile-topic-carousel-btn:focus-visible {
          background: var(--paper-2);
          color: var(--ink);
          outline: none;
        }
      `}</style>
    </div>
  );
}
