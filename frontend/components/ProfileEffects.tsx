import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { Sparkles } from 'lucide-react';

import { PROFILES, type ProfileKey } from '@/lib/profiles';

export type ProfileEffectsMap = Record<string, { ca?: string; es?: string }> | null | undefined;

/** The situations a law has a sentence for, in display order, with the text
 *  in the reader's language (Spanish for "en": it is the source). */
export function effectsFor(
  effects: ProfileEffectsMap,
  locale: string,
  first?: string,
): { key: ProfileKey; text: string }[] {
  if (!effects) return [];
  const out: { key: ProfileKey; text: string }[] = [];
  for (const { key } of PROFILES) {
    const e = effects[key];
    const text = e ? ((locale === 'ca' ? e.ca : e.es) ?? e.es ?? e.ca) : undefined;
    if (text) out.push({ key, text });
  }
  if (first) out.sort((a, b) => Number(b.key === first) - Number(a.key === first));
  return out;
}

/**
 * "I a tu, com t'afecta?": what the law's text establishes for each
 * everyday situation it touches, one plain sentence each ("Si vius de
 * lloguer: el contracte ha de durar com a mínim cinc anys").
 *
 * The clearest explanation of a law we have, so it sits on every law card,
 * right under our headline, and in full on the law's page. Facts about the
 * text, never a judgement on whether it is good for the reader. Written by
 * an AI from the text and checked by a second pass
 * (backend app/services/law_profiles.py), hence the sparkle.
 *
 * Renders nothing when the law has no sentence (not read yet, or it touches
 * no situation directly): callers fall back to the summary.
 */
export async function ProfileEffects({
  effects,
  locale,
  max,
  first,
  moreHref,
  id,
}: {
  effects: ProfileEffectsMap;
  locale: string;
  /** Show at most this many; the rest are counted, linking to ``moreHref``. */
  max?: number;
  /** The reader's situation (a situation page): listed first, highlighted. */
  first?: string;
  moreHref?: string;
  id?: string;
}) {
  const items = effectsFor(effects, locale, first);
  if (items.length === 0) return null;
  const t = await getTranslations('profiles');
  const shown = max ? items.slice(0, max) : items;
  const rest = items.length - shown.length;

  return (
    <section className="effects" id={id}>
      <h3 className="effects__head">
        <Sparkles size={13} strokeWidth={2.2} aria-label={t('effects_ai')} />
        {t('effects_title')}
      </h3>
      <ul className="effects__list">
        {shown.map(({ key, text }) => {
          const Icon = PROFILES.find((p) => p.key === key)!.Icon;
          return (
            <li key={key} className={key === first ? 'is-first' : undefined}>
              <span className="effects__icon" aria-hidden="true">
                <Icon size={15} strokeWidth={2} />
              </span>
              <p>
                <strong>{t(`title_${key}` as 'title_jove')}:</strong> {text}
              </p>
            </li>
          );
        })}
      </ul>
      {rest > 0 && moreHref && (
        <Link href={moreHref as Route} className="effects__more">
          {t('effects_more', { n: rest })}
        </Link>
      )}
    </section>
  );
}
