import Form from 'next/form';
import Link from 'next/link';
import type { Route } from 'next';
import {
  CalendarDays,
  ChevronRight,
  Gauge,
  Landmark,
  MessagesSquare,
  Scale,
  Search,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react';

import { BottomSheet } from '@/components/BottomSheet';
import { GroupBadge } from '@/components/GroupBadge';
import type { ParliamentaryGroupSummary, Topic } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * "Where do I start?" for every vote: the /lleis lens, for /votes.
 *
 * The full record is thousands of rows, newest first. The lenses are the
 * questions people bring to it: the closest votes, a subject, who tabled
 * it, only what makes law, only positions (motions and PNL), the last
 * sitting. Tiles when nothing is chosen, a chip row once something is, so
 * the results move up to the thumb.
 *
 * Same neutrality as the laws lens: orderings and filters the reader
 * picks, nothing selected by us. "Close" is arithmetic on the tally.
 */
export interface VotesLensState {
  sort: 'recent' | 'close';
  topicSlugs: string[];
  groupSlugs: string[];
  lawOnly: boolean;
  positionsOnly: boolean;
  date: string | null;
  q: string;
  /** Other params to carry through untouched (legislature, result). */
  keep: Record<string, string>;
}

export interface VotesLensLabels {
  search_placeholder: string;
  search_submit: string;
  eyebrow: string;
  close_title: string;
  close_sub: string;
  topic_title: string;
  topic_sub: string;
  party_title: string;
  party_sub: string;
  laws_title: string;
  laws_sub: string;
  positions_title: string;
  positions_sub: string;
  session_title: string;
  session_sub: string;
  government: string;
  clear: string;
  close: string;
}

type Patch = Partial<
  Record<'sort' | 'topic_slug' | 'proposing_group_slug' | 'law' | 'positions' | 'date_from' | 'date_to', string | null>
>;

export function VotesLens({
  state,
  topics,
  groups,
  lastSessionDate,
  locale,
  labels,
}: {
  state: VotesLensState;
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  /** YYYY-MM-DD of the latest sitting, for the "last plenary" lens. */
  lastSessionDate: string | null;
  locale: string;
  labels: VotesLensLabels;
}) {
  const current: Record<string, string> = { ...state.keep };
  if (state.sort !== 'recent') current.sort = state.sort;
  if (state.topicSlugs.length) current.topic_slug = state.topicSlugs.join(',');
  if (state.groupSlugs.length) current.proposing_group_slug = state.groupSlugs.join(',');
  if (state.lawOnly) current.law = '1';
  if (state.positionsOnly) current.positions = '1';
  if (state.date) {
    current.date_from = state.date;
    current.date_to = state.date;
  }
  if (state.q) current.q = state.q;

  const href = (patch: Patch): Route => {
    const next = new URLSearchParams(current);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return (s ? `/votes?${s}` : '/votes') as Route;
  };

  const themes = topics.filter((tp) => tp.kind !== 'sdg');
  const topicName = (slug: string) => {
    const tp = topics.find((x) => x.slug === slug);
    return tp ? pickTopicName(tp, locale) : slug;
  };
  const groupName = (slug: string) => {
    if (slug === 'govern') return labels.government;
    const g = groups.find((x) => x.slug === slug);
    return g ? displayGroupShort(g.name_short) : slug;
  };
  const named = (values: string[], name: (v: string) => string) =>
    values.length === 1 ? name(values[0]!) : `${name(values[0]!)} +${values.length - 1}`;

  const onSession = state.date != null && state.date === lastSessionDate;
  const anyActive =
    state.sort !== 'recent' ||
    state.topicSlugs.length > 0 ||
    state.groupSlugs.length > 0 ||
    state.lawOnly ||
    state.positionsOnly ||
    state.date != null;

  const topicSheet = (
    <ul className="sheet-list">
      {themes.map((tp) => {
        const Icon = topicIcon(tp.icon);
        return (
          <li key={tp.slug}>
            <Link
              href={href({ topic_slug: state.topicSlugs.includes(tp.slug) ? null : tp.slug })}
              aria-current={state.topicSlugs.includes(tp.slug) ? 'page' : undefined}
            >
              <span
                className="sheet-row__icon"
                aria-hidden="true"
                style={{
                  background: `color-mix(in oklch, ${tp.color_hex ?? 'var(--ink-3)'} 16%, var(--paper))`,
                  color: tp.color_hex ?? 'var(--ink-2)',
                }}
              >
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <span className="sheet-row__label">{pickTopicName(tp, locale)}</span>
              <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const partySheet = (
    <ul className="sheet-list">
      <li>
        <Link
          href={href({ proposing_group_slug: state.groupSlugs.includes('govern') ? null : 'govern' })}
          aria-current={state.groupSlugs.includes('govern') ? 'page' : undefined}
        >
          <span className="sheet-row__icon" aria-hidden="true">
            <Landmark size={17} strokeWidth={1.9} />
          </span>
          <span className="sheet-row__label">{labels.government}</span>
          <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
        </Link>
      </li>
      {groups.map((g) => (
        <li key={g.slug}>
          <Link
            href={href({ proposing_group_slug: state.groupSlugs.includes(g.slug) ? null : g.slug })}
            aria-current={state.groupSlugs.includes(g.slug) ? 'page' : undefined}
          >
            <span style={{ flex: 'none', display: 'inline-flex', width: 34, justifyContent: 'center' }}>
              <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={g.logo_url} size="sm" link={false} />
            </span>
            <span className="sheet-row__label">{displayGroupShort(g.name_short)}</span>
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
          </Link>
        </li>
      ))}
    </ul>
  );

  type Lens =
    | { key: string; Icon: LucideIcon; title: string; sub: string; on: boolean; to: Route }
    | { key: string; Icon: LucideIcon; title: string; sub: string; on: boolean; sheet: React.ReactNode; sheetTitle: string };

  const lenses: Lens[] = [
    {
      key: 'close',
      Icon: Gauge,
      title: labels.close_title,
      sub: labels.close_sub,
      on: state.sort === 'close',
      to: href({ sort: state.sort === 'close' ? null : 'close' }),
    },
    {
      key: 'topic',
      Icon: Tags,
      title: state.topicSlugs.length ? named(state.topicSlugs, topicName) : labels.topic_title,
      sub: labels.topic_sub,
      on: state.topicSlugs.length > 0,
      sheet: topicSheet,
      sheetTitle: labels.topic_title,
    },
    {
      key: 'party',
      Icon: Landmark,
      title: state.groupSlugs.length ? named(state.groupSlugs, groupName) : labels.party_title,
      sub: labels.party_sub,
      on: state.groupSlugs.length > 0,
      sheet: partySheet,
      sheetTitle: labels.party_title,
    },
    {
      key: 'laws',
      Icon: Scale,
      title: labels.laws_title,
      sub: labels.laws_sub,
      on: state.lawOnly,
      // The two "kind" lenses exclude each other.
      to: href({ law: state.lawOnly ? null : '1', positions: null }),
    },
    {
      key: 'positions',
      Icon: MessagesSquare,
      title: labels.positions_title,
      sub: labels.positions_sub,
      on: state.positionsOnly,
      to: href({ positions: state.positionsOnly ? null : '1', law: null }),
    },
    ...(lastSessionDate
      ? [
          {
            key: 'session',
            Icon: CalendarDays,
            title: labels.session_title,
            sub: labels.session_sub,
            on: onSession,
            to: href(
              onSession
                ? { date_from: null, date_to: null }
                : { date_from: lastSessionDate, date_to: lastSessionDate },
            ),
          } satisfies Lens,
        ]
      : []),
  ];

  const compact = anyActive;
  const ordered = compact ? [...lenses].sort((x, y) => Number(y.on) - Number(x.on)) : lenses;
  const tileBody = (l: Lens) => (
    <>
      <span className="lens-tile__icon" aria-hidden="true">
        <l.Icon size={18} strokeWidth={1.9} />
      </span>
      <span className="lens-tile__text">
        <span className="lens-tile__title">{l.title}</span>
        {!compact && <span className="lens-tile__sub">{l.sub}</span>}
      </span>
    </>
  );

  return (
    <div className="laws-lens">
      <Form action="/votes" className="lens-search" role="search">
        {Object.entries(current)
          .filter(([k]) => k !== 'q')
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <Search size={17} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input
          type="search"
          name="q"
          defaultValue={state.q}
          placeholder={labels.search_placeholder}
          aria-label={labels.search_placeholder}
          enterKeyHint="search"
        />
        <button type="submit" className="visually-hidden">
          {labels.search_submit}
        </button>
      </Form>

      {!compact && (
        <div className="eyebrow" style={{ margin: '18px 0 10px' }}>
          {labels.eyebrow}
        </div>
      )}

      <div className={compact ? 'lens-row no-scrollbar' : 'lens-grid'}>
        {ordered.map((l) => {
          const cls = `lens-tile${compact ? ' lens-tile--chip' : ''}${l.on ? ' lens-tile--on' : ''}`;
          return 'to' in l ? (
            <Link key={l.key} href={l.to} className={cls} aria-current={l.on ? 'true' : undefined}>
              {tileBody(l)}
            </Link>
          ) : (
            <BottomSheet key={l.key} trigger={tileBody(l)} triggerClassName={cls} title={l.sheetTitle} closeLabel={labels.close}>
              {l.sheet}
            </BottomSheet>
          );
        })}
        {compact && (
          <Link href={'/votes' as Route} className="lens-tile lens-tile--chip lens-tile--clear">
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
            <span className="lens-tile__title">{labels.clear}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
