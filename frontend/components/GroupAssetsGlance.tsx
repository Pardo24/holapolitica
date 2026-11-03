import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import type { GroupAssets } from '@/lib/api';

/**
 * The top of a party's page: what its deputies declared, in four counts of
 * people and the median of what they wrote down, with the way to the full
 * "Béns" tab. Counts of deputies, never a total of anyone's wealth (backend
 * app/services/asset_summary.py says why).
 */
export async function GroupAssetsGlance({ data, href, locale }: { data: GroupAssets; href: string; locale: string }) {
  const t = await getTranslations('assets');
  const of = t('party_of', { read: data.read });
  const tiles = [
    { label: t('party_with_property'), n: data.with_property },
    { label: t('party_two_homes'), n: data.with_two_or_more_homes },
    ...(data.with_outside_work != null ? [{ label: t('glance_outside_work'), n: data.with_outside_work }] : []),
    { label: t('party_with_shares'), n: data.with_shares },
  ];

  return (
    <section
      className="grp-assets"
      aria-labelledby="grp-assets-title"
      style={{ ['--party' as string]: data.color_hex ?? 'var(--ink-3)' }}
    >
      <div className="grp-assets__head">
        <h2 id="grp-assets-title" className="grp-assets__title">
          {t('glance_title')}
        </h2>
        <p className="grp-assets__dek">{t('glance_intro', { read: data.read, members: data.members })}</p>
      </div>
      <dl className="party-tiles grp-assets__tiles">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dt>{tile.label}</dt>
            <dd className="tabular">
              {tile.n} <small>{of}</small>
            </dd>
          </div>
        ))}
      </dl>
      {data.income_median != null && (
        <p className="grp-assets__median">
          {t('party_median', {
            amount: data.income_median.toLocaleString(locale, {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }),
          })}{' '}
          <span>{t('glance_median_note')}</span>
        </p>
      )}
      <Link href={href as Route} className="grp-assets__link" scroll={false}>
        {t('glance_link')} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
