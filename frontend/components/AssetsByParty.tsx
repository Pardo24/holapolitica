import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import type { GroupAssets } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * The parties side by side, largest first: a table, so nothing reads as a
 * ranking, and where it compares it compares groups, never people. Shares are
 * of the deputies whose declaration we could read.
 */
export async function AssetsByParty({ groups, locale }: { groups: GroupAssets[]; locale: string }) {
  if (groups.length === 0) return null;
  const t = await getTranslations('assets');
  const eur = (n: number) =>
    n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  const share = (n: number, read: number) => (
    <td className="tabular">
      {read ? `${Math.round((n / read) * 100)}%` : '-'}
      <small>{t('party_n_of', { n, total: read })}</small>
    </td>
  );
  const source = (g: GroupAssets, key: string) =>
    share(g.income_sources.find((s) => s.key === key)?.people ?? 0, g.read);

  return (
    <section className="assets-compare" aria-labelledby="assets-compare-title">
      <h2 id="assets-compare-title" className="assets-index__title">
        {t('compare_title')}
      </h2>
      <p className="assets-index__dek">{t('compare_dek')}</p>
      <div className="assets-compare__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('compare_party')}</th>
              <th scope="col">{t('source_public')}</th>
              <th scope="col">{t('source_private')}</th>
              <th scope="col">{t('source_party')}</th>
              <th scope="col">{t('source_rental')}</th>
              <th scope="col">{t('party_two_homes')}</th>
              <th scope="col">{t('party_with_shares')}</th>
              <th scope="col">{t('party_with_loans')}</th>
              <th scope="col">{t('compare_median')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.slug}>
                <th scope="row">
                  <Link
                    href={`/groups/${g.slug}?tab=bens` as Route}
                    className="assets-compare__party"
                    style={{ ['--party' as string]: g.color_hex ?? 'var(--ink-3)' }}
                  >
                    <span className="assets-compare__dot" aria-hidden="true" />
                    {displayGroupShort(g.name_short)}
                  </Link>
                </th>
                {source(g, 'public')}
                {source(g, 'private')}
                {source(g, 'party')}
                {source(g, 'rental')}
                {share(g.with_two_or_more_homes, g.read)}
                {share(g.with_shares, g.read)}
                {share(g.with_loans, g.read)}
                <td className="tabular">
                  {g.income_median != null ? eur(g.income_median) : '-'}
                  <small>{t('compare_comparable', { n: g.income_comparable })}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="assets-compare__foot">{t('compare_foot')}</p>
    </section>
  );
}
