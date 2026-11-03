import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import type { GroupAssets } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * The way into the party comparison, which lives in Dades (StatsAssets), so
 * there is one comparison and not two that drift apart. Each party links to
 * its own "Béns" tab, largest first.
 */
export async function AssetsByParty({ groups }: { groups: GroupAssets[] }) {
  if (groups.length === 0) return null;
  const t = await getTranslations('assets');

  return (
    <section className="assets-compare" aria-labelledby="assets-compare-title">
      <h2 id="assets-compare-title" className="assets-index__title">
        {t('compare_title')}
      </h2>
      <p className="assets-index__dek">{t('compare_short_dek')}</p>
      <Link href={'/stats#bens' as Route} className="assets-compare__cta">
        {t('compare_to_stats')} <ArrowRight size={15} aria-hidden="true" />
      </Link>
      <ul className="assets-compare__parties" aria-label={t('compare_parties_aria')}>
        {groups.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/groups/${g.slug}?tab=bens` as Route}
              className="assets-compare__party"
              style={{ ['--party' as string]: g.color_hex ?? 'var(--ink-3)' }}
            >
              <span className="assets-compare__dot" aria-hidden="true" />
              {displayGroupShort(g.name_short)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
