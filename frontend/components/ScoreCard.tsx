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
    // Without a row of parties (not voted yet, by assent) the head closes the
    // left column itself, so it needs the bottom space that row gave it.
    <li {...data} className={`vcard vcard--${tone}${groups ? '' : ' vcard--nogroups'}`}>
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
  points,
  amendment = false,
}: {
  label: string;
  /** What this vote was, when it was a step and not the law itself. */
  eyebrow?: string | null;
  /** An amendment's vote: the eyebrow stands out, with a line saying the
   *  result is about a change, not the law (they read as the law). */
  amendment?: boolean;
  tally?: Tally | null;
  note?: string | null;
  date?: string | null;
  href?: Route | null;
  openLabel?: string;
  /** A motion voted point by point: how many passed, and a square per
   *  point in the colour of its result, instead of one tally. */
  points?: { results: string[]; label: string } | null;
}) {
  const t = await getTranslations('lleis');
  let figures: ReactNode = null;
  if (points) {
    const approved = points.results.filter((r) => r === 'approved').length;
    figures = (
      <>
        <span className="vcard__count serif tabular">
          {approved}
          <span className="vcard__dash"> / {points.results.length}</span>
        </span>
        <span className="vcard__note">{points.label}</span>
        <span className="vcard__squares" aria-hidden="true">
          {points.results.map((r, i) => (
            <span key={i} className={`vcard__square vcard__square--${r}`} />
          ))}
        </span>
      </>
    );
  } else if (tally) {
    // The bar spans the whole chamber, so the majority line (176 of 350)
    // sits where it really is.
    const chamber = tally.ayes + tally.noes + tally.abstentions + tally.absent || 350;
    const pct = (n: number) => `${(100 * n) / chamber}%`;
    const margin = Math.abs(tally.ayes - tally.noes);
    const majority = Math.floor(chamber / 2) + 1;
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
          {/* Absences decide close votes as much as abstentions do. */}
          {tally.absent > 0 && ` · ${t('card_absents', { n: tally.absent })}`}
        </span>
        <span className="vcard__bar" title={t('card_majority_title', { n: majority })}>
          <span style={{ width: pct(tally.ayes), background: 'var(--aye)' }} />
          <span style={{ width: pct(tally.abstentions), background: 'var(--abst)' }} />
          <span style={{ width: pct(tally.noes), background: 'var(--no)' }} />
          <i style={{ left: pct(majority) }} />
        </span>
        {/* What the line in the bar is: it was never said. */}
        <span className="vcard__majority">{t('card_majority', { n: majority })}</span>
      </>
    );
  }
  return (
    <>
      {eyebrow && (
        <span className={amendment ? 'vcard__eyebrow vcard__eyebrow--amend' : 'vcard__eyebrow'}>{eyebrow}</span>
      )}
      {amendment && <span className="vcard__amend-hint">{t('card_amend_hint')}</span>}
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

/** Who tabled it, on the card's first line: a motion or a non-legislative
 *  motion is read through who asks for it. The party's logo, or a dot for
 *  the Government. */
export async function ProposerChip({
  slug,
  short,
  color,
}: {
  slug: string | null;
  short: string;
  color?: string | null;
}) {
  return <ProposerChips proposers={[{ slug, short, color }]} />;
}

/** Who tabled it when that is no group of ours nor the Government: the
 *  Senate, a regional parliament, several groups or a list of deputies, as
 *  the Congress writes it. Long ones wrap. */
export async function ProposerText({ text }: { text: string }) {
  const t = await getTranslations('lleis');
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <span className="vcard__by">
      <span className="vcard__by-label">{t('card_proposed_label')}</span>
      <span className="vcard__by-chip vcard__by-chip--text">
        {clean === 'Senado' ? t('card_proposer_senate') : clean}
      </span>
    </span>
  );
}

/** The same, for a text tabled by several groups together: one chip each,
 *  the first three, then how many more. */
export async function ProposerChips({
  proposers,
  more = null,
}: {
  proposers: { slug: string | null; short: string; color?: string | null }[];
  more?: string | null;
}) {
  const t = await getTranslations('lleis');
  return (
    <span className="vcard__by">
      <span className="vcard__by-label">{t('card_proposed_label')}</span>
      {proposers.map(({ slug, short, color }) => {
        const logo = slug ? groupLogoUrl(slug) : null;
        return (
          <span key={slug ?? short} className="vcard__by-chip">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={18} height={18} loading="lazy" decoding="async" />
            ) : (
              <span className="vcard__by-dot" style={{ background: color ?? 'var(--ink)' }} aria-hidden="true" />
            )}
            {short}
          </span>
        );
      })}
      {more && <span className="vcard__by-more">{more}</span>}
    </span>
  );
}
