import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight } from '@/components/icons';

import { CandidacyCard, ConstituencyGrid, ConstituencyPicker, ElectionsHeader } from '@/components/Elections';
import { api, type CandidaciesStatus, type ConstituencyCandidacies } from '@/lib/api';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ circ?: string }>;
}): Promise<Metadata> {
  const t = await getTranslations('elections');
  const { circ } = await searchParams;
  const status = circ ? await api.elections.candidacies().catch(() => null) : null;
  if (circ && status?.constituencies.some((c) => c.constituency === circ)) {
    // One constituency: its own title and share image (app/eleccions/og).
    const locale = await getLocale();
    const image = `/eleccions/og?circ=${encodeURIComponent(circ)}&l=${locale}`;
    return {
      title: t('meta_title_circ', { circ }),
      description: t('meta_description_circ', { circ }),
      openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image', images: [image] },
    };
  }
  return { title: t('meta_title'), description: t('meta_description') };
}

/**
 * Who stands in each constituency for the Congress on 29 November 2026: the
 * official lists, as the BOE publishes them (backend app/ingest/candidacies.py),
 * in the order the provincial electoral board gives them. Until the BOE has
 * them, when they will appear and how many deputies each constituency elects.
 */
export default async function ElectionsPage({ searchParams }: { searchParams: Promise<{ circ?: string }> }) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const status: CandidaciesStatus | null = await api.elections.candidacies().catch(() => null);
  const known = new Set(status?.constituencies.map((c) => c.constituency) ?? []);

  // The constituency asked for, else the province the reader picked on the
  // deputies page (same cookie), else none.
  const asked = (await searchParams).circ;
  let remembered: string | null = null;
  try {
    const raw = (await cookies()).get('hp_prov')?.value;
    remembered = raw ? decodeURIComponent(raw) : null;
  } catch {
    remembered = null;
  }
  const circ = asked && known.has(asked) ? asked : !asked && remembered && known.has(remembered) ? remembered : null;
  const data: ConstituencyCandidacies | null =
    circ && status?.stage ? await api.elections.constituency(circ).catch(() => null) : null;
  const seats = status?.constituencies.find((c) => c.constituency === circ)?.seats ?? null;
  const published = status?.published_on
    ? new Date(`${status.published_on}T12:00:00Z`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      })
    : null;
  const deputies = data ? data.lists.flatMap((l) => l.candidates).filter((c) => c.person_id).length : 0;

  return (
    <div className="pacts">
      <ElectionsHeader active="candidacies" title={t('cand_title')} intro={t('cand_intro')} />

      {status && <ConstituencyPicker constituencies={status.constituencies} current={circ} />}

      {status && !status.stage && (
        <section className="epending" aria-labelledby="epending-title">
          <h2 id="epending-title">{t('pending_title')}</h2>
          <p>{t('pending_body')}</p>
          <ol className="epending__steps">
            <li>
              <b>{t('pending_step1_date')}</b> {t('pending_step1')}
            </li>
            <li>
              <b>{t('pending_step2_date')}</b> {t('pending_step2')}
            </li>
          </ol>
          {circ && seats && <p className="epending__circ">{t('pending_circ', { circ, n: seats })}</p>}
        </section>
      )}

      {data && data.stage && (
        <section className="ecirc" aria-labelledby="ecirc-title">
          <div className="ecirc__head">
            <h2 id="ecirc-title" className="ecirc__title">
              {data.constituency}
            </h2>
            <p className="ecirc__facts tabular">
              {t('seats', { n: data.seats })} · {t('lists_count', { n: data.lists.length })}
              {deputies > 0 && ` · ${t('deputies_count', { n: deputies })}`}
            </p>
          </div>
          <p className={data.stage === 'proclaimed' ? 'estage estage--final' : 'estage'}>
            <span>{data.stage === 'proclaimed' ? t('stage_proclaimed') : t('stage_presented')}</span>
            {published && <span className="estage__date">{t('published_on', { date: published })}</span>}
            {data.boe_id && (
              <a
                href={`https://www.boe.es/diario_boe/txt.php?id=${data.boe_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="estage__boe"
              >
                {t('boe_link')} <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            )}
          </p>
          <p className="ecirc__note">{t('order_note')}</p>
          <div className="ccards">
            {data.lists.map((l) => (
              <CandidacyCard key={l.ballot_order} list={l} />
            ))}
          </div>
        </section>
      )}

      {status && !circ && <ConstituencyGrid constituencies={status.constituencies} />}
      {status && circ && (
        <p className="eother">
          <Link href={'/eleccions?circ=totes' as Route} className="eother__link">
            {t('see_all_constituencies')}
          </Link>
        </p>
      )}

      {!status && <p className="pacts-empty">{t('unavailable')}</p>}
    </div>
  );
}
