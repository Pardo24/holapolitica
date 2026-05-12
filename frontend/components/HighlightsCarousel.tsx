'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import { type Highlight, highlightHeadline } from '@/lib/highlights';
import { displayGroupShort } from '@/lib/groups';

const ROTATE_MS = 6000;

const KIND_COLOR: Record<Highlight['kind'], string> = {
  most_aye: 'var(--aye)',
  most_no: 'var(--no)',
  most_abst: 'var(--abst)',
};

export function HighlightsCarousel({ items }: { items: Highlight[] }) {
  const t = useTranslations('dashboard');
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length === 0 || paused) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length, paused]);

  if (items.length === 0) {
    // Keep the carousel frame visible so the user knows this section will
    // populate. Backend vote↔initiative linkage is still being backfilled —
    // soft notice, never an error red.
    return (
      <div
        style={{
          border: '1px solid var(--rule-strong)',
          borderRadius: 14,
          background: 'var(--paper-2)',
          padding: '24px 22px',
          minHeight: 180,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          className="eyebrow"
          style={{
            fontSize: 9,
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          {t('highlights_empty_eyebrow')}
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            margin: 0,
            lineHeight: 1.45,
            maxWidth: 520,
          }}
        >
          {t('highlights_empty_body')}
        </p>
      </div>
    );
  }

  const current = items[idx]!;
  const next = items[(idx + 1) % items.length];
  const prev = items[(idx - 1 + items.length) % items.length];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{
        position: 'relative',
        border: '1px solid var(--rule-strong)',
        borderRadius: 14,
        background: 'var(--paper-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: 0,
          minHeight: 180,
        }}
      >
        <HighlightCard
          h={current}
          castCaption={t('highlights_cast_caption', { count: current.cast_total })}
          temporalityCaption={t('highlights_temporality')}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderTop: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        <button
          type="button"
          onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
          aria-label={t('highlights_prev_aria')}
          style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} aria-hidden="true" /> {prev && displayGroupShort(prev.group_name_short)}
        </button>
        <div
          aria-live="polite"
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span className="tabular">
            {idx + 1} / {items.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>{paused ? t('highlights_paused') : t('highlights_rotating')}</span>
        </div>
        <button
          type="button"
          onClick={() => setIdx((i) => (i + 1) % items.length)}
          aria-label={t('highlights_next_aria')}
          style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {next && displayGroupShort(next.group_name_short)} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Dot indicators */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          display: 'flex',
          gap: 4,
        }}
        aria-hidden="true"
      >
        {items.map((_, i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: i === idx ? 'var(--ink)' : 'var(--rule)',
              transition: 'background .2s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 0,
  fontSize: 12,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  // 44px hit target — the carousel sits in a 1-row footer where the
  // larger padding reads well across desktop and touch.
  padding: '10px 12px',
  minHeight: 44,
  fontFamily: 'inherit',
  maxWidth: '40%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function HighlightCard({
  h,
  castCaption,
  temporalityCaption,
}: {
  h: Highlight;
  castCaption: string;
  temporalityCaption: string;
}) {
  const pct = Math.round(h.pct * 100);
  const color = KIND_COLOR[h.kind];
  // The card links into the topic detail page, pre-filtered by this group.
  // The topic page reads `?group=<slug>` and applies it as a client-side
  // proposer filter — see :file:`app/topics/[slug]/page.tsx`.
  const href =
    `/topics/${h.topic_slug}?group=${encodeURIComponent(h.group_slug)}` as Route;
  return (
    <Link
      href={href}
      className="highlights-card-link"
      aria-label={`${displayGroupShort(h.group_name_short)} · ${highlightHeadline(h)} · ${h.topic_name_ca}`}
      style={{
        display: 'block',
        padding: '20px 22px',
        textDecoration: 'none',
        color: 'inherit',
        background: 'transparent',
        transition: 'background-color .15s ease, box-shadow .15s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <GroupBadge slug={h.group_slug} color={h.group_color_hex} size="xs" link={false} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {displayGroupShort(h.group_name_short)}
        </span>
        <span
          className="eyebrow"
          style={{
            fontSize: 9,
            color: 'var(--ink-3)',
            marginLeft: 'auto',
            maxWidth: '100%',
          }}
        >
          {highlightHeadline(h)}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: 18,
          alignItems: 'center',
        }}
        className="highlights-card-grid"
      >
        <div
          className="tabular"
          style={{
            fontSize: 56,
            fontWeight: 600,
            color,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          {pct}
          <span style={{ fontSize: 22, marginLeft: 2 }}>%</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <span
            className="serif"
            style={{
              fontSize: 18,
              lineHeight: 1.25,
              fontWeight: 600,
              color: 'var(--ink)',
              display: 'block',
              wordBreak: 'break-word',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                background: h.topic_color_hex ?? 'var(--ink-3)',
                borderRadius: 1,
                marginRight: 6,
                transform: 'translateY(-2px)',
              }}
            />
            {h.topic_name_ca}
          </span>
          <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            {castCaption}
          </p>
          {/* Temporality footnote — all our data is XV-legislature bound, so
              every card is honest about that scope rather than implying an
              all-time figure. Muted so it doesn't compete with the stat. */}
          <p
            className="tabular"
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              marginTop: 2,
              letterSpacing: '0.02em',
            }}
          >
            {temporalityCaption}
          </p>
        </div>
      </div>
      <style>{`
        .highlights-card-link:hover,
        .highlights-card-link:focus-visible {
          background: var(--paper);
          box-shadow: inset 0 0 0 1px var(--rule-strong);
          outline: none;
        }
      `}</style>
    </Link>
  );
}
