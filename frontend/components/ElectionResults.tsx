import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { SeatSum, type SumParty } from '@/components/ElectionResultsClient';
import type { ResultConstituency, ResultList, ResultSnapshot } from '@/lib/api';
import { electionParty } from '@/lib/electionParties';
import { HEMI_H, HEMI_W, SEAT_R, hemicycleSeats } from '@/lib/hemicycle';

/**
 * The election-night results (app/eleccions/resultats): the hemicycle, the
 * national table, a seat counter and each constituency, from one snapshot
 * of the count (backend app/services/election_results.py).
 *
 * Lists are ordered by seats, then votes: the page never places parties on
 * a left-right axis of its own.
 */

/** Greys for lists outside lib/electionParties.ts, so they stay apart. */
const OTHER = ['#8a8f99', '#a9adb5', '#6c717b', '#c0c3c9'];

/** One colour per national list for the whole page: the party's, or the
 *  next grey in national order. */
export function colorsFor(snapshot: ResultSnapshot): Map<string, string> {
  let grey = 0;
  return new Map(
    snapshot.parties.map((p) => [
      p.key,
      electionParty(p.party)?.color ?? OTHER[grey++ % OTHER.length]!,
    ]),
  );
}

/** The name readers know: the party's for the 29-N lists; 2023's SUMAR was
 *  SUMAR (Frente Amplio is its parties' 2026 list). */
export function listLabel(list: Pick<ResultList, 'party' | 'acronym'>, election: string): string {
  if (list.party === 'frente-amplio' && election !== '2026-11') return 'Sumar';
  return electionParty(list.party)?.name ?? list.acronym;
}

const MAJORITY = 176;

function fmt(n: number, locale: string, digits = 0): string {
  return n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Counted %, turnout, time of the data, provisional or official. */
export async function ResultsStatus({ snapshot }: { snapshot: ResultSnapshot }) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const at = new Date(snapshot.taken_at);
  const time = snapshot.official
    ? at.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })
    : at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return (
    <div className="rstatus">
      <p className={snapshot.official ? 'rstatus__badge rstatus__badge--final' : 'rstatus__badge'}>
        {snapshot.official ? t('res_official') : t('res_provisional')}
      </p>
      <div className="rstatus__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.counted_pct}>
        <span style={{ width: `${snapshot.counted_pct}%` }} />
      </div>
      <p className="rstatus__facts tabular">
        <b>{t('res_counted', { pct: fmt(snapshot.counted_pct, locale, 2) })}</b>
        <span>{t('res_turnout', { pct: fmt(snapshot.turnout_pct, locale, 2) })}</span>
        <span>{t(snapshot.official ? 'res_updated_day' : 'res_updated', { time })}</span>
      </p>
    </div>
  );
}

/** 350 dots, each list one wedge, largest first from the left. */
export async function ResultsHemicycle({ snapshot }: { snapshot: ResultSnapshot }) {
  const t = await getTranslations('elections');
  const n = snapshot.seats_total || 350;
  const seats = hemicycleSeats(n);
  const withSeats = snapshot.parties.filter((p) => p.seats > 0);
  const colors = colorsFor(snapshot);
  let i = 0;
  const groups = withSeats.map((p) => {
    const xy = seats.slice(i, i + p.seats);
    i += p.seats;
    return { key: p.key, color: colors.get(p.key)!, xy };
  });
  const empty = seats.slice(i);
  const parts = withSeats.map((p) => `${listLabel(p, snapshot.election)} ${p.seats}`).join(', ');
  return (
    <figure className="rhemi">
      <svg viewBox={`0 0 ${HEMI_W} ${HEMI_H}`} role="img" aria-label={t('res_hemi_aria', { n, parts })}>
        {groups.map((g) => (
          <g key={g.key} fill={g.color}>
            {g.xy.map((s) => (
              <circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={SEAT_R} />
            ))}
          </g>
        ))}
        <g fill="none" stroke="var(--rule-strong)">
          {empty.map((s) => (
            <circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={SEAT_R - 0.5} />
          ))}
        </g>
        <line x1={HEMI_W / 2} x2={HEMI_W / 2} y1={2} y2={HEMI_H - 72} className="rhemi__majority" />
      </svg>
      <figcaption className="rhemi__caption">{t('res_majority', { n: MAJORITY })}</figcaption>
    </figure>
  );
}

function Change({ list, newLabel }: { list: ResultList; newLabel: string }) {
  if (list.prev_seats == null) return list.seats > 0 ? <span className="rchg rchg--new">{newLabel}</span> : null;
  const d = list.seats - list.prev_seats;
  if (d === 0) return <span className="rchg">=</span>;
  return <span className={d > 0 ? 'rchg rchg--up' : 'rchg rchg--down'}>{d > 0 ? `+${d}` : `−${-d}`}</span>;
}

/** Seats, change against 2023, vote share and votes, by list. */
export async function PartyResults({ snapshot, compare }: { snapshot: ResultSnapshot; compare: boolean }) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  // Every list with a seat or 1% of the vote; the rest as one row.
  const shown = snapshot.parties.filter((p) => p.seats > 0 || p.pct >= 1);
  const rest = snapshot.parties.filter((p) => !shown.includes(p));
  const restVotes = rest.reduce((a, p) => a + p.votes, 0);
  const restPct = rest.reduce((a, p) => a + p.pct, 0);
  const colors = colorsFor(snapshot);
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th scope="col">{t('res_col_party')}</th>
            <th scope="col" className="num">{t('res_col_seats')}</th>
            {compare && <th scope="col" className="num">{t('res_col_change')}</th>}
            <th scope="col" className="num">%</th>
            <th scope="col" className="num rtable__votes">{t('res_col_votes')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.key}>
              <th scope="row">
                <span className="rtable__dot" style={{ background: colors.get(p.key) }} aria-hidden="true" />
                <span className="rtable__name">{listLabel(p, snapshot.election)}</span>
              </th>
              <td className="num rtable__seats tabular">{p.seats}</td>
              {compare && (
                <td className="num">
                  <Change list={p} newLabel={t('res_new')} />
                </td>
              )}
              <td className="num tabular">{fmt(p.pct, locale, 2)}</td>
              <td className="num tabular rtable__votes">{fmt(p.votes, locale)}</td>
            </tr>
          ))}
          {rest.length > 0 && (
            <tr className="rtable__quiet">
              <th scope="row">{t('res_others')}</th>
              <td className="num tabular">0</td>
              {compare && <td />}
              <td className="num tabular">{fmt(restPct, locale, 2)}</td>
              <td className="num tabular rtable__votes">{fmt(restVotes, locale)}</td>
            </tr>
          )}
          <tr className="rtable__quiet">
            <th scope="row">{t('res_blank')}</th>
            <td />
            {compare && <td />}
            <td className="num tabular">{fmt(snapshot.blank_pct, locale, 2)}</td>
            <td className="num tabular rtable__votes">{fmt(snapshot.blank, locale)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export async function ResultsSeatSum({ snapshot }: { snapshot: ResultSnapshot }) {
  const t = await getTranslations('elections');
  const colors = colorsFor(snapshot);
  const parties: SumParty[] = snapshot.parties
    .filter((p) => p.seats > 0)
    .map((p) => ({ key: p.key, label: listLabel(p, snapshot.election), color: colors.get(p.key)!, seats: p.seats }));
  return (
    <SeatSum
      parties={parties}
      majority={MAJORITY}
      labels={{
        title: t('res_sum_title'),
        hint: t('res_sum_hint', { n: MAJORITY }),
        total: { one: t('res_sum_total', { n: 1 }).replace('1', '#'), other: t('res_sum_total', { n: 2 }).replace('2', '#') },
        yes: t('res_sum_yes'),
        no: t('res_sum_no', { n: '{n}' }),
        clear: t('res_sum_clear'),
      }}
    />
  );
}

/** Every constituency: its seats split by list, the leader's colour first. */
export async function ConstituencyResultsGrid({
  snapshot,
  hrefFor,
}: {
  snapshot: ResultSnapshot;
  hrefFor: (name: string) => string;
}) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const colorByKey = colorsFor(snapshot);
  return (
    <ul className="rgrid">
      {snapshot.constituencies.map((c) => (
        <li key={c.ine}>
          <Link href={hrefFor(c.name) as Route} className="rgrid__item">
            <span className="rgrid__name">{c.name}</span>
            <span className="rgrid__seats" aria-hidden="true">
              {c.lists
                .filter((l) => l.seats > 0)
                .map((l) => (
                  <span key={l.key} style={{ flex: l.seats, background: colorByKey.get(l.key) ?? OTHER[0] }} />
                ))}
            </span>
            <span className="rgrid__meta tabular">
              {t('seats', { n: c.seats })} · {t('res_counted', { pct: fmt(c.counted_pct, locale, 0) })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One constituency: lists, votes, seats, and who those seats elect. */
export async function ConstituencyResults({
  constituency: c,
  snapshot,
}: {
  constituency: ResultConstituency;
  snapshot: ResultSnapshot;
}) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const colorByKey = colorsFor(snapshot);
  const lists = c.lists.filter((l) => l.seats > 0 || l.pct >= 1);
  const anyElected = lists.some((l) => l.elected?.length);
  return (
    <section className="rcirc" aria-labelledby="rcirc-title">
      <div className="ecirc__head">
        <h2 id="rcirc-title" className="ecirc__title">
          {c.name}
        </h2>
        <p className="ecirc__facts tabular">
          {t('seats', { n: c.seats })} ·{' '}
          {t('res_circ_facts', { counted: fmt(c.counted_pct, locale, 2), turnout: fmt(c.turnout_pct, locale, 2) })}
        </p>
      </div>
      <ol className="rcirc__lists">
        {lists.map((l) => (
          <li key={l.key + l.acronym} className="rcirc__list" style={{ ['--party' as string]: colorByKey.get(l.key) ?? OTHER[0] }}>
            <div className="rcirc__row">
              <span className="rcirc__name">{l.acronym}</span>
              <span className="rcirc__pct tabular">{fmt(l.pct, locale, 2)}%</span>
              <span className="rcirc__seats tabular">{t('seats', { n: l.seats })}</span>
            </div>
            <div className="rcirc__bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, l.pct)}%` }} />
            </div>
            {l.elected && l.elected.length > 0 && (
              <p className="rcirc__elected">
                {l.elected.map((e, i) => (
                  <span key={e.name}>
                    {i > 0 && ', '}
                    {e.person_id ? <Link href={`/persons/${e.person_id}` as Route}>{e.name}</Link> : e.name}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
      {anyElected && <p className="rnote">{t('res_elected_note')}</p>}
    </section>
  );
}
