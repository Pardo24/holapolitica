import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronDown, Info } from '@/components/icons';

import type { GroupAssetsDetail, MemberAssets, PartyCount } from '@/lib/api';

type T = Awaited<ReturnType<typeof getTranslations<'assets'>>>;

export const INCOME_SOURCES = [
  'public',
  'party',
  'private',
  'self_employed',
  'rental',
  'capital',
  'pension',
  'unspecified',
] as const;

/**
 * What a party's deputies declared on taking the seat: where their income
 * comes from first, how much after and with its warning, then each deputy by
 * name. No total of anyone's wealth and no order by money, for the reasons in
 * backend app/services/asset_summary.py.
 */
export async function GroupAssetsPanel({ data, locale }: { data: GroupAssetsDetail; locale: string }) {
  const t = await getTranslations('assets');
  const eur = (n: number) =>
    n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const peopleIn = (rows: PartyCount[], key: string) => rows.find((r) => r.key === key)?.people ?? 0;
  const ofRead = { read: data.read };

  return (
    <section className="party-assets" style={{ ['--party' as string]: data.color_hex ?? 'var(--ink-3)' }}>
      <h2 className="h-title">{t('party_title')}</h2>
      <p className="party-assets__dek">{t('party_intro', { read: data.read, members: data.members })}</p>
      <details className="assets__how">
        <summary>
          <Info size={15} aria-hidden="true" />
          {t('how_title')}
          <ChevronDown size={15} aria-hidden="true" className="assets__chev" />
        </summary>
        <ul>
          <li>{t('party_note_income')}</li>
          <li>{t('party_note_no_rank')}</li>
          <li>{t('note_source')}</li>
        </ul>
      </details>

      {data.read > 0 && (
        <div className="party-assets__grid">
          <div className="party-assets__card">
            <h3 className="party-assets__h3">{t('party_sources_title')}</h3>
            <p className="party-assets__note">{t('party_sources_note')}</p>
            <Bars
              total={data.read}
              rows={INCOME_SOURCES.map((key) => ({
                key,
                label: t(`source_${key}`),
                people: peopleIn(data.income_sources, key),
              })).filter((r) => r.people > 0)}
              t={t}
            />
          </div>

          <div className="party-assets__card">
            <h3 className="party-assets__h3">{t('party_bands_title')}</h3>
            <p className="party-assets__note">{t('party_bands_note')}</p>
            <Bars
              total={data.income_comparable}
              rows={data.income_bands.map((b) => ({ key: b.key, label: t(`band_${b.key}`), people: b.people }))}
              t={t}
            />
            <p className="party-assets__median">
              {data.income_median != null ? (
                <>
                  <strong>{t('party_median', { amount: eur(data.income_median) })}</strong>{' '}
                  {t('party_median_note', { n: data.income_comparable, read: data.read })}
                </>
              ) : (
                t('party_no_median')
              )}
            </p>
          </div>

          <div className="party-assets__card">
            <h3 className="party-assets__h3">{t('party_holdings_title')}</h3>
            <dl className="party-tiles">
              <Tile label={t('party_with_property')} n={data.with_property} of={t('party_of', ofRead)} />
              <Tile label={t('party_two_homes')} n={data.with_two_or_more_homes} of={t('party_of', ofRead)} />
              <Tile label={t('party_with_shares')} n={data.with_shares} of={t('party_of', ofRead)} />
              <Tile label={t('party_with_loans')} n={data.with_loans} of={t('party_of', ofRead)} />
            </dl>
          </div>
        </div>
      )}

      <h2 className="party-assets__h2">{t('party_people_title')}</h2>
      <p className="party-assets__note">{t('party_people_note')}</p>
      <ul className="party-people">
        {data.people.map((p) => (
          <Person key={p.person_id} p={p} locale={locale} t={t} />
        ))}
      </ul>
    </section>
  );
}

function Bars({
  rows,
  total,
  t,
}: {
  rows: { key: string; label: string; people: number }[];
  total: number;
  t: T;
}) {
  return (
    <ul className="party-bars">
      {rows.map((r) => (
        <li key={r.key} className="party-bars__row">
          <span>{r.label}</span>
          <span className="party-bars__n tabular">{t('party_n_of', { n: r.people, total })}</span>
          <span className="party-bars__track" aria-hidden="true">
            <span className="party-bars__fill" style={{ width: `${total ? (r.people / total) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tile({ label, n, of }: { label: string; n: number; of: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="tabular">
        {n} <small>{of}</small>
      </dd>
    </div>
  );
}

function Person({ p, locale, t }: { p: MemberAssets; locale: string; t: T }) {
  const eur = (n: number | null) =>
    n == null ? null : n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  const counts = p.properties;
  const property = [
    counts.homes > 0 && t('party_homes', { n: counts.homes }),
    counts.storage > 0 && t('party_storage', { n: counts.storage }),
    counts.land > 0 && t('party_land', { n: counts.land }),
    counts.commercial > 0 && t('party_commercial', { n: counts.commercial }),
    counts.company > 0 && t('party_company', { n: counts.company }),
    counts.other > 0 && t('party_other', { n: counts.other }),
  ].filter(Boolean);

  return (
    <li>
      <div className="party-person">
        <Link href={`/persons/${p.person_id}?tab=qui-es#bens` as Route} className="party-person__name">
          {p.full_name}
        </Link>
        {p.constituency && <span className="party-person__where">{p.constituency}</span>}
        {p.declared_on == null ? (
          <p className="party-person__fact">{t('party_unread')}</p>
        ) : (
          <>
            {p.income.length > 0 && (
              <ul className="party-person__income">
                {p.income.map((row, i) => (
                  <li key={i}>
                    <span className="party-person__concept">{row.concept ?? t('income_other')}</span>
                    <span className="party-person__amount tabular">{row.as_written ?? eur(row.amount)}</span>
                    <span className="party-person__source">{t(`source_${row.source}`)}</span>
                  </li>
                ))}
              </ul>
            )}
            {property.length > 0 && <p className="party-person__fact">{property.join(' · ')}</p>}
            {p.shares.length > 0 && (
              <p className="party-person__fact">{t('party_shares_list', { list: p.shares.join(' · ') })}</p>
            )}
            {(p.loans > 0 || p.other_debts) && (
              <p className="party-person__fact">
                {p.loans > 0 ? t('party_loans', { n: p.loans }) : t('party_other_debts')}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
