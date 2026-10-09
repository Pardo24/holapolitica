import type { Route } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

import type { InitiativeTopicSlug } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * The visual parts of a law card, shared by every list that shows one.
 *
 * /lleis (LawCard) and the plenary sheet (SessionSheet) used to draw the
 * same thing twice: the laws list as cards with a 19px serif headline and
 * the vote in its own tinted box, the plenary as hairline rows with a
 * 15px headline and a column of figures. One law, two looks, depending on
 * how you arrived. These parts are the single source of the card's frame,
 * headline, vote box and footer, so the two cannot drift apart again.
 *
 * Presentation only: what goes in each slot (which summary, which vote,
 * which outcome wording) stays with the caller, because a list of laws and
 * a day's votes know different things.
 */

/** The card itself. ``data`` carries attributes a list filter reads. */
export function LawCardFrame({
  children,
  data,
}: {
  children: ReactNode;
  data?: Record<`data-${string}`, string>;
}) {
  return (
    <li
      {...data}
      className="law-card"
      style={{
        listStyle: 'none',
        border: '1px solid var(--rule)',
        borderRadius: 16,
        background: 'var(--paper)',
        boxShadow: 'var(--shadow-2)',
        padding: '18px 18px 16px',
        // No overflow clipping: the law-type chip's tooltip rises out of
        // the card. The padding keeps every child clear of the radius.
      }}
    >
      {children}
    </li>
  );
}

/** Line 1: type, topics, and the outcome pushed to the right edge. */
export function LawCardTopLine({ children, outcome }: { children: ReactNode; outcome: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      {children}
      <span style={{ flex: 1 }} />
      {outcome}
    </div>
  );
}

/** The plain-language headline, clamped to three lines. */
export function LawCardHeadline({
  href,
  children,
  size = 'md',
}: {
  href: Route | null;
  children: ReactNode;
  /** "lg": the laws list's big cards, one law per screen on a phone. */
  size?: 'md' | 'lg';
}) {
  const style: CSSProperties = {
    fontSize: size === 'lg' ? 'clamp(21px, 2.6vw, 25px)' : 'clamp(17px, 2.2vw, 20px)',
    fontWeight: 700,
    lineHeight: size === 'lg' ? 1.22 : 1.32,
    color: 'var(--ink)',
    textDecoration: 'none',
    letterSpacing: '-0.01em',
    // A row with no summary falls back to the official title, which can
    // run 70 words. Three lines keep every card scannable.
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
  return (
    <h3 style={{ margin: 0 }}>
      {href ? (
        <Link href={href} className="serif" style={style}>
          {children}
        </Link>
      ) : (
        <span className="serif" style={style}>
          {children}
        </span>
      )}
    </h3>
  );
}

/** The tinted box the vote lives in. */
export function LawCardVoteBox({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 13px',
        borderRadius: 12,
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
      }}
    >
      {children}
    </div>
  );
}

/** Footer: who tabled it and the file number on the left, the way in on
 *  the right. */
export function LawCardFooter({
  children,
  href,
  openLabel,
}: {
  children: ReactNode;
  href: Route | null;
  openLabel: string;
}) {
  return (
    // A band like the one across the top, in the same outcome tint, so
    // the card opens and closes on how it ended (see .law-card-foot).
    <div
      className="law-card-foot"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        fontSize: 12,
        color: 'var(--ink-3)',
      }}
    >
      {children}
      <span style={{ flex: 1 }} />
      {href && (
        <Link
          href={href}
          className="card-open-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--ink-2)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {openLabel}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** The list the cards sit in. */
export const LAW_CARD_LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

/** The band across the top of a big card: the subject, in its colour, and
 *  the outcome, tinted green (approved), red (rejected) or neutral. */
export function LawCardBand({
  topics,
  outcome,
  label,
  locale,
}: {
  topics: InitiativeTopicSlug[] | undefined | null;
  outcome: string | null | undefined;
  label: string;
  locale: string;
}) {
  const topic = (topics ?? []).find((tp) => tp.kind !== 'sdg') ?? topics?.[0] ?? null;
  const TopicIcon = topic ? topicIcon(topic.icon) : null;
  const tone = outcome === 'approved' ? 'aye' : outcome === 'rejected' ? 'no' : 'neutral';
  return (
    <div className={`law-card-band law-card-band--${tone}`}>
      {topic ? (
        <span className="law-card-band__topic" style={{ ['--topic' as string]: topic.color_hex ?? 'var(--ink-3)' }}>
          {TopicIcon && <TopicIcon size={14} strokeWidth={2} aria-hidden="true" />}
          {pickTopicName(topic, locale)}
        </span>
      ) : (
        <span />
      )}
      <span className="law-card-band__verdict">{label}</span>
    </div>
  );
}

/** The small sparkle before a machine-written headline. */
export function AiMark({ label }: { label: string }) {
  return (
    <Sparkles size={15} strokeWidth={2} aria-label={label} role="img" className="law-card-ai">
      <title>{label}</title>
    </Sparkles>
  );
}
