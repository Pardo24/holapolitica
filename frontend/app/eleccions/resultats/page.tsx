import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/resultats.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ConstituencyPicker, ElectionsHeader } from '@/components/Elections';
import {
  ConstituencyResults,
  ConstituencyResultsGrid,
  PartyResults,
  ResultsHemicycle,
  ResultsSeatSum,
  ResultsStatus,
} from '@/components/ElectionResults';
import { ResultsAutoRefresh } from '@/components/ElectionResultsClient';
import { api, type ElectionResults, type ResultSnapshot } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('res_meta_title'), description: t('res_meta_description') };
}

/**
 * Election night, 29 November 2026: the Ministry of the Interior's count as
 * it comes in (backend /elections/2026/results), refreshed every 30 seconds
 * until the result is official. Before the first count, the 2023 result as
 * reference.
 *
 * With CANDIDACIES_PREVIEW_ELECTION=2023-07 (server-only, never in
 * production) the page shows the 2023 night replayed from its polling
 * stations, one step at a time with ?pas=N, to check it with real numbers.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ circ?: string; pas?: string }>;
}) {
  const t = await getTranslations('elections');
  const { circ: asked, pas } = await searchParams;
  const preview = Boolean(process.env.CANDIDACIES_PREVIEW_ELECTION);
  const step = preview && pas && /^\d+$/.test(pas) ? Number(pas) : null;

  const live: ElectionResults | null = await api.elections.results(step).catch(() => null);
  // Nothing counted yet: the previous election, to compare with on the night.
  const reference: ResultSnapshot | null =
    live && !live.snapshot ? ((await api.elections.results(null, '2023-07').catch(() => null))?.snapshot ?? null) : null;
  const snapshot = live?.snapshot ?? reference;
  const circ = snapshot?.constituencies.find((c) => c.name === asked) ?? null;
  const base = '/eleccions/resultats';
  const hrefFor = (name: string) =>
    `${base}?circ=${encodeURIComponent(name)}${step ? `&pas=${step}` : ''}#circ` as Route;

  return (
    <div className="pacts">
      <ElectionsHeader active="results" title={t('res_title')} intro={t('res_intro')} />

      {!live && <p className="epending">{t('res_unavailable')}</p>}

      {preview && live && live.steps.length > 0 && (
        <nav className="rsim tabular" aria-label={t('res_sim', { n: live.step ?? 0, total: live.steps.length })}>
          {live.step && live.step > 1 && (
            <Link href={`${base}?pas=${live.step - 1}` as Route}>{t('res_sim_prev')}</Link>
          )}
          <span>{t('res_sim', { n: live.step ?? 0, total: live.steps.length })}</span>
          {live.step && live.step < live.steps.length && (
            <Link href={`${base}?pas=${live.step + 1}` as Route}>{t('res_sim_next')}</Link>
          )}
        </nav>
      )}

      {live && !live.snapshot && (
        <section className="epending" aria-labelledby="rempty-title">
          <h2 id="rempty-title">{t('res_empty_title')}</h2>
          <p>{t('res_empty_body')}</p>
        </section>
      )}

      {snapshot && (
        <>
          {reference ? (
            <div className="rref">
              <h2 className="esec-title">{t('res_ref_title')}</h2>
              <p className="rnote">{t('res_ref_note')}</p>
            </div>
          ) : (
            <ResultsStatus snapshot={snapshot} />
          )}
          {/* The count moves until it is official; a paused replay step does not. */}
          {!reference && !snapshot.official && !step && <ResultsAutoRefresh />}

          <ResultsHemicycle snapshot={snapshot} />
          <PartyResults snapshot={snapshot} compare={snapshot.election === '2026-11'} />
          <p className="rnote">
            {snapshot.parties.some((p) => p.party === 'frente-amplio') && `${t('res_sumar_note')} `}
            {t('res_source')}
          </p>

          <ResultsSeatSum snapshot={snapshot} />

          <h2 id="circ" className="esec-title rsec">
            {t('res_by_circ')}
          </h2>
          <ConstituencyPicker
            constituencies={snapshot.constituencies.map((c) => ({ constituency: c.name, seats: c.seats, lists: c.lists.length }))}
            current={circ?.name ?? null}
            action={base}
            extra={step ? { pas: String(step) } : undefined}
          />
          {circ ? (
            <>
              <ConstituencyResults constituency={circ} snapshot={snapshot} />
              <p className="rback">
                <Link href={`${base}${step ? `?pas=${step}` : ''}#circ` as Route}>{t('res_all_circ')}</Link>
              </p>
            </>
          ) : (
            <ConstituencyResultsGrid snapshot={snapshot} hrefFor={hrefFor} />
          )}
        </>
      )}
    </div>
  );
}
