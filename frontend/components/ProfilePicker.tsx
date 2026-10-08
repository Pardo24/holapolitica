import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

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
  featured,
}: {
  /** profile key → how many laws touch it; null when unavailable. */
  counts: Map<string, number> | null;
  /** The section's own heading and lede (off on the index page). */
  heading?: boolean;
  /** Only these situations (the home's most common ones), with a link to
   *  all of them. */
  featured?: readonly string[];
}) {
  const t = await getTranslations('profiles');
  const available = counts ? PROFILES.filter((p) => (counts.get(p.key) ?? 0) > 0) : [...PROFILES];
  const shown = featured ? available.filter((p) => featured.includes(p.key)) : available;
  if (shown.length === 0) return null;
  const moreCount = available.length - shown.length;

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
      {featured && moreCount > 0 && (
        <Link href={'/et-afecta' as Route} className="profiles__more">
          {t('see_all', { n: available.length })}
          <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
