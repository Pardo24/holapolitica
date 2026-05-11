'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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
          Dades en construcció
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
          Estem completant el llaç entre votacions i iniciatives. Aquesta
          secció s&apos;omplirà quan finalitzi el backfill.
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
          padding: '20px 22px',
          minHeight: 180,
        }}
      >
        <HighlightCard h={current} />
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
          aria-label="Anterior destacat"
          style={btnStyle}
        >
          ← {prev && displayGroupShort(prev.group_name_short)}
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
          <span>{paused ? 'pausat' : 'rotant'}</span>
        </div>
        <button
          type="button"
          onClick={() => setIdx((i) => (i + 1) % items.length)}
          aria-label="Següent destacat"
          style={btnStyle}
        >
          {next && displayGroupShort(next.group_name_short)} →
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
  padding: '4px 8px',
  fontFamily: 'inherit',
  maxWidth: '40%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function HighlightCard({ h }: { h: Highlight }) {
  const pct = Math.round(h.pct * 100);
  const color = KIND_COLOR[h.kind];
  return (
    <div>
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
        <Link
          href={`/groups/${h.group_slug}`}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            textDecoration: 'none',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {displayGroupShort(h.group_name_short)}
        </Link>
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
          <Link
            href={`/topics/${h.topic_slug}`}
            className="serif"
            style={{
              fontSize: 18,
              lineHeight: 1.25,
              fontWeight: 600,
              color: 'var(--ink)',
              textDecoration: 'none',
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
          </Link>
          <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
            sobre {h.cast_total} vots emesos en aquest tema
          </p>
        </div>
      </div>
    </div>
  );
}
