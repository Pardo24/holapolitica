import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { PROFILES } from '@/lib/profiles';

/**
 * "I a tu, què t'afecta?": one big button per everyday situation, each
 * opening the laws with a concrete measure for it.
 *
 * Situations with no law yet are left out (the reading runs in the
 * background); when the counts can't be loaded at all, every situation is
 * offered without a count rather than none.
 */
export async function ProfilePicker({
  counts,
  heading = true,
}: {
  /** profile key → how many laws touch it; null when unavailable. */
  counts: Map<string, number> | null;
  /** The section's own heading and lede (off on the index page). */
  heading?: boolean;
}) {
  const t = await getTranslations('profiles');
  const shown = counts ? PROFILES.filter((p) => (counts.get(p.key) ?? 0) > 0) : PROFILES;
  if (shown.length === 0) return null;

  return (
    <section className="profiles" aria-labelledby={heading ? 'profiles-title' : undefined}>
      {heading && (
        <div className="profiles__head">
          <h2 id="profiles-title">{t('section_title')}</h2>
          <p>{t('section_lede')}</p>
        </div>
      )}
      <ul className="profiles__grid">
        {shown.map(({ key, Icon }) => (
          <li key={key}>
            <Link href={`/et-afecta/${key}` as Route} className="profiles__item">
              <span className="profiles__icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className="profiles__label">{t(`label_${key}` as 'label_jove')}</span>
              {counts && (
                <span className="profiles__count tabular">{t('count', { n: counts.get(key) ?? 0 })}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
