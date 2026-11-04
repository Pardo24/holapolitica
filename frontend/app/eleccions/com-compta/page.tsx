import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/el-teu-vot.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';

import { ConstituencyPicker, ElectionsHeader } from '@/components/Elections';
import { VoteGuideBar, VoteGuideFooter } from '@/components/VoteGuide';
import { api } from '@/lib/api';
import results2023 from '@/lib/data/results2023.json';
import { electionParty } from '@/lib/electionParties';
import { inGuide } from '@/lib/voteGuide';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('weight_meta_title'), description: t('weight_intro') };
}

interface List2023 {
  acronym: string;
  name: string;
  party: string | null;
  votes: number;
  pct: number;
  seats: number;
}
interface Constituency2023 {
  seats: number;
  census: number;
  voters: number;
  valid: number;
  blank: number;
  lists: List2023[];
}
const RESULTS_2023 = results2023 as Record<string, Constituency2023>;

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'i', 'per', 'por', 'con', 'en', 'a']);

/** "SORIA ¡YA!" -> "Soria ¡Ya!": the ministry prints list names in capitals. */
function titleCase(name: string): string {
  return name
    .toLocaleLowerCase('es')
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('es'))))
    .join(' ');
}

/** The name a reader knows: the party's; 2023's SUMAR as Sumar (Frente
 *  Amplio is its parties' 2026 list); a local list by its initials when
 *  they say something (PACMA, CUP-PR), else by its name (SY = Soria ¡Ya!). */
function listName(l: List2023): string {
  if (l.party === 'frente-amplio') return 'Sumar';
  const party = electionParty(l.party)?.name;
  if (party) return party;
  return l.acronym.replace(/\W/g, '').length >= 4 ? l.acronym : titleCase(l.name);
}

/**
 * Step 4 of the vote guide: what one vote weighs in each constituency, from
 * its seats and the official 2023 result (lib/data/results2023.json, from
 * the ministry's files).
 *
 * Facts only: seats, the 3% floor, votes per seat, and which list won a seat
 * with fewest votes and which missed one with most. The page never says
 * what to vote; it says how the count works where you vote.
 */
export default async function HowYourVoteCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ circ?: string; guia?: string }>;
}) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const status = await api.elections.candidacies().catch(() => null);
  const seats2026 = new Map(status?.constituencies.map((c) => [c.constituency, c.seats]) ?? []);

  const { circ: asked, guia } = await searchParams;
  const guide = inGuide(guia);
  let remembered: string | null = null;
  try {
    const raw = (await cookies()).get('hp_prov')?.value;
    remembered = raw ? decodeURIComponent(raw) : null;
  } catch {
    remembered = null;
  }
  const circ = asked && RESULTS_2023[asked] ? asked : remembered && RESULTS_2023[remembered] ? remembered : null;
  const data = circ ? RESULTS_2023[circ]! : null;
  const fmt = (n: number, digits = 0) =>
    n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  // The facts of one constituency.
  let facts: React.ReactNode = null;
  if (circ && data) {
    const now = seats2026.get(circ) ?? data.seats;
    const withSeat = data.lists.filter((l) => l.seats > 0);
    const lowestSeat = withSeat.reduce<List2023 | null>((a, l) => (!a || l.votes < a.votes ? l : a), null);
    const highestWithout = data.lists
      .filter((l) => l.seats === 0)
      .reduce<List2023 | null>((a, l) => (!a || l.votes > a.votes ? l : a), null);
    facts = (
      <section className="tvot" aria-labelledby="tvot-title">
        <h3 id="tvot-title" className="tvot__title">
          {t('weight_seats', { circ, n: now })}
        </h3>
        {now !== data.seats && <p className="tvot__note">{t('weight_seats_change', { n: data.seats })}</p>}
        <dl className="tvot__facts">
          <div>
            <dt>{t('weight_valid')}</dt>
            <dd className="tabular">{fmt(data.valid)}</dd>
          </div>
          <div>
            <dt>{t('weight_threshold')}</dt>
            <dd className="tabular">{fmt(Math.ceil(data.valid * 0.03))}</dd>
          </div>
          <div>
            <dt>{t('weight_per_seat')}</dt>
            <dd className="tabular">{fmt(Math.round(data.valid / data.seats))}</dd>
          </div>
        </dl>
        <ul className="tvot__edges">
          {lowestSeat && (
            <li>
              {t('weight_lowest_seat', { list: listName(lowestSeat), pct: fmt(lowestSeat.pct, 1) })}
            </li>
          )}
          {highestWithout && (
            <li>
              {t('weight_highest_without', { list: listName(highestWithout), pct: fmt(highestWithout.pct, 1) })}
            </li>
          )}
        </ul>
        <h4 className="tvot__sub">{t('weight_table_title')}</h4>
        <ol className="tvot__lists">
          {data.lists.map((l) => (
            <li key={l.acronym} style={{ ['--party' as string]: electionParty(l.party)?.color ?? 'var(--ink-3)' }}>
              <span className="tvot__name">{listName(l)}</span>
              <span className="tvot__bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, l.pct)}%` }} />
              </span>
              <span className="tvot__pct tabular">{fmt(l.pct, 1)}%</span>
              <span className="tvot__seats tabular">{t('seats', { n: l.seats })}</span>
            </li>
          ))}
        </ol>
        <p className="tvot__source">{t('weight_source')}</p>
      </section>
    );
  }

  return (
    <div className="pacts">
      {guide && <VoteGuideBar step={4} />}
      <ElectionsHeader active="vote" title={t('weight_title')} intro={t('weight_intro')} bare={guide} />
      <ConstituencyPicker
        constituencies={Object.entries(RESULTS_2023)
          .map(([c, d]) => ({ constituency: c, seats: seats2026.get(c) ?? d.seats, lists: d.lists.length }))
          .sort((a, b) => a.constituency.localeCompare(b.constituency, locale))}
        current={circ}
        action="/eleccions/com-compta"
        extra={guide ? { guia: '1' } : undefined}
      />
      {facts}
      {/* "You've finished" only once there is something finished: with no
          constituency picked the page is still empty. */}
      {guide && circ && <VoteGuideFooter step={4} circ={circ} />}
    </div>
  );
}
