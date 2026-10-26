import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import { stanceLabel } from '@/components/PartyStanceRow';
import { groupLogoUrl } from '@/lib/groupLogos';
import { displayGroupShort } from '@/lib/groups';

/**
 * The list card for anything voted (2026-10-26): a vote (VoteCard), a law
 * (LawCard), and a plenary's items (SessionSheet). One look everywhere:
 *
 *   ┌ what was voted ───────────────┬ scoreboard ┐
 *   │ chips, headline, notes        │ outcome    │
 *   │ who voted what (logo pills)   │ 171 – 170  │
 *   ├ foot: proposer, toggles ──────┴────────────┤
 *   └ an opened toggle spans the whole card ─────┘
 *
 * On a phone: headline, scoreboard, parties, foot. Styled by class
 * (.vcard in globals.css): the lists print twenty of these.
 */

export type ScoreTone = 'approved' | 'rejected' | 'tie' | 'pending';

export function scoreTone(result: string | null | undefined): ScoreTone {
  return result === 'approved' || result === 'rejected' || result === 'tie' ? result : 'pending';
}

export function ScoreCard({
  tone,
  data,
  head,
  score,
  groups,
  foot,
}: {
  tone: ScoreTone;
  /** Attributes a list filter reads (SessionVoteFilter: data-result, data-topics). */
  data?: Record<`data-${string}`, string>;
  head: ReactNode;
  score: ReactNode;
  groups?: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <li {...data} className={`vcard vcard--${tone}`}>
      <div className="vcard__head">{head}</div>
      <div className="vcard__score">{score}</div>
      {groups && <div className="vcard__groups psm">{groups}</div>}
      {foot && <div className="vcard__foot">{foot}</div>}
    </li>
  );
}

export interface Tally {
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
}

/** The scoreboard: the outcome, the count, the margin and the bar against
 *  the absolute majority. Without a tally (not voted yet, by assent, a
 *  motion voted point by point) it says so instead of showing figures. */
export async function ScorePanel({
  label,
  eyebrow,
  tally,
  note,
  date,
  href,
  openLabel,
}: {
  label: string;
  /** What this vote was, when it was a step and not the law itself. */
  eyebrow?: string | null;
  tally?: Tally | null;
  note?: string | null;
  date?: string | null;
  href?: Route | null;
  openLabel?: string;
}) {
  const t = await getTranslations('lleis');
  let figures: ReactNode = null;
  if (tally) {
    // The bar spans the whole chamber, so the majority line (176 of 350)
    // sits where it really is.
    const chamber = tally.ayes + tally.noes + tally.abstentions + tally.absent || 350;
    const pct = (n: number) => `${(100 * n) / chamber}%`;
    const margin = Math.abs(tally.ayes - tally.noes);
    figures = (
      <>
        <span className="vcard__count serif tabular">
          {tally.ayes}
          <span className="vcard__dash" aria-hidden="true">
            {' – '}
          </span>
          <span className="sr-only"> / </span>
          {tally.noes}
        </span>
        <span className="vcard__note tabular">
          {margin > 0 && `${t('card_margin', { n: margin })} · `}
          {t('card_abstentions', { n: tally.abstentions })}
        </span>
        <span className="vcard__bar" aria-hidden="true">
          <span style={{ width: pct(tally.ayes), background: 'var(--aye)' }} />
          <span style={{ width: pct(tally.abstentions), background: 'var(--abst)' }} />
          <span style={{ width: pct(tally.noes), background: 'var(--no)' }} />
          <i style={{ left: pct(Math.floor(chamber / 2) + 1) }} />
        </span>
      </>
    );
  }
  return (
    <>
      {eyebrow && <span className="vcard__eyebrow">{eyebrow}</span>}
      <span className="vcard__result">{label}</span>
      {figures}
      {note && <span className="vcard__note">{note}</span>}
      {date && <span className="vcard__date">{date}</span>}
      {href && openLabel && (
        <Link href={href} className="vcard__open card-open-link">
          {openLabel}
          <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
        </Link>
      )}
    </>
  );
}

export interface StanceGroup {
  slug: string;
  name_short: string;
  color_hex: string | null;
  /** "aye" | "no" | "abstention"; anything else is not a position. */
  choice: string;
  deputies?: number | null;
}

const SIDES = [
  { choice: 'aye', key: 'card_in_favour', color: 'var(--aye)' },
  { choice: 'no', key: 'card_against', color: 'var(--no)' },
  { choice: 'abstention', key: 'card_abstention', color: 'var(--abst)' },
] as const;

/** Who voted what: one row per position, each party a pill with its logo,
 *  short name and deputies, the border in the colour of its vote. Larger
 *  groups first within a row. */
export async function GroupRows({ groups, empty }: { groups: StanceGroup[]; empty?: ReactNode }) {
  const t = await getTranslations('lleis');
  if (groups.length === 0) return <>{empty ?? <p className="vcard__none">{t('card_no_breakdown')}</p>}</>;
  const sorted = [...groups].sort((a, b) => (b.deputies ?? 0) - (a.deputies ?? 0));
  return (
    <>
      {SIDES.map(({ choice, key, color }) => {
        const side = sorted.filter((g) => g.choice === choice);
        if (side.length === 0) return null;
        return (
          <div key={choice} className="vcard__side" style={{ ['--psm-ring' as string]: color }}>
            <span className="vcard__side-label" style={{ color }}>
              {t(key)}
            </span>
            <span className="vcard__marks">
              {side.map((g) => {
                const logo = groupLogoUrl(g.slug);
                return (
                  <span key={g.slug} className="psm-party" title={`${displayGroupShort(g.name_short)} · ${t(key)}`}>
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo}
                        alt=""
                        width={20}
                        height={20}
                        loading="lazy"
                        decoding="async"
                        className="psm-mark psm-mark--logo"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="psm-mark psm-mark--disc"
                        style={{ background: g.color_hex ?? 'var(--ink-3)' }}
                      />
                    )}
                    <span className="psm-label">{stanceLabel(g)}</span>
                    {g.deputies != null && <span className="tabular psm-count">{g.deputies}</span>}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </>
  );
}
