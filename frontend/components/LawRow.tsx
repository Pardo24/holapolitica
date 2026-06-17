import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AnnotatedText } from '@/components/AnnotatedText';

/**
 * The single canonical "law in a list" row, shared by every surface that
 * lists parliamentary activity: the votes list, the home latest-votes
 * strip, the topic hub's initiative list, and any future surface (group
 * pages, person pages).
 *
 * It is purely presentational. Callers pass already-resolved bits — a
 * link, the two formatted date strings, the meta-line content and the
 * right-column outcome indicator — and the shell guarantees one identical
 * layout and responsive behaviour everywhere. That is the whole point:
 * "a law" must look the same wherever it appears.
 *
 * Layout: a single ``.law-row`` grid.
 *  - Mobile (<640px): 2 cols ``[title + meta | right-stack(date + outcome)]``.
 *  - Desktop (≥640px): 3 cols ``[date | title + meta | outcome]`` via the
 *    ``.law-row`` override in globals.css.
 *
 * Why a shell at all: previously the votes list (CompactVoteRow) and the
 * topic hub (its own InitiativeRow) reimplemented the same grid under two
 * different CSS classes (``compact-vote-row`` / ``initiative-row``), so
 * the two drifted apart. One shell keeps them in lockstep.
 *
 * The two list variants differ only in two intentional, meaningful ways,
 * both supplied by the caller:
 *  - ``meta``: the chips on the meta line. Both put the type chip FIRST so
 *    the "creates law / non-binding" distinction reads at a glance.
 *  - ``outcome``: a vote shows a filled result pill (a decision happened);
 *    an initiative shows an outlined status badge (a lifecycle state).
 *
 * Neutrality: only factual content flows through; no editorial framing.
 */
export function LawRow({
  href,
  dateLong,
  dateShort,
  legislatureTag = 'XV',
  title,
  meta,
  outcome,
  outcomeAriaLabel,
}: {
  href: Route;
  /** Desktop left-column date, e.g. ``26 d'abr. 2026`` (dateStyle medium). */
  dateLong: string;
  /** Mobile right-stack date, e.g. ``26 abr`` (no year in the current year). */
  dateShort: string;
  /** Legislature tag shown next to the mobile date. Defaults to ``XV``. */
  legislatureTag?: string;
  /** Plain title text; rendered through {@link AnnotatedText} for jargon tooltips. */
  title: string;
  /** Meta-line chips (type, proposer, topics, id, summary). Type chip should come first. */
  meta: ReactNode;
  /** Right-column indicator: a result pill (votes) or a status badge (initiatives). */
  outcome: ReactNode;
  /** Accessible label for the outcome column (e.g. the result/status text). */
  outcomeAriaLabel?: string;
}) {
  return (
    <li style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
      <Link
        href={href}
        className="law-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          padding: '14px 0 0',
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'baseline',
        }}
      >
        {/* Desktop-only left date column. On mobile the date lives in the
            right stack so the title gets the full row width. */}
        <span
          className="hidden sm:inline-block tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {dateLong}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}
          >
            <AnnotatedText text={title} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {meta}
          </div>
        </div>
        <span
          aria-label={outcomeAriaLabel}
          style={{
            flex: 'none',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            gap: 6,
            textAlign: 'right',
          }}
        >
          {/* Mobile-only date (top of the right stack). Desktop's date lives
              in its own left column instead. */}
          <span
            className="sm:hidden tabular"
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {legislatureTag} · {dateShort}
          </span>
          {outcome}
        </span>
      </Link>
    </li>
  );
}
