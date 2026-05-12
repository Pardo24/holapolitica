'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import type { GroupSummaryRow } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

const ROTATE_MS = 6000;

/**
 * Rotating per-group card with cohesion and votes-cast figures.
 *
 * Side-by-side companion to :file:`HighlightsCarousel` on /stats and the
 * home page. Reads the same `GroupSummaryRow[]` already fetched for the
 * mobile :file:`GroupSummaryCarousel`, so this is a pure UI re-skin — no
 * new endpoints.
 *
 * Neutrality (CLAUDE.md "regla de simetria"):
 *   - every group is rendered, in deterministic order (members_active desc)
 *   - rotation is uniform — no card is "stickier" than another
 *   - hovering pauses rotation so the user can read the figures
 *   - the embedded link points at the group's own page; no editorial framing
 */
export function CohesionCarousel({ rows }: { rows: GroupSummaryRow[] }) {
  const t = useTranslations('cohesion_carousel');
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Sort once per render, descending by member count, so the first card a
  // visitor sees is always the largest group; rotation visits every group
  // in the same order on each pass.
  const ordered = [...rows].sort((a, b) => b.members_active - a.members_active);

  useEffect(() => {
    if (ordered.length === 0 || paused) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % ordered.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [ordered.length, paused]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (ordered.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setIdx((i) => (i + 1) % ordered.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setIdx((i) => (i - 1 + ordered.length) % ordered.length);
    }
  }

  if (ordered.length === 0) {
    return (
      <div
        style={{
          border: '1px solid var(--rule-strong)',
          borderRadius: 14,
          background: 'var(--paper-2)',
          padding: '24px 22px',
          minHeight: 180,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>{t('empty')}</p>
      </div>
    );
  }

  const current = ordered[idx]!;
  const cohesionPct =
    current.avg_cohesion == null ? null : Math.round(current.avg_cohesion * 100);
  const attendancePct =
    current.avg_attendance == null
      ? null
      : Math.round(current.avg_attendance * 100);
  const href = `/groups/${current.group_slug}` as Route;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        border: '1px solid var(--rule-strong)',
        borderRadius: 14,
        background: 'var(--paper-2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 180,
      }}
    >
      <Link
        href={href}
        aria-label={`${displayGroupShort(current.group_name_short)} · ${t('cohesion_short')} ${cohesionPct ?? '—'}% · ${t('attendance_short')} ${attendancePct ?? '—'}%`}
        style={{
          padding: '20px 22px',
          textDecoration: 'none',
          color: 'inherit',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <GroupBadge
            slug={current.group_slug}
            color={current.group_color_hex}
            size="sm"
            link={false}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {displayGroupShort(current.group_name_short)}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <Metric
            value={cohesionPct}
            label={t('cohesion_short')}
            color="var(--ink)"
          />
          <Metric
            value={attendancePct}
            label={t('attendance_short')}
            color="var(--accent)"
          />
        </div>

        <span
          className="tabular"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            marginTop: 'auto',
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-2)',
            background: 'var(--paper-3)',
            borderRadius: 999,
          }}
        >
          <span>{current.members_active}</span>
          <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>
            {t('deputies')}
          </span>
        </span>
      </Link>

      {/* Controls — neutral chevrons + "N de M" indicator. Mirrors the
          shape of HighlightsCarousel so the two widgets sit side-by-side
          with consistent affordances. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderTop: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        <button
          type="button"
          onClick={() => setIdx((i) => (i - 1 + ordered.length) % ordered.length)}
          aria-label={t('prev_aria')}
          className="cohesion-nav-btn"
          style={navBtnStyle}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div
          aria-live="polite"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span className="tabular">
            {idx + 1} {t('of_separator')} {ordered.length}
          </span>
          {paused && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ fontSize: 11 }}>{t('paused')}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIdx((i) => (i + 1) % ordered.length)}
          aria-label={t('next_aria')}
          className="cohesion-nav-btn"
          style={navBtnStyle}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <style>{`
        .cohesion-nav-btn {
          color: var(--ink-2);
          border-radius: 999px;
          transition: background-color .12s ease, color .12s ease;
        }
        .cohesion-nav-btn:hover {
          background: color-mix(in oklch, var(--accent) 10%, transparent);
          color: var(--ink);
        }
        .cohesion-nav-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'inherit',
};

function Metric({
  value,
  label,
  color,
}: {
  value: number | null;
  label: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        className="tabular"
        style={{
          fontSize: 36,
          fontWeight: 600,
          color,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value == null ? '—' : value}
        {value != null && <span style={{ fontSize: 16, marginLeft: 1 }}>%</span>}
      </span>
      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}
