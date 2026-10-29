import { getTranslations } from 'next-intl/server';
import { ArrowUpRight } from '@/components/icons';

import type { AssetDeclaration, AssetDeclarationData } from '@/lib/api';

/**
 * A deputy's "Declaraciones de Bienes y Rentas", newest first: each one as
 * the deputy filled it in, in plain words, with the official PDF beside it.
 *
 * Shown one by one and never added up: the form asks no value for homes or
 * land, and a later declaration only lists what changed. Only what passed
 * every check reaches the page (backend app/ingest/congreso/assets.py); for
 * the rest, the PDF.
 */
export async function AssetDeclarations({
  declarations,
  locale,
}: {
  declarations: AssetDeclaration[];
  locale: string;
}) {
  const t = await getTranslations('assets');
  const day = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return (
    <section className="dep-panel assets" aria-labelledby="assets-title">
      <h2 id="assets-title" className="h-title">
        {t('title')}
      </h2>
      <p className="dep-panel__dek">{t('intro')}</p>
      <ul className="assets__notes">
        <li>{t('note_source')}</li>
        <li>{t('note_no_total')}</li>
        <li>{t('note_income')}</li>
      </ul>

      {declarations.map((d, i) => {
        const head = (
          <>
            <span className="assets__date">{t('declared_on', { date: day(d.declared_on) })}</span>
            <span className="assets__kind">{d.sequence === 0 ? t('kind_initial') : t('kind_later')}</span>
          </>
        );
        const body = (
          <>
            {d.status === 'ok' && d.data ? (
              <DeclarationBody data={d.data} locale={locale} t={t} />
            ) : (
              <p className="assets__unread">{d.status === 'pending' ? t('pending') : t('unread')}</p>
            )}
            <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="assets__pdf">
              {t('pdf')} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </>
        );
        // The latest one open; the older ones folded.
        return i === 0 ? (
          <article key={d.pdf_url} className="assets__decl">
            <h3 className="assets__head">{head}</h3>
            {body}
          </article>
        ) : (
          <details key={d.pdf_url} className="assets__decl">
            <summary className="assets__head">{head}</summary>
            {body}
          </details>
        );
      })}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'assets'>>>;

function DeclarationBody({ data, locale, t }: { data: AssetDeclarationData; locale: string; t: T }) {
  const eur = (n: number | null) =>
    n == null ? '' : n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

  const blocks: { key: string; title: string; body: React.ReactNode }[] = [];

  if (data.income.length || data.income_tax_paid != null) {
    blocks.push({
      key: 'income',
      title: t('income_title'),
      body: (
        <dl className="assets__rows">
          {data.income.map((r, i) => (
            <div key={i}>
              <dt>{join(t(`income_${r.kind}`), r.concept)}</dt>
              <dd className="tabular">{r.as_written ?? eur(r.amount)}</dd>
            </div>
          ))}
          {data.income_tax_paid != null && (
            <div>
              <dt>{t('income_tax')}</dt>
              <dd className="tabular">{data.income_tax_as_written ?? eur(data.income_tax_paid)}</dd>
            </div>
          )}
        </dl>
      ),
    });
  }
  if (data.properties.length) {
    blocks.push({
      key: 'properties',
      title: t('properties_title', { n: data.properties.length }),
      body: (
        <ul className="assets__list">
          {data.properties.map((r, i) => (
            <li key={i}>
              <span className="assets__tag">{t(`property_${r.kind}`)}</span>
              {join(r.description, r.location, r.acquired && t('acquired', { date: r.acquired }), r.right)}
            </li>
          ))}
        </ul>
      ),
    });
  }
  // One row per line the deputy filled; rows read before that carry a
  // single total and note instead.
  const deposits =
    data.deposits ??
    (data.deposits_total != null || data.deposits_note
      ? [{ description: data.deposits_note ?? null, amount: data.deposits_total ?? null, as_written: null }]
      : []);
  if (deposits.length) {
    blocks.push({
      key: 'deposits',
      title: t('deposits_title'),
      body: (
        <dl className="assets__rows">
          {deposits.map((r, i) => (
            <div key={i}>
              <dt>{r.description ?? t('deposits_total')}</dt>
              <dd className="tabular">{r.as_written ?? eur(r.amount)}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }
  if (data.securities.length) {
    blocks.push({
      key: 'securities',
      title: t('securities_title'),
      body: (
        <dl className="assets__rows">
          {data.securities.map((r, i) => (
            <div key={i}>
              <dt>{join(t(`security_${r.kind}`), r.description)}</dt>
              <dd className="tabular">{r.as_written ?? eur(r.value)}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }
  if (data.vehicles.length) {
    blocks.push({
      key: 'vehicles',
      title: t('vehicles_title'),
      body: (
        <ul className="assets__list">
          {data.vehicles.map((r, i) => (
            <li key={i}>{join(r.description, r.acquired && t('acquired', { date: r.acquired }))}</li>
          ))}
        </ul>
      ),
    });
  }
  if (data.other_assets.length) {
    blocks.push({
      key: 'other',
      title: t('other_title'),
      body: (
        <dl className="assets__rows">
          {data.other_assets.map((r, i) => (
            <div key={i}>
              <dt>{r.description}</dt>
              <dd className="tabular">{r.as_written ?? eur(r.value)}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }
  if (data.loans.length || data.other_debts) {
    blocks.push({
      key: 'debts',
      title: t('debts_title'),
      body: (
        <>
          {data.loans.length > 0 && (
            <ul className="assets__list">
              {data.loans.map((r, i) => (
                <li key={i}>
                  {join(
                    r.description,
                    r.granted_on && t('granted_on', { date: r.granted_on }),
                    r.amount_as_written || r.amount != null
                      ? t('loan_amount', { amount: r.amount_as_written ?? eur(r.amount) })
                      : null,
                    r.outstanding_as_written || r.outstanding != null
                      ? t('loan_outstanding', { amount: r.outstanding_as_written ?? eur(r.outstanding) })
                      : null,
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.other_debts && <p className="assets__text">{data.other_debts}</p>}
        </>
      ),
    });
  }
  if (data.observations) {
    blocks.push({
      key: 'observations',
      title: t('observations_title'),
      body: <blockquote className="assets__quote">{data.observations}</blockquote>,
    });
  }

  if (!blocks.length) return <p className="assets__unread">{t('empty_form')}</p>;
  return (
    <div className="assets__blocks">
      {blocks.map((b) => (
        <div key={b.key} className="assets__block">
          <h4 className="assets__block-title">{b.title}</h4>
          {b.body}
        </div>
      ))}
    </div>
  );
}
