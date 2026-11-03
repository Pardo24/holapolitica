import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { ScrollToHash } from '@/components/ScrollToHash';
import type { GroupAssets, ParliamentaryGroupSummary, PartyCount } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/** Below this many declarations read, a share is one or two people: say the count. */
const FRAGILE = 10;
/** As in backend app/services/asset_summary.py: no median or bands from fewer. */
const MIN_FOR_MEDIAN = 5;
const BAND_SHADE = [22, 40, 58, 78, 100];

type T = Awaited<ReturnType<typeof getTranslations<'assets'>>>;
type Column = { key: string; label: string; people: (g: GroupAssets) => number | undefined };

/**
 * Dades: what each group's deputies declared on taking the seat, side by
 * side. Every figure is a share of the group's deputies whose declaration we
 * could read, never a sum, and the groups come by seats, never by the figure,
 * so nothing reads as "the richest party". The reasons are in
 * backend app/services/asset_summary.py.
 */
export async function StatsAssets({
  groups,
  allGroups,
  locale,
}: {
  groups: GroupAssets[];
  allGroups: ParliamentaryGroupSummary[];
  locale: string;
}) {
  const shown = groups.filter((g) => g.read > 0);
  if (shown.length === 0) return null;
  const t = await getTranslations('assets');
  const logos = new Map(allGroups.map((g) => [g.slug, g.logo_url] as const));
  const eur = (n: number) =>
    n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const peopleIn = (rows: PartyCount[] | undefined, key: string) =>
    rows ? rows.find((r) => r.key === key)?.people ?? 0 : undefined;
  const read = shown.reduce((n, g) => n + g.read, 0);
  const comparable = shown.reduce((n, g) => n + g.income_comparable, 0);

  const party = (g: GroupAssets) => (
    <Link href={`/groups/${g.slug}?tab=bens` as Route} className="sa-party">
      <GroupBadge slug={g.slug} color={g.color_hex} logoUrl={logos.get(g.slug) ?? null} size="sm" link={false} />
      <span>{displayGroupShort(g.name_short)}</span>
    </Link>
  );

  return (
    <section className="sa" id="bens" aria-labelledby="sa-title">
      <ScrollToHash id="bens" />
      <div className="sa__head">
        <h2 id="sa-title" className="sa__title">{t('stats_title')}</h2>
        <p className="sa__dek">{t('stats_dek')}</p>
      </div>

      <div className="sq-grid">
        <section className="sq-card sq-card--wide" aria-labelledby="sa-property">
          <h3 id="sa-property" className="sq-card__title">{t('stats_property_title')}</h3>
          <p className="sq-card__lede">{t('stats_property_lede')}</p>
          <Matrix
            groups={shown}
            party={party}
            t={t}
            columns={[
              { key: 'any', label: t('party_with_property'), people: (g) => g.with_property },
              { key: 'homes', label: t('party_two_homes'), people: (g) => g.with_two_or_more_homes },
              { key: 'land', label: t('stats_with_land'), people: (g) => peopleIn(g.property_kinds, 'land') },
              { key: 'commercial', label: t('stats_with_commercial'), people: (g) => peopleIn(g.property_kinds, 'commercial') },
              { key: 'company', label: t('stats_with_company'), people: (g) => peopleIn(g.property_kinds, 'company') },
            ]}
          />
          <p className="sq-note">{t('stats_property_note')}</p>
        </section>

        <section className="sq-card sq-card--wide" aria-labelledby="sa-sources">
          <h3 id="sa-sources" className="sq-card__title">{t('stats_sources_title')}</h3>
          <p className="sq-card__lede">{t('stats_sources_lede')}</p>
          <Matrix
            groups={shown}
            party={party}
            t={t}
            // Income from outside politics first: what was asked for, and on a
            // phone the first columns are the ones seen without swiping.
            columns={[
              { key: 'outside', label: t('stats_outside_work'), people: (g) => g.with_outside_work },
              { key: 'rents', label: t('stats_rents'), people: (g) => g.with_rents },
              { key: 'public', label: t('stats_public'), people: (g) => peopleIn(g.income_sources, 'public') },
              { key: 'party', label: t('source_party'), people: (g) => peopleIn(g.income_sources, 'party') },
              { key: 'pension', label: t('source_pension'), people: (g) => peopleIn(g.income_sources, 'pension') },
            ]}
          />
          <p className="sq-note">{t('stats_sources_note')}</p>
        </section>

        <section className="sq-card sq-card--wide" aria-labelledby="sa-amount">
          <h3 id="sa-amount" className="sq-card__title">{t('stats_amount_title')}</h3>
          <p className="sq-card__lede">{t('stats_amount_lede')}</p>
          <ul className="sa-legend">
            {(shown[0]?.income_bands ?? []).map((b, i) => (
              <li key={b.key}>
                <span className="sa-swatch" style={{ ['--shade' as string]: `${BAND_SHADE[i]}%` }} aria-hidden="true" />
                {t(`band_${b.key}` as 'band_under_30k')}
              </li>
            ))}
          </ul>
          <ul className="sa-bands">
            {shown.map((g) => {
              const enough = g.income_comparable >= MIN_FOR_MEDIAN;
              return (
                <li key={g.slug}>
                  {party(g)}
                  {enough ? (
                    <span
                      className="sa-stack"
                      role="img"
                      aria-label={g.income_bands
                        .map((b) => `${t(`band_${b.key}` as 'band_under_30k')}: ${b.people}`)
                        .join(', ')}
                    >
                      {g.income_bands.map((b, i) =>
                        b.people > 0 ? (
                          <span
                            key={b.key}
                            style={{ flexGrow: b.people, ['--shade' as string]: `${BAND_SHADE[i]}%` }}
                          />
                        ) : null,
                      )}
                    </span>
                  ) : (
                    <span className="sa-few">{t('stats_too_few', { n: g.income_comparable })}</span>
                  )}
                  <span className="sa-median tabular">
                    {g.income_median != null ? eur(g.income_median) : '-'}
                    <small>{t('compare_comparable', { n: g.income_comparable })}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="sq-note">{t('stats_amount_note')}</p>
        </section>
      </div>

      <aside className="sa-cant" aria-labelledby="sa-cant">
        <h3 id="sa-cant">{t('stats_cant_title')}</h3>
        <ul>
          <li>{t('stats_cant_wealth')}</li>
          <li>{t('stats_cant_mean')}</li>
          <li>{t('stats_cant_exact', { n: comparable, read })}</li>
          <li>{t('stats_cant_small', { n: FRAGILE })}</li>
        </ul>
        <p>{t('stats_cant_more')}</p>
      </aside>
    </section>
  );
}

/** Groups down, figures across; each cell shaded by its share. */
function Matrix({
  groups,
  columns,
  party,
  t,
}: {
  groups: GroupAssets[];
  columns: Column[];
  party: (g: GroupAssets) => React.ReactNode;
  t: T;
}) {
  return (
    <>
      <p className="sa-swipe">{t('stats_swipe')}</p>
      <div className="sa-matrix">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('compare_party')}</th>
              {columns.map((c) => (
                <th key={c.key} scope="col">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.slug}>
                <th scope="row">{party(g)}</th>
                {columns.map((c) => {
                  const n = c.people(g);
                  if (n == null) return <td key={c.key}>-</td>;
                  const share = n / g.read;
                  return (
                    <td key={c.key} style={{ ['--shade' as string]: `${Math.round(share * 100)}%` }}>
                      {g.read < FRAGILE ? (
                        <span className="sa-cell tabular">{t('party_n_of', { n, total: g.read })}</span>
                      ) : (
                        <>
                          <span className="sa-cell tabular">{Math.round(share * 100)}%</span>
                          <small className="tabular">{t('party_n_of', { n, total: g.read })}</small>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
