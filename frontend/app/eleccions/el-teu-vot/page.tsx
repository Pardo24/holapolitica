import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/el-teu-vot.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import { ConstituencyPicker, ElectionsHeader } from '@/components/Elections';
import { api } from '@/lib/api';
import results2023 from '@/lib/data/results2023.json';
import { ELECTION_PARTIES, electionParty } from '@/lib/electionParties';
import { PROGRAMS_2026 } from '@/lib/programs2026';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('vote_meta_title'), description: t('vote_meta_description') };
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
 * "Your vote": the way to decide, in four steps that already exist on the
 * site (the test, the parties compared, who stands where you vote, how your
 * vote counts), and the last of them here: what one vote weighs in each
 * constituency, from its seats and the official 2023 result
 * (lib/data/results2023.json, from the ministry's files).
 *
 * Facts only: seats, the 3% floor, votes per seat, and which list won a seat
 * with fewest votes and which missed one with most. The page never says
 * what to vote; it says how the count works where you vote.
 */
export default async function YourVotePage({ searchParams }: { searchParams: Promise<{ circ?: string }> }) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const status = await api.elections.candidacies().catch(() => null);
  const seats2026 = new Map(status?.constituencies.map((c) => [c.constituency, c.seats]) ?? []);

  const asked = (await searchParams).circ;
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

  const steps = [
    { n: 1, title: t('step1_title'), body: t('step1_body'), href: '/com-et-representen', cta: t('step1_cta') },
    { n: 2, title: t('step2_title'), body: t('step2_body'), href: '/comparar', cta: t('step2_cta') },
    {
      n: 3,
      title: t('step3_title'),
      body: t('step3_body'),
      href: circ ? `/eleccions?circ=${encodeURIComponent(circ)}` : '/eleccions',
      cta: t('step3_cta'),
    },
    { n: 4, title: t('step4_title'), body: t('step4_body'), href: '#com-compta', cta: t('step4_cta') },
  ];

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
      <ElectionsHeader active="vote" title={t('vote_title')} intro={t('vote_intro')} />

      <ol className="vsteps">
        {steps.map((s) => (
          <li key={s.n}>
            <Link href={s.href as Route} className="vsteps__item">
              <span className="vsteps__n" aria-hidden="true">
                {s.n}
              </span>
              <span className="vsteps__text">
                <span className="vsteps__title">{s.title}</span>
                <span className="vsteps__body">{s.body}</span>
                <span className="vsteps__cta">
                  {s.cta} <ArrowRight size={13} aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <h2 id="com-compta" className="esec-title vsec">
        {t('weight_title')}
      </h2>
      <p className="vsec__intro">{t('weight_intro')}</p>
      <ConstituencyPicker
        constituencies={Object.entries(RESULTS_2023)
          .map(([c, d]) => ({ constituency: c, seats: seats2026.get(c) ?? d.seats, lists: d.lists.length }))
          .sort((a, b) => a.constituency.localeCompare(b.constituency, locale))}
        current={circ}
        action="/eleccions/el-teu-vot#com-compta"
      />
      {facts}

      <h2 className="esec-title vsec">{t('programs_title')}</h2>
      <p className="vsec__intro">{t('programs_intro')}</p>
      <ul className="vprog">
        {ELECTION_PARTIES.map((p) => {
          const program = PROGRAMS_2026[p.slug];
          return (
            <li key={p.slug} style={{ ['--party' as string]: p.color }}>
              <span className="vprog__name">{p.name}</span>
              {program ? (
                <a href={program.url} target="_blank" rel="noopener noreferrer" className="vprog__link">
                  {t('program_open')} <ArrowRight size={13} aria-hidden="true" />
                </a>
              ) : (
                <span className="vprog__pending">{t('program_pending')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
