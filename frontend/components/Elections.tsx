import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowUpRight } from '@/components/icons';

import { Countdown } from '@/components/ElectionNews';
import type { CandidacyList, ConstituencySummary } from '@/lib/api';
import { daysToElection, electionParty } from '@/lib/electionParties';

/**
 * The 29 November 2026 election section: /eleccions (candidacies) and
 * /pactes (press on pacts), one header and two tabs.
 */
export async function ElectionsHeader({
  active,
  title,
  intro,
}: {
  active: 'candidacies' | 'vote' | 'results' | 'pacts';
  title: string;
  intro: string;
}) {
  const t = await getTranslations('elections');
  const tabs = [
    { key: 'candidacies', href: '/eleccions', label: t('tab_candidacies') },
    { key: 'vote', href: '/eleccions/el-teu-vot', label: t('tab_vote') },
    { key: 'results', href: '/eleccions/resultats', label: t('tab_results') },
    { key: 'pacts', href: '/pactes', label: t('tab_pacts') },
  ] as const;
  return (
    <>
      <header className="pacts-hero">
        <div className="pacts-hero__text">
          <p className="pacts-hero__eyebrow">{t('eyebrow')}</p>
          <h1>{title}</h1>
          <p className="pacts-hero__intro">{intro}</p>
        </div>
        <Countdown />
      </header>
      <nav className="etabs" aria-label={t('tabs_aria')}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href as Route}
            className={tab.key === active ? 'etab etab--on' : 'etab'}
            aria-current={tab.key === active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** Home: the way into the election section, above everything else. */
export async function ElectionsBanner() {
  const t = await getTranslations('elections');
  const n = daysToElection();
  if (n < -3) return null;
  return (
    // From polling day on, the way in is the count.
    <Link href={(n <= 0 ? '/eleccions/resultats' : '/eleccions') as Route} className="ebanner">
      <span className="ebanner__mark tabular" aria-hidden="true">
        29N
      </span>
      <span className="ebanner__text">
        <span className="ebanner__title">{t('banner_title')}</span>
        <span className="ebanner__sub">
          {n > 0 ? t('banner_days', { n }) : n === 0 ? t('banner_today') : t('banner_after')}
          {' · '}
          {t('banner_sub')}
        </span>
      </span>
      <ArrowRight size={18} aria-hidden="true" className="ebanner__arrow" />
    </Link>
  );
}

/** A plain GET form: choose a constituency without any JavaScript. */
export async function ConstituencyPicker({
  constituencies,
  current,
  action = '/eleccions',
  extra,
}: {
  constituencies: ConstituencySummary[];
  current: string | null;
  /** The page it opens: the candidacies, or the results. */
  action?: string;
  /** Other parameters to keep (the results' replay step). */
  extra?: Record<string, string>;
}) {
  const t = await getTranslations('elections');
  return (
    <form action={action} method="get" className="cpick">
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor="cpick-select" className="cpick__label">
        {t('pick_label')}
      </label>
      <div className="cpick__row">
        <select id="cpick-select" name="circ" defaultValue={current ?? ''} className="cpick__select">
          {!current && (
            <option value="" disabled>
              {t('pick_placeholder')}
            </option>
          )}
          {constituencies.map((c) => (
            <option key={c.constituency} value={c.constituency}>
              {c.constituency}
            </option>
          ))}
        </select>
        <button type="submit" className="cpick__go">
          {t('pick_cta')}
        </button>
      </div>
    </form>
  );
}

/** Every constituency, with its seats and, once published, its lists. */
export async function ConstituencyGrid({ constituencies }: { constituencies: ConstituencySummary[] }) {
  const t = await getTranslations('elections');
  return (
    <section aria-labelledby="cgrid-title">
      <h2 id="cgrid-title" className="esec-title">
        {t('all_title')}
      </h2>
      <ul className="cgrid">
        {constituencies.map((c) => (
          <li key={c.constituency}>
            <Link href={`/eleccions?circ=${encodeURIComponent(c.constituency)}` as Route} className="cgrid__item">
              <span className="cgrid__name">{c.constituency}</span>
              <span className="cgrid__meta tabular">
                {t('seats', { n: c.seats })}
                {c.lists > 0 && ` · ${t('lists_count', { n: c.lists })}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PREVIEW = 5;

/** One list as the BOE prints it, in the board's order. */
export async function CandidacyCard({ list }: { list: CandidacyList }) {
  const t = await getTranslations('elections');
  const party = electionParty(list.party);
  const first = list.candidates.slice(0, PREVIEW);
  const rest = list.candidates.slice(PREVIEW);
  return (
    <article className="ccard" style={party ? { ['--party' as string]: party.color } : undefined}>
      <header className="ccard__head">
        <span className="ccard__order tabular" aria-label={t('order_aria', { n: list.ballot_order })}>
          {list.ballot_order}
        </span>
        <div className="ccard__names">
          <h3 className="ccard__acronym">{list.acronym ?? list.name}</h3>
          {list.acronym && <p className="ccard__name">{list.name}</p>}
        </div>
        {party && (
          <span className="party-tag">
            <span className="party-tag__dot" aria-hidden="true" />
            {party.name}
          </span>
        )}
      </header>
      <ol className="ccard__list">
        {first.map((c, i) => (
          <CandidateRow key={`${c.name}-${i}`} name={c.name} personId={c.person_id} n={i + 1} />
        ))}
      </ol>
      {rest.length > 0 && (
        <details className="ccard__more">
          <summary>{t('show_all', { n: list.candidates.length })}</summary>
          <ol className="ccard__list" start={PREVIEW + 1}>
            {rest.map((c, i) => (
              <CandidateRow
                key={`${c.name}-${i}`}
                name={c.name}
                personId={c.person_id}
                n={PREVIEW + i + 1}
              />
            ))}
          </ol>
        </details>
      )}
      {list.substitutes.length > 0 && (
        <details className="ccard__more ccard__more--subs">
          <summary>{t('substitutes', { n: list.substitutes.length })}</summary>
          <ol className="ccard__list">
            {list.substitutes.map((c, i) => (
              <CandidateRow key={`${c.name}-${i}`} name={c.name} personId={c.person_id} n={i + 1} />
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

async function CandidateRow({
  name,
  personId,
  n,
}: {
  name: string;
  personId: number | null;
  n: number;
}) {
  const t = await getTranslations('elections');
  return (
    <li className="crow">
      <span className="crow__n tabular" aria-hidden="true">
        {n}
      </span>
      <span className="crow__body">
        <span className="crow__name">{name}</span>
        {personId && (
          <Link href={`/persons/${personId}` as Route} className="crow__dep">
            {t('deputy_badge')}
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        )}
      </span>
    </li>
  );
}
