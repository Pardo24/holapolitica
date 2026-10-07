import Form from 'next/form';
import Link from 'next/link';
import type { Route } from 'next';
import {
  CalendarClock,
  ChevronRight,
  Gauge,
  Hourglass,
  Landmark,
  Search,
  Tags,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import { BottomSheet } from '@/components/BottomSheet';
import { GroupBadge } from '@/components/GroupBadge';
import type { AudienceCount, ParliamentaryGroupSummary, Topic } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * "Where do I start?" for the laws list.
 *
 * Five hundred laws in reverse order of tabling is a list for someone who
 * already knows what they are looking for. Most people opening the tab
 * don't; they have a question shaped like one of these:
 *
 *   what has just been voted          -> sort=voted
 *   which votes were close            -> sort=close
 *   laws about a subject              -> topic sheet
 *   what a party has tabled           -> proposer sheet
 *   what is still in progress         -> result=pending
 *   what affects people like me       -> audience sheet
 *
 * With nothing chosen, the six questions are a grid of tiles: the
 * dashboard. Once one is chosen the grid shrinks to a row of chips, so the
 * results move up to where the thumb is and the other questions stay one
 * tap away.
 *
 * Neutrality: the lenses are orderings and filters the reader picks. None
 * of them is a selection we made ("important laws", "controversial laws");
 * "close" is arithmetic on the published tally, nothing more.
 *
 * Phone and desktop alike. The search box is the phone's: on a desktop
 * the filter toolbar stays in view below with its own search, as before,
 * so this one is hidden there rather than offered twice.
 */

export interface LawsLensState {
  sort: 'recent' | 'voted' | 'close';
  results: string[];
  topicSlugs: string[];
  groupSlugs: string[];
  audiences: string[];
  q: string;
}

export interface LawsLensLabels {
  search_placeholder: string;
  search_submit: string;
  eyebrow: string;
  voted_title: string;
  voted_sub: string;
  close_title: string;
  close_sub: string;
  topic_title: string;
  topic_sub: string;
  party_title: string;
  party_sub: string;
  pending_title: string;
  pending_sub: string;
  audience_title: string;
  audience_sub: string;
  government: string;
  clear: string;
  close: string;
}

type Patch = Partial<Record<'sort' | 'result' | 'topic_slug' | 'proposing_group_slug' | 'audience', string | null>>;

export function LawsLens({
  state,
  topics,
  groups,
  audiences,
  locale,
  labels,
}: {
  state: LawsLensState;
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  audiences: AudienceCount[];
  locale: string;
  labels: LawsLensLabels;
}) {
  const current: Record<string, string> = {};
  if (state.sort !== 'recent') current.sort = state.sort;
  if (state.results.length) current.result = state.results.join(',');
  if (state.topicSlugs.length) current.topic_slug = state.topicSlugs.join(',');
  if (state.groupSlugs.length) current.proposing_group_slug = state.groupSlugs.join(',');
  if (state.audiences.length) current.audience = state.audiences.join(',');
  if (state.q) current.q = state.q;

  /** The current URL with some parameters replaced; page always resets. */
  const href = (patch: Patch): Route => {
    const next = new URLSearchParams(current);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return (s ? `/lleis?${s}` : '/lleis') as Route;
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
  const named = (values: string[], name: (v: string) => string, fallback: string) =>
    values.length === 0 ? fallback : values.length === 1 ? name(values[0]!) : `${name(values[0]!)} +${values.length - 1}`;

  const onlyPending = state.results.length === 1 && state.results[0] === 'pending';
  const anyActive = Object.keys(current).some((k) => k !== 'q');
  const compact = anyActive;

  // ── The sheets' contents ─────────────────────────────────────────────
  const topicSheet = (
    <ul className="sheet-list">
      {themes.map((tp) => {
        const Icon = topicIcon(tp.icon);
        const on = state.topicSlugs.includes(tp.slug);
        return (
          <li key={tp.slug}>
            <Link href={href({ topic_slug: tp.slug })} aria-current={on ? 'page' : undefined}>
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
          href={href({ proposing_group_slug: 'govern' })}
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
            href={href({ proposing_group_slug: g.slug })}
            aria-current={state.groupSlugs.includes(g.slug) ? 'page' : undefined}
          >
            <span style={{ flex: 'none', display: 'inline-flex', width: 34, justifyContent: 'center' }}>
              <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={g.logo_url} size="sm" link={false} />
            </span>
            <span className="sheet-row__label">
              {displayGroupShort(g.name_short)}
              <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.3 }}>
                {g.name_long}
              </span>
            </span>
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
          </Link>
        </li>
      ))}
    </ul>
  );

  const audienceSheet = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {audiences.map((a) => {
        const on = state.audiences.includes(a.tag);
        return (
          <Link
            key={a.tag}
            href={href({ audience: a.tag })}
            aria-current={on ? 'page' : undefined}
            className="lens-tag"
          >
            {a.tag}
            <span className="tabular" style={{ color: on ? 'inherit' : 'var(--ink-3)', fontSize: 12 }}>
              {a.count}
            </span>
          </Link>
        );
      })}
    </div>
  );

  // ── The six lenses ───────────────────────────────────────────────────
  type Lens =
    | { key: string; Icon: LucideIcon; title: string; sub: string; on: boolean; to: Route }
    | { key: string; Icon: LucideIcon; title: string; sub: string; on: boolean; sheet: React.ReactNode; sheetTitle: string };

  const lenses: Lens[] = [
    {
      key: 'voted',
      Icon: CalendarClock,
      title: labels.voted_title,
      sub: labels.voted_sub,
      on: state.sort === 'voted',
      to: href({ sort: state.sort === 'voted' ? null : 'voted' }),
    },
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
      title: state.topicSlugs.length ? named(state.topicSlugs, topicName, '') : labels.topic_title,
      sub: labels.topic_sub,
      on: state.topicSlugs.length > 0,
      sheet: topicSheet,
      sheetTitle: labels.topic_title,
    },
    {
      key: 'party',
      Icon: Landmark,
      title: state.groupSlugs.length ? named(state.groupSlugs, groupName, '') : labels.party_title,
      sub: labels.party_sub,
      on: state.groupSlugs.length > 0,
      sheet: partySheet,
      sheetTitle: labels.party_title,
    },
    {
      key: 'pending',
      Icon: Hourglass,
      title: labels.pending_title,
      sub: labels.pending_sub,
      on: onlyPending,
      to: href({ result: onlyPending ? null : 'pending' }),
    },
    ...(audiences.length
      ? [
          {
            key: 'audience',
            Icon: UsersRound,
            title: state.audiences.length ? named(state.audiences, (s) => s, '') : labels.audience_title,
            sub: labels.audience_sub,
            on: state.audiences.length > 0,
            sheet: audienceSheet,
            sheetTitle: labels.audience_title,
          } satisfies Lens,
        ]
      : []),
  ];

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
      {/* Search first: a reader who knows the name of the law should not
          have to pick a lens to type it. */}
      <Form action="/lleis" className="lens-search" role="search">
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
        {lenses.map((l) => {
          const cls = `lens-tile${compact ? ' lens-tile--chip' : ''}${l.on ? ' lens-tile--on' : ''}`;
          return 'to' in l ? (
            <Link key={l.key} href={l.to} className={cls} aria-current={l.on ? 'true' : undefined}>
              {tileBody(l)}
            </Link>
          ) : (
            <BottomSheet
              key={l.key}
              trigger={tileBody(l)}
              triggerClassName={cls}
              title={l.sheetTitle}
              closeLabel={labels.close}
            >
              {l.sheet}
            </BottomSheet>
          );
        })}
        {compact && (
          <Link href={'/lleis' as Route} className="lens-tile lens-tile--chip lens-tile--clear">
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
            <span className="lens-tile__title">{labels.clear}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
